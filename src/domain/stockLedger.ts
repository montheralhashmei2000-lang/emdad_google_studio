// Pure StockLedger Engine — computes real-time balances and refillable cylinder states from active movements

import type {
  Adjustment,
  Issue,
  Item,
  MovementStatus,
  OpeningBalance,
  Receipt,
  ReturnRecord,
  Transfer,
} from './types';

const INACTIVE_STATUSES: Set<MovementStatus> = new Set([
  'DRAFT',
  'ORDER',
  'CANCELLED',
  'REJECTED',
]);

export function isMovementActive(status: MovementStatus): boolean {
  return !INACTIVE_STATUSES.has(status);
}

export interface WarehouseItemBalance {
  warehouse: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  baseUnit: string;
  opening: number;
  received: number;
  returnedIn: number;
  transferredIn: number;
  issued: number;
  returnedOut: number;
  transferredOut: number;
  adjusted: number;
  balance: number;
  isRefillable: boolean;
  cylFull: number;
  cylEmpty: number;
  cylInRefill: number;
}

export interface LedgerInput {
  items: Item[];
  warehouses: string[];
  openings: OpeningBalance[];
  receipts: Receipt[];
  issues: Issue[];
  transfers: Transfer[];
  returns: ReturnRecord[];
  adjustments: Adjustment[];
}

let lastLedgerInput: LedgerInput | null = null;
let lastLedgerResult: WarehouseItemBalance[] | null = null;
const ledgerStockLookupCache = new WeakMap<WarehouseItemBalance[], Map<string, number>>();

