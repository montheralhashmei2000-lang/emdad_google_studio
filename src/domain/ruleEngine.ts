// Pure RuleDecision Engine (pass, softWarningRequiresReason, hardLockRequiresOwnerSign) & DaysOfSupply

import type { Entitlement, Item, Stocktake } from './types';
import { dailyRatePerPerson } from './entitlements';

export type RuleDecisionKind =
  | 'pass'
  | 'softWarningRequiresReason'
  | 'hardLockRequiresOwnerSign'
  | 'block';

export interface RuleDecisionResult {
  decision: RuleDecisionKind;
  reasons: string[];
  entitledQty: number;
  variancePct: number;
}

export interface DaysOfSupplyResult {
  dailyConsumption: number;
  dynamicMin: number;
  criticalLevel: number;
  daysRemaining: number | null;
  status: 'healthy' | 'reorder' | 'critical' | 'empty';
}

export function evaluateDaysOfSupply(
  currentBalance: number,
  entitlement: Entitlement | undefined,
  totalStrength: number,
  itemMinQty: number,
  supplyDays = 7,
  criticalDays = 3
): DaysOfSupplyResult {
  const dailyPerPerson = entitlement ? dailyRatePerPerson(entitlement) : 0;
  const dailyConsumption = dailyPerPerson * Math.max(0, totalStrength);

  const dynamicMin = dailyConsumption > 0 ? dailyConsumption * supplyDays : itemMinQty;
  const criticalLevel =
    dailyConsumption > 0 ? dailyConsumption * criticalDays : Math.max(0, itemMinQty * 0.4);

  const daysRemaining =
    dailyConsumption > 0 ? Math.max(0, currentBalance / dailyConsumption) : null;

  let status: DaysOfSupplyResult['status'] = 'healthy';
  if (currentBalance <= 0) status = 'empty';
  else if (criticalLevel > 0 && currentBalance <= criticalLevel) status = 'critical';
  else if (dynamicMin > 0 && currentBalance <= dynamicMin) status = 'reorder';

  return {
    dailyConsumption: round3(dailyConsumption),
    dynamicMin: round3(dynamicMin),
    criticalLevel: round3(criticalLevel),
    daysRemaining: daysRemaining === null ? null : round3(daysRemaining),
    status,
  };
}

export interface IssueRuleInput {
  warehouse: string;
  availableBalance: number;
  requestedBaseQty: number;
  strengthTotal: number;
  durationDays: number;
  entitlement?: Entitlement;
  item?: Item;
  activeFrozenStocktakes: Stocktake[];
  softWarningThresholdPct: number; // e.g., 10%
  hardLockThresholdPct: number;    // e.g., 30%
}

export function evaluateIssueRules(input: IssueRuleInput): RuleDecisionResult {
  const reasons: string[] = [];
  let decision: RuleDecisionKind = 'pass';

  // 1. Check warehouse freeze during active stocktake
  const frozen = input.activeFrozenStocktakes.find(
    (s) => s.status === 'COUNTING' && s.freeze && s.warehouse === input.warehouse
  );
  if (frozen) {
    decision = 'hardLockRequiresOwnerSign';
    reasons.push(`المستودع "${input.warehouse}" مجمّد حالياً لجلسة الجرد رقم ${frozen.orderNo}`);
  }

  // 2. Check insufficient stock
  if (input.requestedBaseQty > input.availableBalance + 0.0001) {
    decision = 'hardLockRequiresOwnerSign';
    reasons.push(
      `الكمية المطلوبة (${round3(input.requestedBaseQty)}) تتجاوز الرصيد المتاح (${round3(input.availableBalance)})`
    );
  }

  // 3. Check entitlement ceiling
  let entitledQty = 0;
  let variancePct = 0;
  if (input.entitlement && input.strengthTotal > 0 && input.durationDays > 0) {
    const daily = dailyRatePerPerson(input.entitlement);
    entitledQty = daily * input.strengthTotal * input.durationDays;
    if (entitledQty > 0) {
      variancePct = ((input.requestedBaseQty - entitledQty) / entitledQty) * 100;
      if (variancePct > input.hardLockThresholdPct) {
        decision = 'hardLockRequiresOwnerSign';
        reasons.push(
          `تجاوز الاستحقاق المقرر بنسبة ${Math.round(variancePct)}% (يتجاوز حد القفل ${input.hardLockThresholdPct}%)`
        );
      } else if (variancePct > input.softWarningThresholdPct) {
        if (decision === 'pass') decision = 'softWarningRequiresReason';
        reasons.push(
          `زيادة عن الاستحقاق المقرر بنسبة ${Math.round(variancePct)}% (المقرر ${round3(entitledQty)})`
        );
      }
    }
  }

  return {
    decision,
    reasons,
    entitledQty: round3(entitledQty),
    variancePct: round3(variancePct),
  };
}

