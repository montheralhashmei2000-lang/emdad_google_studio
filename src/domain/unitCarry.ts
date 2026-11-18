// Pure UnitCarry, UnitSplit & OpeningBreakdown Engine (Zero Dependencies)

import type { Item } from './types';

export interface UnitLineInput {
  itemId: string;
  unitName: string;
  factor: number;
  qty: number;
}

export interface NormalizedUnitLine {
  itemId: string;
  itemName: string;
  baseQty: number;
  majorUnitName: string;
  majorFactor: number;
  majorCount: number;
  remainderUnitName: string;
  remainderQty: number;
  formatted: string;
}

/**
 * UnitCarry.normalize: merges duplicate item lines and rolls up fractional/small units
 * into largest unit + base remainder (e.g. 4 bags*40kg + 50kg = 5 bags + 10kg).
 */
export function normalizeUnitLines(lines: UnitLineInput[], items: Item[]): NormalizedUnitLine[] {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const totalBaseByItem = new Map<string, number>();

  for (const line of lines) {
    if (!line.itemId || line.qty <= 0) continue;
    const f = line.factor > 0 ? line.factor : 1;
    totalBaseByItem.set(line.itemId, (totalBaseByItem.get(line.itemId) ?? 0) + line.qty * f);
  }

  const result: NormalizedUnitLine[] = [];
  for (const [itemId, totalBase] of totalBaseByItem.entries()) {
    const item = itemMap.get(itemId);
    const units = item?.units?.length ? [...item.units].sort((a, b) => b.factor - a.factor) : [];
    const major = units[0] ?? { name: item?.baseUnit ?? 'وحدة', factor: 1 };
    const majorFactor = major.factor > 0 ? major.factor : 1;

    let majorCount = 0;
    let remainder = round3(totalBase);
    if (majorFactor > 1) {
      majorCount = Math.floor(totalBase / majorFactor);
      remainder = round3(totalBase - majorCount * majorFactor);
    }

    const baseName = item?.baseUnit ?? major.name;
    const formatted =
      majorFactor > 1 && majorCount > 0
        ? remainder > 0.001
          ? `${majorCount} ${major.name} + ${remainder} ${baseName}`
          : `${majorCount} ${major.name}`
        : `${round3(totalBase)} ${baseName}`;

    result.push({
      itemId,
      itemName: item?.name ?? itemId,
      baseQty: round3(totalBase),
      majorUnitName: major.name,
      majorFactor,
      majorCount,
      remainderUnitName: baseName,
      remainderQty: remainder,
      formatted,
    });
  }
  return result;
}

export interface CarrySettlement {
  requiredBase: number;
  carryInBase: number;
  effectiveTargetBase: number;
  issuedPacks: number;
  issuedBase: number;
  carryOutBase: number;
  carryAlert: CarryAlert | null;
}

export interface CarryAlert {
  itemId: string;
  itemName: string;
  accumulatedBase: number;
  accumulatedPacks: number;
  message: string;
}

/**
 * CarrySettlement & PackCarry: settles fractional demand using whole packs and tracks carry-forward
 * remainder, raising a CarryAlert when carry accumulates to >= 1 full pack.
 */
export function settleCarryPack(params: {
  itemId: string;
  itemName: string;
  requiredBase: number;
  carryInBase: number;
  packFactor: number;
  wholePacks: boolean;
}): CarrySettlement {
  const factor = params.packFactor > 0 ? params.packFactor : 1;
  const effectiveTarget = Math.max(0, params.requiredBase + params.carryInBase);

  if (!params.wholePacks || factor <= 1) {
    return {
      requiredBase: round3(params.requiredBase),
      carryInBase: round3(params.carryInBase),
      effectiveTargetBase: round3(effectiveTarget),
      issuedPacks: round3(effectiveTarget / factor),
      issuedBase: round3(effectiveTarget),
      carryOutBase: 0,
      carryAlert: null,
    };
  }

  const issuedPacks = Math.floor(effectiveTarget / factor);
  const issuedBase = round3(issuedPacks * factor);
  const carryOutBase = round3(Math.max(0, effectiveTarget - issuedBase));
  const carryPacks = Math.floor(carryOutBase / factor);

  const carryAlert: CarryAlert | null =
    carryPacks >= 1
      ? {
          itemId: params.itemId,
          itemName: params.itemName,
          accumulatedBase: carryOutBase,
          accumulatedPacks: carryPacks,
          message: `تراكم مرحّل لـ ${params.itemName}: يعادل ${carryPacks} عبوة كاملة — يُنصح بالتسوية`,
        }
      : null;

  return {
    requiredBase: round3(params.requiredBase),
    carryInBase: round3(params.carryInBase),
    effectiveTargetBase: round3(effectiveTarget),
    issuedPacks,
    issuedBase,
    carryOutBase,
    carryAlert,
  };
}

export interface UnitSplitSegment {
  unitName: string;
  factor: number;
  count: number;
}

/**
 * UnitSplit: breaks down a base quantity across descending pack sizes of an item.
 */
export function splitBaseQtyIntoUnits(baseQty: number, item?: Item): UnitSplitSegment[] {
  const clean = Math.max(0, baseQty);
  if (!item || !item.units.length) {
    return [{ unitName: item?.baseUnit ?? 'وحدة', factor: 1, count: round3(clean) }];
  }
  const sorted = [...item.units].sort((a, b) => b.factor - a.factor);
  const segments: UnitSplitSegment[] = [];
  let rem = clean;

  for (let idx = 0; idx < sorted.length; idx++) {
    const u = sorted[idx];
    const f = u.factor > 0 ? u.factor : 1;
    const isLast = idx === sorted.length - 1 || f <= 1;
    if (isLast) {
      if (rem > 0.0001 || segments.length === 0) {
        segments.push({ unitName: u.name, factor: f, count: round3(rem / f) });
      }
      break;
    }
    const whole = Math.floor(rem / f);
    if (whole > 0) {
      segments.push({ unitName: u.name, factor: f, count: whole });
      rem = round3(rem - whole * f);
    }
  }
  return segments;
}

export interface OpeningBreakdownInput {
  units?: Record<string, number>;
  full?: number;
  empty?: number;
}

/**
 * OpeningBreakdown: resolves total base quantity from multi-unit counts and/or cylinder full+empty counts.
 */
export function computeOpeningBreakdownTotal(breakdown: OpeningBreakdownInput, item?: Item): number {
  let total = 0;
  if (breakdown.units && item) {
    const factorByUnit = new Map(item.units.map((u) => [u.name, u.factor > 0 ? u.factor : 1]));
    for (const [unitName, qty] of Object.entries(breakdown.units)) {
      const f = factorByUnit.get(unitName) ?? 1;
      total += Math.max(0, qty) * f;
    }
  }
  if (item?.isRefillable && (breakdown.full !== undefined || breakdown.empty !== undefined)) {
    const cylSum = Math.max(0, breakdown.full ?? 0) + Math.max(0, breakdown.empty ?? 0);
    if (cylSum > 0) total = Math.max(total, cylSum);
  }
  return round3(total);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
