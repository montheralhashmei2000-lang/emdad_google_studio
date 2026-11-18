// Pure Cylinders Engine: Refillable Asset Lifecycle & Count-Neutral Action Tracking (Zero Dependencies)

import type { CylIssueAction, CylReceiveAction, CylReturnAction, CylTransferAction } from './types';
import { computeCylinderSummaries, type CylinderWarehouseSummary } from './stockLedger';

export type AnyCylAction = CylReceiveAction | CylIssueAction | CylTransferAction | CylReturnAction | '';

export const COUNT_NEUTRAL_CYL_ACTIONS: ReadonlySet<string> = new Set([
  'REFILL',
  'EXCHANGE',
  'SEND_REFILL',
]);

export function isCountNeutralCylAction(action: string): boolean {
  return COUNT_NEUTRAL_CYL_ACTIONS.has(action);
}

export interface CylinderPosition {
  warehouse: string;
  itemId: string;
  itemName: string;
  full: number;
  empty: number;
  atRefill: number;
  inTransit: number;
  custody: number;
  totalOwned: number;
}

export function toCylinderPositions(summaries: CylinderWarehouseSummary[]): CylinderPosition[] {
  return summaries.map((s) => ({
    warehouse: s.warehouse,
    itemId: s.itemId,
    itemName: s.itemName,
    full: s.cylFull,
    empty: s.cylEmpty,
    atRefill: s.cylInRefill,
    inTransit: s.inTransit,
    custody: s.inCustody,
    totalOwned: s.cylFull + s.cylEmpty + s.cylInRefill + s.inTransit + s.inCustody,
  }));
}

export { computeCylinderSummaries, type CylinderWarehouseSummary };