export interface RuleEvalContext {
  stock: (itemNameOrId: string) => number;
  daysLeft: (itemNameOrId: string) => number;
  requestedQty?: number;
}

/**
 * Safe text rule DSL parser (NO eval):
 * Supports syntax like:
 * IF stock('أرز') < 50 AND daysLeft('') <= 3 THEN warn('رصيد منخفض'); lock('...'); block('...')
 */
export function evaluateTextRule(ruleText: string, ctx: RuleEvalContext): {
  triggered: boolean;
  decision: RuleDecisionKind;
  messages: string[];
} {
  const match = ruleText.trim().match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i);
  if (!match) return { triggered: false, decision: 'pass', messages: [] };

  const condStr = match[1].trim();
  const actionStr = match[2].trim();

  const evalAtom = (atom: string): boolean => {
    const m = atom
      .trim()
      .match(/^(stock|daysLeft|requested)\s*\(\s*['"]([^'"]*)['"]\s*\)\s*(<=|>=|!=|==|<|>)\s*(-?\d+(?:\.\d+)?)$/i);
    if (!m) return false;
    const fn = m[1].toLowerCase();
    const arg = m[2];
    const op = m[3];
    const target = Number(m[4]);
    const lhs =
      fn === 'stock' ? ctx.stock(arg) : fn === 'daysleft' ? ctx.daysLeft(arg) : ctx.requestedQty ?? 0;

    switch (op) {
      case '<':
        return lhs < target;
      case '<=':
        return lhs <= target;
      case '>':
        return lhs > target;
      case '>=':
        return lhs >= target;
      case '==':
        return lhs === target;
      case '!=':
        return lhs !== target;
      default:
        return false;
    }
  };

  // Split by OR at top level, then AND inside each clause
  const orClauses = condStr.split(/\s+OR\s+/i);
  const condResult = orClauses.some((clause) =>
    clause.split(/\s+AND\s+/i).every((atom) => evalAtom(atom))
  );

  if (!condResult) return { triggered: false, decision: 'pass', messages: [] };

  let decision: RuleDecisionKind = 'pass';
  const messages: string[] = [];
  const actions = actionStr.split(';').map((s) => s.trim()).filter(Boolean);
  for (const act of actions) {
    const am = act.match(/^(warn|lock|block)\s*\(\s*['"]([^'"]*)['"]\s*\)$/i);
    if (!am) continue;
    const kind = am[1].toLowerCase();
    const msg = am[2];
    if (msg) messages.push(msg);
    if (kind === 'block') {
      decision = 'block';
    } else if (kind === 'lock' && decision !== 'block') {
      decision = 'hardLockRequiresOwnerSign';
    } else if (kind === 'warn' && decision === 'pass') {
      decision = 'softWarningRequiresReason';
    }
  }

  return { triggered: true, decision, messages };
}

export function validateIssueVoucherHeader(params: {
  warehouse: string;
  recipientDisplay: string;
  date: string;
  linesCount: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!params.warehouse) errors.push('يجب اختيار المستودع المصدر');
  if (!params.recipientDisplay.trim()) errors.push('يجب تحديد الجهة المستفيدة أو المنشأة');
  if (!params.date) errors.push('تاريخ الصرف مطلوب');
  if (params.linesCount <= 0) errors.push('يجب إضافة صنف واحد على الأقل في السند');
  return { valid: errors.length === 0, errors };
}

export function computeNextDueDate(issueDateIso: string, durationDays: number): string {
  const base = new Date(issueDateIso);
  if (Number.isNaN(base.getTime())) return issueDateIso;
  base.setDate(base.getDate() + Math.max(1, Math.floor(durationDays)));
  return base.toISOString().slice(0, 10);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