export function computeStockLedger(input: LedgerInput): WarehouseItemBalance[] {
  if (
    lastLedgerInput &&
    lastLedgerResult &&
    lastLedgerInput.items === input.items &&
    lastLedgerInput.warehouses.length === input.warehouses.length &&
    lastLedgerInput.warehouses.every((w, idx) => w === input.warehouses[idx]) &&
    lastLedgerInput.openings === input.openings &&
    lastLedgerInput.receipts === input.receipts &&
    lastLedgerInput.issues === input.issues &&
    lastLedgerInput.transfers === input.transfers &&
    lastLedgerInput.returns === input.returns &&
    lastLedgerInput.adjustments === input.adjustments
  ) {
    return lastLedgerResult;
  }

  const itemMap = new Map(input.items.map((i) => [i.id, i]));
  const rows = new Map<string, WarehouseItemBalance>();

  const ensure = (warehouse: string, itemId: string): WarehouseItemBalance | null => {
    if (!warehouse || !itemId) return null;
    const item = itemMap.get(itemId);
    if (!item) return null;
    const key = `${warehouse}::${itemId}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        warehouse,
        itemId,
        itemName: item.name,
        itemCode: item.code,
        baseUnit: item.baseUnit,
        opening: 0,
        received: 0,
        returnedIn: 0,
        transferredIn: 0,
        issued: 0,
        returnedOut: 0,
        transferredOut: 0,
        adjusted: 0,
        balance: 0,
        isRefillable: item.isRefillable,
        cylFull: 0,
        cylEmpty: 0,
        cylInRefill: 0,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const op of input.openings) {
    const row = ensure(op.warehouse, op.itemId);
    if (!row) continue;
    row.opening += op.qty;
    if (row.isRefillable) {
      const full = op.breakdown?.full ?? op.qty;
      const empty = op.breakdown?.empty ?? 0;
      row.cylFull += full;
      row.cylEmpty += empty;
    }
  }

  for (const r of input.receipts) {
    if (!isMovementActive(r.status)) continue;
    const row = ensure(r.warehouse, r.itemId);
    if (!row) continue;
    if (row.isRefillable && r.cylinderAction === 'REFILL') {
      // Neutral total count: empty cylinders return full from refilling
      row.cylInRefill = Math.max(0, row.cylInRefill - r.baseQty);
      row.cylFull += r.baseQty;
    } else if (row.isRefillable && r.cylinderAction === 'RECEIVE_EMPTY') {
      row.received += r.baseQty;
      row.cylEmpty += r.baseQty;
    } else {
      row.received += r.baseQty;
      if (row.isRefillable) row.cylFull += r.baseQty;
    }
  }

  for (const ret of input.returns) {
    if (!isMovementActive(ret.status)) continue;
    const row = ensure(ret.warehouse, ret.itemId);
    if (!row) continue;
    if (ret.type === 'FROM_UNIT') {
      if (ret.condition === 'صالحة') {
        row.returnedIn += ret.baseQty;
        if (row.isRefillable) {
          if (ret.cylinderAction === 'RETURN_EMPTY') row.cylEmpty += ret.baseQty;
          else row.cylFull += ret.baseQty;
        }
      }
    } else if (ret.type === 'TO_SUPPLIER') {
      row.returnedOut += ret.baseQty;
      if (row.isRefillable) {
        if (ret.cylinderAction === 'RETURN_EMPTY') {
          row.cylEmpty = Math.max(0, row.cylEmpty - ret.baseQty);
        } else {
          row.cylFull = Math.max(0, row.cylFull - ret.baseQty);
        }
      }
    }
  }

  for (const tr of input.transfers) {
    if (!isMovementActive(tr.status)) continue;
    const src = ensure(tr.warehouse, tr.itemId);
    if (src) {
      // Deduct from source immediately even while PENDING (in-transit)
      src.transferredOut += tr.baseQty;
      if (src.isRefillable) {
        if (tr.cylinderAction === 'TRANSFER_EMPTY') src.cylEmpty = Math.max(0, src.cylEmpty - tr.baseQty);
        else src.cylFull = Math.max(0, src.cylFull - tr.baseQty);
      }
    }
    // Only enter destination once explicitly RECEIVED (or legacy COMPLETED)
    if (tr.status === 'RECEIVED' || tr.status === 'COMPLETED') {
      const dst = ensure(tr.destWarehouse, tr.itemId);
      if (dst) {
        dst.transferredIn += tr.baseQty;
        if (dst.isRefillable) {
          if (tr.cylinderAction === 'TRANSFER_EMPTY') dst.cylEmpty += tr.baseQty;
          else dst.cylFull += tr.baseQty;
        }
      }
    }
  }

  for (const iss of input.issues) {
    if (!isMovementActive(iss.status)) continue;
    const row = ensure(iss.warehouse, iss.itemId);
    if (!row) continue;
    if (row.isRefillable && iss.cylinderAction === 'EXCHANGE') {
      // Exchange: gives full, receives empty back — total cylinder count remains neutral
      row.cylFull = Math.max(0, row.cylFull - iss.baseQty);
      row.cylEmpty += iss.baseQty;
    } else if (row.isRefillable && iss.cylinderAction === 'CONSUME') {
      // Sent out for external refill
      row.cylEmpty = Math.max(0, row.cylEmpty - iss.baseQty);
      row.cylInRefill += iss.baseQty;
    } else {
      row.issued += iss.baseQty;
      if (row.isRefillable) {
        if (iss.cylinderAction === 'ISSUE_EMPTY') row.cylEmpty = Math.max(0, row.cylEmpty - iss.baseQty);
        else row.cylFull = Math.max(0, row.cylFull - iss.baseQty);
      }
    }
  }

  for (const adj of input.adjustments) {
    if (!isMovementActive(adj.status)) continue;
    const row = ensure(adj.warehouse, adj.itemId);
    if (!row) continue;
    row.adjusted += adj.baseQty;
  }

  const lookupMap = new Map<string, number>();
  for (const row of rows.values()) {
    row.balance =
      row.opening +
      row.received +
      row.returnedIn +
      row.transferredIn -
      row.issued -
      row.returnedOut -
      row.transferredOut +
      row.adjusted;
    lookupMap.set(`${row.warehouse}::${row.itemId}`, row.balance);
  }

  const result = Array.from(rows.values());
  ledgerStockLookupCache.set(result, lookupMap);
  lastLedgerInput = input;
  lastLedgerResult = result;
  return result;
}

export function getWarehouseItemStock(
  ledger: WarehouseItemBalance[],
  warehouse: string,
  itemId: string
): number {
  let lookup = ledgerStockLookupCache.get(ledger);
  if (!lookup) {
    lookup = new Map<string, number>();
    for (const r of ledger) {
      lookup.set(`${r.warehouse}::${r.itemId}`, r.balance);
    }
    ledgerStockLookupCache.set(ledger, lookup);
  }
  return lookup.get(`${warehouse}::${itemId}`) ?? 0;
}

export function getTotalItemStock(
  ledger: WarehouseItemBalance[],
  itemId: string,
  allowedWarehouses?: string[] | 'ALL'
): number {
  return ledger
    .filter(
      (r) =>
        r.itemId === itemId &&
        (!allowedWarehouses || allowedWarehouses === 'ALL' || allowedWarehouses.includes(r.warehouse))
    )
    .reduce((acc, r) => acc + r.balance, 0);
}

export function getScopedBalances(params: {
  ledger: WarehouseItemBalance[];
  warehouse?: string;
  scope?: string[] | 'ALL';
}): WarehouseItemBalance[] {
  return params.ledger.filter((r) => {
    if (params.warehouse && params.warehouse !== 'ALL' && r.warehouse !== params.warehouse) return false;
    if (params.scope && params.scope !== 'ALL' && !params.scope.includes(r.warehouse)) return false;
    return true;
  });
}

export interface StockCheckRequestLine {
  itemId: string;
  itemName?: string;
  requestedBaseQty: number;
}

export interface StockCheckDeficit {
  itemId: string;
  itemName: string;
  available: number;
  requested: number;
  shortfall: number;
}

export function checkStockAvailability(
  ledger: WarehouseItemBalance[],
  warehouse: string,
  lines: StockCheckRequestLine[]
): { ok: boolean; deficits: StockCheckDeficit[] } {
  const running = new Map<string, number>();
  const deficits: StockCheckDeficit[] = [];

  for (const line of lines) {
    if (!line.itemId || line.requestedBaseQty <= 0) continue;
    if (!running.has(line.itemId)) {
      running.set(line.itemId, Math.max(0, getWarehouseItemStock(ledger, warehouse, line.itemId)));
    }
    const avail = running.get(line.itemId) ?? 0;
    if (line.requestedBaseQty > avail + 0.0001) {
      deficits.push({
        itemId: line.itemId,
        itemName: line.itemName ?? line.itemId,
        available: Math.round(avail * 1000) / 1000,
        requested: Math.round(line.requestedBaseQty * 1000) / 1000,
        shortfall: Math.round((line.requestedBaseQty - avail) * 1000) / 1000,
      });
    }
    running.set(line.itemId, Math.max(0, avail - line.requestedBaseQty));
  }

  return { ok: deficits.length === 0, deficits };
}

export interface CylinderWarehouseSummary {
  warehouse: string;
  itemId: string;
  itemName: string;
  cylFull: number;
  cylEmpty: number;
  cylInRefill: number;
  inTransit: number;
  inCustody: number;
}

export function computeCylinderSummaries(input: {
  ledger: WarehouseItemBalance[];
  transfers: Transfer[];
  issues: Issue[];
  returns: ReturnRecord[];
}): CylinderWarehouseSummary[] {
  const refillRows = input.ledger.filter((r) => r.isRefillable);
  return refillRows.map((row) => {
    const inTransit = input.transfers
      .filter((t) => t.itemId === row.itemId && t.destWarehouse === row.warehouse && t.status === 'PENDING')
      .reduce((acc, t) => acc + t.baseQty, 0);

    const issuedOut = input.issues
      .filter(
        (i) =>
          isMovementActive(i.status) &&
          i.itemId === row.itemId &&
          i.warehouse === row.warehouse &&
          (i.cylinderAction === 'ISSUE_FULL' || i.cylinderAction === 'ISSUE_EMPTY' || i.cylinderAction === '')
      )
      .reduce((acc, i) => acc + i.baseQty, 0);

    const returnedBack = input.returns
      .filter(
        (r) =>
          isMovementActive(r.status) &&
          r.itemId === row.itemId &&
          r.warehouse === row.warehouse &&
          r.type === 'FROM_UNIT'
      )
      .reduce((acc, r) => acc + r.baseQty, 0);

    return {
      warehouse: row.warehouse,
      itemId: row.itemId,
      itemName: row.itemName,
      cylFull: row.cylFull,
      cylEmpty: row.cylEmpty,
      cylInRefill: row.cylInRefill,
      inTransit,
      inCustody: Math.max(0, issuedOut - returnedBack),
    };
  });
}
