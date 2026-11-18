// Pure CampLedgerCalc & EntitlementScopes Engine (4 ScopeKinds preventing double-counting)

import type {
  BeneficiaryUnit,
  CampLedger,
  Entitlement,
  Issue,
  Item,
  KitchenLog,
  ReturnRecord,
  StrengthRecord,
  Transfer,
  Warehouse,
} from './types';
import { dailyRatePerPerson } from './entitlements';
import { computeCampStrengthForDate } from './strengthEngine';

export type ScopeKind = 'all' | 'camp' | 'unit' | 'warehouse';

export interface CampLedgerComputedRow {
  campId: string;
  campName: string;
  itemId: string;
  itemName: string;
  unitName: string;
  year: number;
  month: number;
  openingEntitled: number;
  openingStock: number;
  entitlementTotal: number;
  transferredIn: number;
  issuedDirect: number;
  internalIssued: number;
  returnedQty: number;
  consumedKitchen: number;
  entitlementBalance: number; // openingEntitled + entitlementTotal - (transferredIn + issuedDirect - returnedQty)
  stockBalance: number;       // openingStock + delivered - consumedKitchen
  strengthSum: number;
  strengthDays: number;
  status: 'OPEN' | 'CLOSED';
}

export function computeCampLedgerRows(params: {
  year: number;
  month: number;
  scopeKind: ScopeKind;
  scopeId?: string;
  camps: BeneficiaryUnit[];
  units: BeneficiaryUnit[];
  warehouses: Warehouse[];
  items: Item[];
  entitlements: Entitlement[];
  strengths: StrengthRecord[];
  transfers: Transfer[];
  issues: Issue[];
  returns: ReturnRecord[];
  kitchenLogs: KitchenLog[];
  existingLedgers: CampLedger[];
}): CampLedgerComputedRow[] {
  const ymPrefix = `${params.year}-${String(params.month).padStart(2, '0')}`;
  const entMap = new Map(params.entitlements.map((e) => [e.itemId, e]));
  const existingMap = new Map(
    params.existingLedgers
      .filter((l) => l.year === params.year && l.month === params.month)
      .map((l) => [`${l.campId}::${l.itemId}`, l])
  );

  // Filter camps according to ScopeKind
  let targetCamps = params.camps.filter((c) => c.isCamp);
  if (params.scopeKind === 'camp' && params.scopeId) {
    targetCamps = targetCamps.filter((c) => c.id === params.scopeId);
  } else if (params.scopeKind === 'unit' && params.scopeId) {
    const unit = params.units.find((u) => u.id === params.scopeId);
    targetCamps = unit?.parentId
      ? targetCamps.filter((c) => c.id === unit.parentId)
      : unit
      ? [unit]
      : [];
  } else if (params.scopeKind === 'warehouse' && params.scopeId) {
    const wh = params.warehouses.find((w) => w.id === params.scopeId || w.name === params.scopeId);
    if (wh && !wh.feedsAllCamps) {
      targetCamps = targetCamps.filter((c) => wh.campIds.includes(c.id));
    }
  }

  // Distinct dates in this month with strength records
  const monthDates = Array.from(
    new Set(
      params.strengths
        .filter((s) => s.strengthDate.startsWith(ymPrefix))
        .map((s) => s.strengthDate)
    )
  ).sort();

  const mainWarehouseNames = new Set(
    params.warehouses.filter((w) => w.isMain).map((w) => w.name)
  );

  const rows: CampLedgerComputedRow[] = [];

  for (const camp of targetCamps) {
    const campSubUnitIds = new Set(
      params.units.filter((u) => u.parentId === camp.id || u.id === camp.id).map((u) => u.id)
    );
    const campFacilityIds = new Set([camp.facilityId, ...camp.facilityIds].filter(Boolean));
    const campWarehouseNames = new Set(
      params.warehouses.filter((w) => !w.isMain && w.campIds.includes(camp.id)).map((w) => w.name)
    );

    // Calculate monthly strength sum across recorded days
    let strengthSum = 0;
    let strengthDays = 0;
    for (const dt of monthDates) {
      const res = computeCampStrengthForDate(camp.id, dt, params.strengths, params.units);
      if (res.total > 0) {
        strengthSum += res.total;
        strengthDays += 1;
      }
    }

    for (const item of params.items) {
      const ent = entMap.get(item.id);
      const dailyRate = ent ? dailyRatePerPerson(ent) : 0;
      const entitlementTotal = round3(dailyRate * strengthSum);

      // Prevent double counting between warehouse transfers & camp direct issues:
      const transferredIn = params.transfers
        .filter(
          (t) =>
            t.date.startsWith(ymPrefix) &&
            t.itemId === item.id &&
            (t.campId === camp.id || campWarehouseNames.has(t.destWarehouse)) &&
            (t.status === 'RECEIVED' || t.status === 'COMPLETED') &&
            (params.scopeKind !== 'warehouse' || mainWarehouseNames.has(t.warehouse) || t.warehouse === params.scopeId)
        )
        .reduce((s, t) => s + t.baseQty, 0);

      let issuedDirect = 0;
      let internalIssued = 0;
      for (const iss of params.issues) {
        if (!iss.date.startsWith(ymPrefix) || iss.itemId !== item.id) continue;
        if (iss.status !== 'COMPLETED' && iss.status !== 'RECEIVED') continue;
        const belongsToCamp =
          campSubUnitIds.has(iss.beneficiaryUnitId) ||
          campSubUnitIds.has(iss.unitId) ||
          campFacilityIds.has(iss.facilityId);
        if (!belongsToCamp) continue;
        if (campWarehouseNames.has(iss.warehouse)) {
          internalIssued += iss.baseQty;
        } else {
          issuedDirect += iss.baseQty;
        }
      }

      const returnedQty = params.returns
        .filter(
          (r) =>
            r.date.startsWith(ymPrefix) &&
            r.itemId === item.id &&
            r.type === 'FROM_UNIT' &&
            r.condition === 'صالحة' &&
            (r.status === 'COMPLETED' || r.status === 'RECEIVED') &&
            campSubUnitIds.has(r.beneficiaryUnitId) &&
            !campWarehouseNames.has(r.warehouse)
        )
        .reduce((s, r) => s + r.baseQty, 0);

      const consumedKitchen = params.kitchenLogs
        .filter(
          (k) =>
            k.date.startsWith(ymPrefix) &&
            k.itemId === item.id &&
            campFacilityIds.has(k.facilityId)
        )
        .reduce((s, k) => s + k.baseQty, 0);

      const prev = existingMap.get(`${camp.id}::${item.id}`);
      const openingEntitled = prev?.openingEntitled ?? 0;
      const openingStock = prev?.openingStock ?? 0;

      const delivered = transferredIn + issuedDirect - returnedQty;
      const entitlementBalance = round3(openingEntitled + entitlementTotal - delivered);
      const stockBalance = round3(openingStock + delivered - consumedKitchen);

      if (
        entitlementTotal === 0 &&
        delivered === 0 &&
        consumedKitchen === 0 &&
        openingEntitled === 0 &&
        openingStock === 0
      ) {
        continue;
      }

      rows.push({
        campId: camp.id,
        campName: camp.name,
        itemId: item.id,
        itemName: item.name,
        unitName: item.baseUnit,
        year: params.year,
        month: params.month,
        openingEntitled: round3(openingEntitled),
        openingStock: round3(openingStock),
        entitlementTotal,
        transferredIn: round3(transferredIn),
        issuedDirect: round3(issuedDirect),
        internalIssued: round3(internalIssued),
        returnedQty: round3(returnedQty),
        consumedKitchen: round3(consumedKitchen),
        entitlementBalance,
        stockBalance,
        strengthSum,
        strengthDays,
        status: prev?.status ?? 'OPEN',
      });
    }
  }

  return rows;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
