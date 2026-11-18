// Pure FuelEngine: Tank Balances, Allocation Cycle & Carry Cap, Stocktake Variance

import type {
  FuelAllocation,
  FuelIssue,
  FuelOpening,
  FuelPeriodType,
  FuelSettingsRow,
  FuelSupply,
  FuelTransfer,
  FuelType,
  FuelWarehouse,
} from './types';

export interface FuelTankBalance {
  warehouseId: string;
  warehouseName: string;
  capacityLiters: number;
  petrol: number;
  diesel: number;
  total: number;
  occupancyPct: number;
  isLowStock: boolean;
}

export function computeFuelTankBalances(params: {
  warehouses: FuelWarehouse[];
  openings: FuelOpening[];
  supplies: FuelSupply[];
  issues: FuelIssue[];
  transfers: FuelTransfer[];
  lowStockPercent: number;
}): FuelTankBalance[] {
  return params.warehouses.map((wh) => {
    const calcType = (ft: FuelType): number => {
      const op = params.openings
        .filter((o) => o.warehouse === wh.name && o.fuelType === ft)
        .reduce((s, o) => s + o.liters, 0);
      const sup = params.supplies
        .filter((x) => x.warehouse === wh.name && x.fuelType === ft)
        .reduce((s, x) => s + x.quantityLiters, 0);
      const trIn = params.transfers
        .filter((t) => t.toWarehouse === wh.name && t.fuelType === ft)
        .reduce((s, t) => s + t.quantityLiters, 0);
      const trOut = params.transfers
        .filter((t) => t.fromWarehouse === wh.name && t.fuelType === ft)
        .reduce((s, t) => s + t.quantityLiters, 0);
      const iss = params.issues
        .filter((i) => i.warehouse === wh.name && i.fuelType === ft)
        .reduce((s, i) => s + i.quantityLiters, 0);
      return Math.max(0, Math.round((op + sup + trIn - trOut - iss) * 100) / 100);
    };

    const petrol = calcType('petrol');
    const diesel = calcType('diesel');
    const total = Math.round((petrol + diesel) * 100) / 100;
    const occupancyPct =
      wh.capacityLiters > 0 ? Math.min(100, Math.round((total / wh.capacityLiters) * 1000) / 10) : 0;

    return {
      warehouseId: wh.id,
      warehouseName: wh.name,
      capacityLiters: wh.capacityLiters,
      petrol,
      diesel,
      total,
      occupancyPct,
      isLowStock: wh.capacityLiters > 0 && occupancyPct <= params.lowStockPercent,
    };
  });
}

export function getPeriodDays(periodType: FuelPeriodType): number {
  switch (periodType) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    case 'custom':
      return 1;
  }
}

export interface AllocationStatus {
  allocation: FuelAllocation;
  elapsedPeriods: number;
  cappedPeriods: number;
  grossEntitled: number;
  issuedSoFar: number;
  writtenOff: number;
  remainingBalance: number;
}

export function computeAllocationBalance(
  alloc: FuelAllocation,
  issues: FuelIssue[],
  settings: FuelSettingsRow,
  asOfDate: string
): AllocationStatus {
  const start = new Date(alloc.startDate || alloc.createdAt.slice(0, 10));
  const end = alloc.endDate ? new Date(alloc.endDate) : new Date(asOfDate);
  const asOf = new Date(asOfDate);
  const effectiveEnd = asOf < end ? asOf : end;
  const diffDays = Math.max(1, Math.floor((effectiveEnd.getTime() - start.getTime()) / 86400000) + 1);
  const periodDays = getPeriodDays(alloc.periodType);
  const elapsedPeriods = Math.max(1, Math.floor(diffDays / periodDays));
  const cap = settings.carryCapPeriods > 0 ? settings.carryCapPeriods : 4;
  const cappedPeriods = Math.min(elapsedPeriods, cap);

  const grossEntitled =
    alloc.periodType === 'custom'
      ? alloc.totalQuantity
      : cappedPeriods * alloc.quantityPerPeriod;

  const issuedSoFar = issues
    .filter((i) => i.allocationId === alloc.id && i.source === 'allocation')
    .reduce((s, i) => s + i.quantityLiters, 0);

  const remainingBalance = Math.max(
    0,
    Math.round((grossEntitled - issuedSoFar - alloc.writtenOffLiters) * 100) / 100
  );

  return {
    allocation: alloc,
    elapsedPeriods,
    cappedPeriods,
    grossEntitled: Math.round(grossEntitled * 100) / 100,
    issuedSoFar: Math.round(issuedSoFar * 100) / 100,
    writtenOff: alloc.writtenOffLiters,
    remainingBalance,
  };
}

export interface FuelVehicleConsumptionRow {
  vehicleKey: string;
  plateOrChassis: string;
  unitName: string;
  petrolLiters: number;
  dieselLiters: number;
  totalLiters: number;
  issueCount: number;
}

export function computeFuelVehicleReport(issues: FuelIssue[]): FuelVehicleConsumptionRow[] {
  const map = new Map<string, FuelVehicleConsumptionRow>();
  for (const iss of issues) {
    const plateOrChassis = iss.chassisNo || iss.vehicleType || 'غير محدد';
    const unitName = iss.beneficiaryName || 'غير محدد';
    const key = `${plateOrChassis}::${unitName}`;
    const cur = map.get(key) ?? {
      vehicleKey: key,
      plateOrChassis,
      unitName,
      petrolLiters: 0,
      dieselLiters: 0,
      totalLiters: 0,
      issueCount: 0,
    };
    if (iss.fuelType === 'petrol') cur.petrolLiters += iss.quantityLiters;
    else cur.dieselLiters += iss.quantityLiters;
    cur.totalLiters += iss.quantityLiters;
    cur.issueCount += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.totalLiters - a.totalLiters);
}

export interface FuelDailyReportSummary {
  date: string;
  suppliedPetrol: number;
  suppliedDiesel: number;
  issuedPetrol: number;
  issuedDiesel: number;
  transferredLiters: number;
  operationsCount: number;
}

export function computeFuelDailyReport(params: {
  date: string;
  supplies: FuelSupply[];
  issues: FuelIssue[];
  transfers: FuelTransfer[];
}): FuelDailyReportSummary {
  const sDay = params.supplies.filter((s) => s.date === params.date);
  const iDay = params.issues.filter((i) => i.date === params.date);
  const tDay = params.transfers.filter((t) => t.date === params.date);

  return {
    date: params.date,
    suppliedPetrol: sDay.filter((x) => x.fuelType === 'petrol').reduce((a, b) => a + b.quantityLiters, 0),
    suppliedDiesel: sDay.filter((x) => x.fuelType === 'diesel').reduce((a, b) => a + b.quantityLiters, 0),
    issuedPetrol: iDay.filter((x) => x.fuelType === 'petrol').reduce((a, b) => a + b.quantityLiters, 0),
    issuedDiesel: iDay.filter((x) => x.fuelType === 'diesel').reduce((a, b) => a + b.quantityLiters, 0),
    transferredLiters: tDay.reduce((a, b) => a + b.quantityLiters, 0),
    operationsCount: sDay.length + iDay.length + tDay.length,
  };
}

export function computeFuelStocktakeVariance(bookLiters: number, actualLiters: number): {
  diffLiters: number;
  kind: 'matched' | 'surplus' | 'shortage';
} {
  const diff = Math.round((actualLiters - bookLiters) * 100) / 100;
  return {
    diffLiters: diff,
    kind: Math.abs(diff) < 0.01 ? 'matched' : diff > 0 ? 'surplus' : 'shortage',
  };
}
