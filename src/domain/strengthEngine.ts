// Pure StrengthEngine: camp vs detail records without double-counting, facility strength, and MealHeadcount

import type { BeneficiaryUnit, Facility, MealHeadcount, MealType, StrengthRecord } from './types';

export function computeCampStrengthForDate(
  campId: string,
  date: string,
  strengths: StrengthRecord[],
  units: BeneficiaryUnit[]
): { soldiers: number; officers: number; total: number; source: 'camp' | 'detail' | 'none' } {
  const dayRecs = strengths.filter((s) => s.strengthDate === date);
  const campDirect = dayRecs.find((s) => s.mode === 'camp' && (s.campId === campId || s.unitId === campId));
  if (campDirect) {
    return {
      soldiers: campDirect.soldierCount,
      officers: campDirect.officerCount,
      total: campDirect.total,
      source: 'camp',
    };
  }

  const subUnitIds = new Set(units.filter((u) => !u.isCamp && u.parentId === campId).map((u) => u.id));
  const detailRecs = dayRecs.filter(
    (s) => s.mode === 'detail' && (s.campId === campId || subUnitIds.has(s.unitId))
  );
  if (detailRecs.length === 0) {
    return { soldiers: 0, officers: 0, total: 0, source: 'none' };
  }

  const seenUnits = new Set<string>();
  let soldiers = 0;
  let officers = 0;
  let total = 0;
  for (const r of detailRecs) {
    if (seenUnits.has(r.unitId)) continue;
    seenUnits.add(r.unitId);
    soldiers += r.soldierCount;
    officers += r.officerCount;
    total += r.total;
  }
  return { soldiers, officers, total, source: 'detail' };
}

export function computeFacilityStrengthForDate(
  facility: Facility,
  date: string,
  strengths: StrengthRecord[],
  units: BeneficiaryUnit[]
): number {
  const linkedUnits = units.filter(
    (u) => u.facilityId === facility.id || u.facilityIds.includes(facility.id)
  );
  const linkedCampIds = new Set(linkedUnits.filter((u) => u.isCamp).map((u) => u.id));
  // Also include parent camps of linked sub-units if camp itself is linked
  let total = 0;
  for (const campId of linkedCampIds) {
    total += computeCampStrengthForDate(campId, date, strengths, units).total;
  }

  const dayRecs = strengths.filter((s) => s.strengthDate === date);
  const standaloneUnits = linkedUnits.filter((u) => !u.isCamp && !linkedCampIds.has(u.parentId));
  for (const u of standaloneUnits) {
    const rec = dayRecs.find((s) => s.unitId === u.id);
    if (rec) total += rec.total;
  }
  return total;
}

export function resolveMealHeadcount(
  facility: Facility,
  date: string,
  mealType: MealType,
  headcounts: MealHeadcount[],
  strengths: StrengthRecord[],
  units: BeneficiaryUnit[]
): { headcount: number; source: 'meal' | 'dayTotal' } {
  const specific = headcounts.find(
    (h) => h.facilityId === facility.id && h.date === date && h.mealType === mealType
  );
  if (specific && specific.headcount > 0) {
    return { headcount: specific.headcount, source: 'meal' };
  }
  const dayTotal = computeFacilityStrengthForDate(facility, date, strengths, units);
  return { headcount: dayTotal, source: 'dayTotal' };
}

export function computeGlobalTotalStrengthForDate(
  date: string,
  strengths: StrengthRecord[],
  units: BeneficiaryUnit[]
): number {
  const camps = units.filter((u) => u.isCamp);
  const seenCamp = new Set<string>();
  let total = 0;
  for (const c of camps) {
    seenCamp.add(c.id);
    total += computeCampStrengthForDate(c.id, date, strengths, units).total;
  }
  // Standalone units without a camp parent
  const dayRecs = strengths.filter((s) => s.strengthDate === date);
  for (const u of units.filter((x) => !x.isCamp && (!x.parentId || !seenCamp.has(x.parentId)))) {
    const rec = dayRecs.find((s) => s.unitId === u.id);
    if (rec) total += rec.total;
  }
  return total;
}
