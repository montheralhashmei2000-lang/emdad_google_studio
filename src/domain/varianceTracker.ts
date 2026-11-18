// Pure VarianceTracker & EntitlementActual Engine (Zero Dependencies)

import type { BeneficiaryUnit, StrengthRecord } from './types';
import { computeCampStrengthForDate } from './strengthEngine';

export type RationVarianceLevel = 'normal' | 'underIssued' | 'overIssued';

export interface RationVarianceResult {
  theoretical: number;
  actual: number;
  diff: number;
  variancePct: number;
  level: RationVarianceLevel;
  label: string;
}

/**
 * EntitlementActual / VarianceIndicator:
 * - normal: within ±5%
 * - underIssued: shortfall > 15% (or < -5%)
 * - overIssued: excess > +5%
 */
export function classifyRationVariance(theoretical: number, actual: number): RationVarianceResult {
  const th = Math.max(0, theoretical);
  const ac = Math.max(0, actual);
  const diff = round3(ac - th);
  const variancePct = th > 0 ? round3(((ac - th) / th) * 100) : ac > 0 ? 100 : 0;

  let level: RationVarianceLevel = 'normal';
  let label = 'ضمن النطاق (±5%)';
  if (variancePct > 5) {
    level = 'overIssued';
    label = variancePct > 15 ? 'تجاوز وهدر مرتفع' : 'تجاوز عن المقرر';
  } else if (variancePct < -15) {
    level = 'underIssued';
    label = 'نقص يتجاوز 15%';
  } else if (variancePct < -5) {
    level = 'underIssued';
    label = 'نقص طفيف (-5% إلى -15%)';
  }

  return {
    theoretical: round3(th),
    actual: round3(ac),
    diff,
    variancePct,
    level,
    label,
  };
}

export interface DailyStrengthVariancePoint {
  date: string;
  dayTotal: number;
  monthlyAverage: number;
  dailyDeviation: number;
  cumulativeDeviation: number;
  deviationPct: number;
}

/**
 * VarianceTracker: tracks daily strength deviations from monthly average and their accumulation.
 */
export function trackDailyStrengthVariance(
  campId: string,
  yearMonth: string,
  strengths: StrengthRecord[],
  units: BeneficiaryUnit[]
): DailyStrengthVariancePoint[] {
  const dates = Array.from(
    new Set(strengths.filter((s) => s.strengthDate.startsWith(yearMonth)).map((s) => s.strengthDate))
  ).sort();

  const totals = dates.map((d) => ({
    date: d,
    total: computeCampStrengthForDate(campId, d, strengths, units).total,
  }));

  const valid = totals.filter((t) => t.total > 0);
  const monthlyAverage =
    valid.length > 0 ? valid.reduce((sum, x) => sum + x.total, 0) / valid.length : 0;

  let cumulative = 0;
  return totals.map((pt) => {
    const dailyDeviation = round3(pt.total - monthlyAverage);
    cumulative = round3(cumulative + dailyDeviation);
    const deviationPct = monthlyAverage > 0 ? round3((dailyDeviation / monthlyAverage) * 100) : 0;
    return {
      date: pt.date,
      dayTotal: pt.total,
      monthlyAverage: round3(monthlyAverage),
      dailyDeviation,
      cumulativeDeviation: cumulative,
      deviationPct,
    };
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
