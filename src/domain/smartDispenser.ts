// Pure SmartRationDispenserLogic: running stock deduction, mixSubstitute completion, critical vs non-critical, wholePacks & PackCarry

import type { Item, MealDispatchLine, MealPlanEntry } from './types';
import type { WarehouseItemBalance } from './stockLedger';
import { getWarehouseItemStock } from './stockLedger';

export interface SmartDispatchInput {
  entries: MealPlanEntry[];
  headcount: number;
  wastePct: number;
  wholePacks: boolean;
  warehouse: string;
  ledger: WarehouseItemBalance[];
  items: Item[];
  previousCarryByItem: Record<string, number>;
}

export interface SmartDispatchOutput {
  lines: Omit<MealDispatchLine, 'id' | 'dispatchId'>[];
  carryByItem: Record<string, number>;
  carryBannerItems: Array<{ itemId: string; itemName: string; carryPacks: number }>;
  warnings: string[];
  criticalShortfalls: string[];
  hasHardShortfall: boolean;
}

export function runSmartRationDispenser(input: SmartDispatchInput): SmartDispatchOutput {
  const itemMap = new Map(input.items.map((i) => [i.id, i]));
  const runningStock = new Map<string, number>();

  const getStock = (itemId: string): number => {
    if (!runningStock.has(itemId)) {
      runningStock.set(itemId, Math.max(0, getWarehouseItemStock(input.ledger, input.warehouse, itemId)));
    }
    return runningStock.get(itemId) ?? 0;
  };

  const deductStock = (itemId: string, qty: number) => {
    const cur = getStock(itemId);
    runningStock.set(itemId, Math.max(0, cur - qty));
  };

  const nextCarry: Record<string, number> = { ...input.previousCarryByItem };
  const lines: Omit<MealDispatchLine, 'id' | 'dispatchId'>[] = [];
  const warnings: string[] = [];
  const criticalShortfalls: string[] = [];
  const carryBannerItems: Array<{ itemId: string; itemName: string; carryPacks: number }> = [];

  const wasteMultiplier = 1 + Math.max(0, input.wastePct) / 100;

  for (const entry of input.entries) {
    const item = itemMap.get(entry.itemId);
    const factor = entry.factor > 0 ? entry.factor : 1;
    const rawRequiredBase = entry.qtyPerPerson * factor * input.headcount * wasteMultiplier;
    const carryIn = nextCarry[entry.itemId] ?? 0;

    let targetBase = rawRequiredBase + carryIn;
    let carryOut = 0;

    if (input.wholePacks && factor > 0) {
      const packsNeeded = targetBase / factor;
      const whole = Math.floor(packsNeeded);
      const remainderBase = targetBase - whole * factor;
      if (remainderBase > 0.0001) {
        // Carry forward or backward fractional pack
        targetBase = whole * factor;
        carryOut = Math.round(remainderBase * 1000) / 1000;
        if (carryOut / factor >= 1) {
          carryBannerItems.push({
            itemId: entry.itemId,
            itemName: entry.itemName,
            carryPacks: Math.floor(carryOut / factor),
          });
        }
      }
      nextCarry[entry.itemId] = carryOut;
    }

    const avail = getStock(entry.itemId);
    if (avail >= targetBase) {
      deductStock(entry.itemId, targetBase);
      lines.push({
        itemId: entry.itemId,
        itemName: entry.itemName,
        unitName: item?.baseUnit ?? entry.unitName,
        requiredBase: round3(rawRequiredBase),
        issuedBase: round3(targetBase),
        carryIn: round3(carryIn),
        carryOut: round3(carryOut),
        kind: targetBase === 0 && carryOut > 0 ? 'carried' : 'full',
        isCritical: entry.isCritical,
        substituteForId: '',
        substituteForName: '',
        note: carryOut > 0 ? `ترحيل كسر (${round3(carryOut)}) للوجبة التالية` : '',
      });
      continue;
    }

    // Partial stock on primary item: issue what is available and mixSubstitute for deficit
    const primaryIssued = avail;
    if (primaryIssued > 0) {
      deductStock(entry.itemId, primaryIssued);
      lines.push({
        itemId: entry.itemId,
        itemName: entry.itemName,
        unitName: item?.baseUnit ?? entry.unitName,
        requiredBase: round3(rawRequiredBase),
        issuedBase: round3(primaryIssued),
        carryIn: round3(carryIn),
        carryOut: 0,
        kind: 'partial',
        isCritical: entry.isCritical,
        substituteForId: '',
        substituteForName: '',
        note: `متاح جزئي (${round3(primaryIssued)} من أصل ${round3(targetBase)})`,
      });
    }

    const deficitBase = Math.max(0, targetBase - primaryIssued);
    let remainingDeficit = deficitBase;

    if (entry.substituteItemId && remainingDeficit > 0) {
      const subItem = itemMap.get(entry.substituteItemId);
      const subRatio = entry.substituteQtyPerPerson > 0 && entry.qtyPerPerson > 0
        ? (entry.substituteQtyPerPerson * (entry.substituteFactor || 1)) / (entry.qtyPerPerson * factor)
        : 1;
      const subRequired = deficitBase * subRatio;
      const subAvail = getStock(entry.substituteItemId);
      const subIssued = Math.min(subAvail, subRequired);
      if (subIssued > 0) {
        deductStock(entry.substituteItemId, subIssued);
        const coveredEquivalent = subRatio > 0 ? subIssued / subRatio : subIssued;
        remainingDeficit = Math.max(0, remainingDeficit - coveredEquivalent);
        lines.push({
          itemId: entry.substituteItemId,
          itemName: entry.substituteItemName || subItem?.name || entry.substituteItemId,
          unitName: subItem?.baseUnit ?? entry.substituteUnitName,
          requiredBase: round3(subRequired),
          issuedBase: round3(subIssued),
          carryIn: 0,
          carryOut: 0,
          kind: 'substitute',
          isCritical: entry.isCritical,
          substituteForId: entry.itemId,
          substituteForName: entry.itemName,
          note: `استكمال بالبديل عن ${entry.itemName}`,
        });
        warnings.push(`تم استكمال عجز "${entry.itemName}" بالبديل "${entry.substituteItemName}"`);
      }
    }

    if (remainingDeficit > 0.001) {
      const msg = `عجز في "${entry.itemName}" بمقدار ${round3(remainingDeficit)} ${item?.baseUnit ?? entry.unitName}`;
      warnings.push(msg);
      if (entry.isCritical) {
        criticalShortfalls.push(msg);
      }
      if (primaryIssued === 0) {
        lines.push({
          itemId: entry.itemId,
          itemName: entry.itemName,
          unitName: item?.baseUnit ?? entry.unitName,
          requiredBase: round3(rawRequiredBase),
          issuedBase: 0,
          carryIn: round3(carryIn),
          carryOut: 0,
          kind: 'partial',
          isCritical: entry.isCritical,
          substituteForId: '',
          substituteForName: '',
          note: msg,
        });
      }
    }
  }

  return {
    lines,
    carryByItem: nextCarry,
    carryBannerItems,
    warnings,
    criticalShortfalls,
    hasHardShortfall: criticalShortfalls.length > 0,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
