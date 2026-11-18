// Pure WarehouseLimits, DaysOfSupply, LowStockAlert & FIFO ExpiryAlert Engine (Zero Dependencies)

import type { Entitlement, Item, Receipt } from './types';
import type { WarehouseItemBalance } from './stockLedger';
import { isMovementActive, getTotalItemStock } from './stockLedger';
import { evaluateDaysOfSupply, type DaysOfSupplyResult } from './ruleEngine';

export interface LowStockAlert {
  itemId: string;
  itemName: string;
  itemCode: string;
  baseUnit: string;
  totalBalance: number;
  dos: DaysOfSupplyResult;
  severity: 'empty' | 'critical' | 'reorder';
}

/**
 * LowStockAlert: computes dynamic min/critical thresholds via DaysOfSupply
 * (default supplyDays = 7, criticalDays = 3).
 */
export function computeLowStockAlerts(params: {
  items: Item[];
  entitlements: Entitlement[];
  ledger: WarehouseItemBalance[];
  totalStrength: number;
  allowedWarehouses?: string[] | 'ALL';
  supplyDays?: number;
  criticalDays?: number;
}): LowStockAlert[] {
  const entMap = new Map(params.entitlements.map((e) => [e.itemId, e]));
  const supplyDays = params.supplyDays ?? 7;
  const criticalDays = params.criticalDays ?? 3;

  const alerts: LowStockAlert[] = [];
  for (const item of params.items) {
    const totalBalance = getTotalItemStock(params.ledger, item.id, params.allowedWarehouses);
    const dos = evaluateDaysOfSupply(
      totalBalance,
      entMap.get(item.id),
      params.totalStrength,
      item.minQty,
      supplyDays,
      criticalDays
    );
    if (dos.status !== 'healthy') {
      alerts.push({
        itemId: item.id,
        itemName: item.name,
        itemCode: item.code,
        baseUnit: item.baseUnit,
        totalBalance,
        dos,
        severity: dos.status,
      });
    }
  }
  return alerts.sort((a, b) => {
    const rank = { empty: 0, critical: 1, reorder: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

export interface ExpiryAlert {
  receiptRefNo: string;
  warehouse: string;
  itemId: string;
  itemName: string;
  baseUnit: string;
  receiptDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  remainingBatchQty: number;
  status: 'expired' | 'expiringSoon' | 'watch';
}

/**
 * ExpiryAlert (Strict FIFO Allocation):
 * Matches remaining warehouse stock back to newest receipts first (since oldest batches were issued first under FIFO)
 * so only unconsumed batches actually sitting on shelves generate expiry alerts.
 */
export function computeFifoExpiryAlerts(params: {
  receipts: Receipt[];
  ledger: WarehouseItemBalance[];
  asOfDate: string;
  warnDays?: number;
}): ExpiryAlert[] {
  const warnDays = params.warnDays ?? 45;
  const asOfMs = new Date(params.asOfDate).getTime();

  // Map warehouse::itemId -> remaining balance
  const balanceMap = new Map<string, number>();
  for (const row of params.ledger) {
    if (row.balance > 0) {
      balanceMap.set(`${row.warehouse}::${row.itemId}`, row.balance);
    }
  }

  // Group active receipts by warehouse::itemId, sorted DESCENDING by date (FIFO means oldest were issued first,
  // therefore current physical stock comes from the most recent receipts back to older ones until balance is exhausted)
  const grouped = new Map<string, Receipt[]>();
  for (const r of params.receipts) {
    if (!isMovementActive(r.status) || !r.expiryDate) continue;
    const k = `${r.warehouse}::${r.itemId}`;
    const list = grouped.get(k) ?? [];
    list.push(r);
    grouped.set(k, list);
  }

  const alerts: ExpiryAlert[] = [];
  for (const [key, list] of grouped.entries()) {
    let remainingOnShelf = balanceMap.get(key) ?? 0;
    if (remainingOnShelf <= 0) continue;

    // Sort newest first so we walk backward from shelf stock
    const newestFirst = [...list].sort((a, b) => b.date.localeCompare(a.date));
    for (const r of newestFirst) {
      if (remainingOnShelf <= 0) break;
      const onShelfFromBatch = Math.min(remainingOnShelf, r.baseQty);
      remainingOnShelf -= onShelfFromBatch;

      const expMs = new Date(r.expiryDate).getTime();
      if (Number.isNaN(expMs)) continue;
      const daysUntilExpiry = Math.ceil((expMs - asOfMs) / 86400000);

      if (daysUntilExpiry <= warnDays) {
        alerts.push({
          receiptRefNo: r.refNo,
          warehouse: r.warehouse,
          itemId: r.itemId,
          itemName: r.itemName,
          baseUnit: r.unitName,
          receiptDate: r.date,
          expiryDate: r.expiryDate,
          daysUntilExpiry,
          remainingBatchQty: Math.round(onShelfFromBatch * 1000) / 1000,
          status: daysUntilExpiry <= 0 ? 'expired' : daysUntilExpiry <= 15 ? 'expiringSoon' : 'watch',
        });
      }
    }
  }

  return alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}
