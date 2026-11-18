// Pure Entitlements & EntitlementGroups Engine (30-day base rate and grp: distribution modes)

import type { Entitlement, EntitlementGroup, Item } from './types';
import type { WarehouseItemBalance } from './stockLedger';
import { getWarehouseItemStock } from './stockLedger';

export function dailyRatePerPerson(ent: Entitlement): number {
  const factor = ent.measureFactor > 0 ? ent.measureFactor : 1;
  return (ent.qtyPerPerson * factor) / 30;
}

export function isGroupEntitlementId(itemId: string): boolean {
  return itemId.startsWith('grp:');
}

export function stripGroupPrefix(itemId: string): string {
  return isGroupEntitlementId(itemId) ? itemId.slice(4) : itemId;
}

/**
 * Rule: "المجموعة تغلب مقرر الصنف" — removes individual item entitlements for items covered by an active group.
 */
export function resolveEffectiveEntitlements(
  entitlements: Entitlement[],
  groups: EntitlementGroup[]
): Entitlement[] {
  const memberIds = new Set<string>();
  for (const g of groups) {
    for (const m of g.members) memberIds.add(m.itemId);
  }
  return entitlements.filter((e) => e.itemId.startsWith('grp:') || !memberIds.has(e.itemId));
}

/**
 * GroupUnitGuess: guesses common group display unit from group members.
 */
export function guessGroupUnit(memberItemIds: string[], items: Item[]): string {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const counts = new Map<string, number>();
  for (const id of memberItemIds) {
    const u = itemMap.get(id)?.baseUnit;
    if (u) counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  let best = 'كجم';
  let maxCount = 0;
  for (const [unit, c] of counts.entries()) {
    if (c > maxCount) {
      best = unit;
      maxCount = c;
    }
  }
  return best;
}

export interface GroupAllocationLine {
  itemId: string;
  itemName: string;
  allocatedBase: number;
  availableStock: number;
  shareUsedPct: number;
}

export function distributeGroupRequirement(
  group: EntitlementGroup,
  requiredBase: number,
  warehouse: string,
  ledger: WarehouseItemBalance[],
  items: Item[]
): { lines: GroupAllocationLine[]; shortfall: number } {
  if (requiredBase <= 0 || group.members.length === 0) {
    return { lines: [], shortfall: requiredBase };
  }

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const membersWithStock = group.members.map((m) => ({
    ...m,
    stock: Math.max(0, getWarehouseItemStock(ledger, warehouse, m.itemId)),
    item: itemMap.get(m.itemId),
  }));

  const lines: GroupAllocationLine[] = [];
  let remaining = requiredBase;

  if (group.distMode === 'byStock') {
    const totalAvail = membersWithStock.reduce((s, m) => s + m.stock, 0);
    if (totalAvail <= 0) {
      return { lines: [], shortfall: requiredBase };
    }
    for (const m of membersWithStock) {
      if (m.stock <= 0 || remaining <= 0) continue;
      const ratio = m.stock / totalAvail;
      const desired = Math.min(m.stock, requiredBase * ratio, remaining);
      if (desired > 0) {
        lines.push({
          itemId: m.itemId,
          itemName: m.itemName || m.item?.name || m.itemId,
          allocatedBase: roundQty(desired),
          availableStock: m.stock,
          shareUsedPct: roundQty((desired / requiredBase) * 100),
        });
        remaining = Math.max(0, remaining - desired);
      }
    }
  } else if (group.distMode === 'shares') {
    const sumPct = membersWithStock.reduce((s, m) => s + Math.max(0, m.sharePct), 0) || 100;
    for (const m of membersWithStock) {
      const target = requiredBase * (Math.max(0, m.sharePct) / sumPct);
      const take = Math.min(m.stock, target, remaining);
      if (take > 0) {
        lines.push({
          itemId: m.itemId,
          itemName: m.itemName || m.item?.name || m.itemId,
          allocatedBase: roundQty(take),
          availableStock: m.stock,
          shareUsedPct: roundQty((take / requiredBase) * 100),
        });
        remaining = Math.max(0, remaining - take);
      }
    }
    // Fill any residual gap from members that still have stock
    if (remaining > 0.0001) {
      for (const m of membersWithStock) {
        const already = lines.find((l) => l.itemId === m.itemId)?.allocatedBase ?? 0;
        const left = Math.max(0, m.stock - already);
        if (left <= 0 || remaining <= 0) continue;
        const extra = Math.min(left, remaining);
        const existing = lines.find((l) => l.itemId === m.itemId);
        if (existing) {
          existing.allocatedBase = roundQty(existing.allocatedBase + extra);
          existing.shareUsedPct = roundQty((existing.allocatedBase / requiredBase) * 100);
        } else {
          lines.push({
            itemId: m.itemId,
            itemName: m.itemName || m.item?.name || m.itemId,
            allocatedBase: roundQty(extra),
            availableStock: m.stock,
            shareUsedPct: roundQty((extra / requiredBase) * 100),
          });
        }
        remaining = Math.max(0, remaining - extra);
      }
    }
  } else {
    // priority
    const sorted = [...membersWithStock].sort((a, b) => a.priority - b.priority);
    for (const m of sorted) {
      if (remaining <= 0.0001) break;
      const take = Math.min(m.stock, remaining);
      if (take > 0) {
        lines.push({
          itemId: m.itemId,
          itemName: m.itemName || m.item?.name || m.itemId,
          allocatedBase: roundQty(take),
          availableStock: m.stock,
          shareUsedPct: roundQty((take / requiredBase) * 100),
        });
        remaining = Math.max(0, remaining - take);
      }
    }
  }

  return { lines, shortfall: roundQty(remaining) };
}

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}
