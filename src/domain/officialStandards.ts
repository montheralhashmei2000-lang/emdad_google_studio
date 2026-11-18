// Pure OfficialStandards & MealDishes Engine
// Supports detailed32 (31-day base) & compact27 (30-day base), 4 templates, main dishes vs daily condiment weights

import type { MealType } from './types';

export type OfficialStandardKey = 'detailed32' | 'compact27';
export type RationTemplateKey = 'standard' | 'ramadan' | 'summer' | 'emergency';
export type RationCycleDays = 31 | 30 | 15 | 7 | 1;

export interface OfficialStandardItem {
  stdKey: string;
  name: string;
  unit: string;
  monthlyQtyPerPerson: number; // per 31 days in detailed32, per 30 days in compact27
  isCondiment: boolean;
  isCritical: boolean;
  mealWeights?: Partial<Record<MealType, number>>; // e.g., { BREAKFAST: 40, LUNCH: 20, DINNER: 40 }
  dishGroup?: string;
}

export const DETAILED_32_ITEMS: OfficialStandardItem[] = [
  { stdKey: 'rice', name: 'أرز بسمتي', unit: 'كجم', monthlyQtyPerPerson: 9.3, isCondiment: false, isCritical: true, dishGroup: 'كبسة' },
  { stdKey: 'flour', name: 'دقيق أبيض', unit: 'كجم', monthlyQtyPerPerson: 9.3, isCondiment: true, isCritical: true, mealWeights: { BREAKFAST: 40, LUNCH: 20, DINNER: 40 } },
  { stdKey: 'flour_red', name: 'دقيق بر', unit: 'كجم', monthlyQtyPerPerson: 3.1, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 40, LUNCH: 20, DINNER: 40 } },
  { stdKey: 'sugar', name: 'سكر', unit: 'كجم', monthlyQtyPerPerson: 2.17, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 50, LUNCH: 0, DINNER: 50 } },
  { stdKey: 'tea', name: 'شاي أحمر', unit: 'كجم', monthlyQtyPerPerson: 0.31, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 50, LUNCH: 0, DINNER: 50 } },
  { stdKey: 'oil', name: 'زيت نباتي', unit: 'لتر', monthlyQtyPerPerson: 2.48, isCondiment: true, isCritical: true, mealWeights: { BREAKFAST: 25, LUNCH: 50, DINNER: 25 } },
  { stdKey: 'tomato_paste', name: 'معجون طماطم', unit: 'كجم', monthlyQtyPerPerson: 1.55, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 20, LUNCH: 60, DINNER: 20 } },
  { stdKey: 'beans', name: 'فاصولياء معلبة', unit: 'علبة', monthlyQtyPerPerson: 12, isCondiment: false, isCritical: false, dishGroup: 'فاصولياء' },
  { stdKey: 'tuna', name: 'تونة معلبة', unit: 'علبة', monthlyQtyPerPerson: 8, isCondiment: false, isCritical: false, dishGroup: 'تونة' },
  { stdKey: 'chicken', name: 'دجاج مجمد', unit: 'كجم', monthlyQtyPerPerson: 6.2, isCondiment: false, isCritical: true, dishGroup: 'كبسة' },
  { stdKey: 'meat', name: 'لحم مجمّد', unit: 'كجم', monthlyQtyPerPerson: 3.1, isCondiment: false, isCritical: false, dishGroup: 'كبسة' },
  { stdKey: 'lentils', name: 'عدس أصفر', unit: 'كجم', monthlyQtyPerPerson: 1.55, isCondiment: false, isCritical: false, dishGroup: 'نواشف' },
  { stdKey: 'milk_powder', name: 'حليب مجفف', unit: 'كجم', monthlyQtyPerPerson: 1.55, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 60, LUNCH: 0, DINNER: 40 } },
  { stdKey: 'cheese', name: 'جبنة مثلثات/معلبة', unit: 'كجم', monthlyQtyPerPerson: 1.24, isCondiment: false, isCritical: false, dishGroup: 'نواشف' },
  { stdKey: 'jam', name: 'مربى', unit: 'كجم', monthlyQtyPerPerson: 0.93, isCondiment: false, isCritical: false, dishGroup: 'نواشف' },
  { stdKey: 'halawa', name: 'حلاوة طحينية', unit: 'كجم', monthlyQtyPerPerson: 0.93, isCondiment: false, isCritical: false, dishGroup: 'نواشف' },
  { stdKey: 'onion', name: 'بصل جاف', unit: 'كجم', monthlyQtyPerPerson: 3.1, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 25, LUNCH: 50, DINNER: 25 } },
  { stdKey: 'garlic', name: 'ثوم', unit: 'كجم', monthlyQtyPerPerson: 0.31, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 20, LUNCH: 60, DINNER: 20 } },
  { stdKey: 'potato', name: 'بطاطس', unit: 'كجم', monthlyQtyPerPerson: 3.1, isCondiment: false, isCritical: false, dishGroup: 'فاصولياء' },
  { stdKey: 'tomato_fresh', name: 'طماطم طازجة', unit: 'كجم', monthlyQtyPerPerson: 3.1, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 30, LUNCH: 40, DINNER: 30 } },
  { stdKey: 'lemon', name: 'ليمون', unit: 'كجم', monthlyQtyPerPerson: 0.62, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 10, LUNCH: 70, DINNER: 20 } },
  { stdKey: 'spices', name: 'بهارات مشكلة', unit: 'كجم', monthlyQtyPerPerson: 0.31, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 20, LUNCH: 60, DINNER: 20 } },
  { stdKey: 'salt', name: 'ملح طعام', unit: 'كجم', monthlyQtyPerPerson: 0.62, isCondiment: true, isCritical: true, mealWeights: { BREAKFAST: 25, LUNCH: 50, DINNER: 25 } },
  { stdKey: 'yeast', name: 'خميرة فورية', unit: 'كجم', monthlyQtyPerPerson: 0.155, isCondiment: true, isCritical: true, mealWeights: { BREAKFAST: 40, LUNCH: 20, DINNER: 40 } },
  { stdKey: 'dates', name: 'تمر', unit: 'كجم', monthlyQtyPerPerson: 1.55, isCondiment: false, isCritical: false, dishGroup: 'نواشف' },
  { stdKey: 'pasta', name: 'مكرونة', unit: 'كجم', monthlyQtyPerPerson: 1.55, isCondiment: false, isCritical: false, dishGroup: 'كبسة' },
  { stdKey: 'fava_beans', name: 'فول معلب', unit: 'علبة', monthlyQtyPerPerson: 10, isCondiment: false, isCritical: false, dishGroup: 'فاصولياء' },
  { stdKey: 'peppers', name: 'فلفل أخضر', unit: 'كجم', monthlyQtyPerPerson: 0.62, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 30, LUNCH: 40, DINNER: 30 } },
  { stdKey: 'ghee', name: 'سمن نباتي', unit: 'كجم', monthlyQtyPerPerson: 0.93, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 30, LUNCH: 40, DINNER: 30 } },
  { stdKey: 'vinegar', name: 'خل أبيض', unit: 'لتر', monthlyQtyPerPerson: 0.31, isCondiment: true, isCritical: false, mealWeights: { BREAKFAST: 0, LUNCH: 80, DINNER: 20 } },
  { stdKey: 'gas', name: 'غاز طهي', unit: 'أسطوانة', monthlyQtyPerPerson: 0.08, isCondiment: true, isCritical: true, mealWeights: { BREAKFAST: 30, LUNCH: 40, DINNER: 30 } },
  { stdKey: 'water', name: 'مياه شرب معبأة', unit: 'لتر', monthlyQtyPerPerson: 93, isCondiment: true, isCritical: true, mealWeights: { BREAKFAST: 30, LUNCH: 40, DINNER: 30 } },
];

export const COMPACT_27_ITEMS: OfficialStandardItem[] = DETAILED_32_ITEMS.slice(0, 27).map((item) => ({
  ...item,
  monthlyQtyPerPerson: Math.round(((item.monthlyQtyPerPerson / 31) * 30) * 1000) / 1000,
}));

export function getStandardBaseDays(standard: OfficialStandardKey): number {
  return standard === 'detailed32' ? 31 : 30;
}

export function getStandardItems(standard: OfficialStandardKey): OfficialStandardItem[] {
  return standard === 'detailed32' ? DETAILED_32_ITEMS : COMPACT_27_ITEMS;
}

export function computeMealRationWithTemplate(
  item: OfficialStandardItem,
  standard: OfficialStandardKey,
  template: RationTemplateKey,
  mealType: MealType,
  weeklyDishServings = 3
): number {
  const baseDays = getStandardBaseDays(standard);
  let dailyPerPerson = item.monthlyQtyPerPerson / baseDays;

  // Template adjustments
  if (template === 'summer') {
    if (item.stdKey === 'lemon') dailyPerPerson *= 2;
    if (item.stdKey === 'water') dailyPerPerson *= 1.3;
  } else if (template === 'emergency') {
    if (item.stdKey === 'tomato_fresh' || item.stdKey === 'potato' || item.stdKey === 'chicken') {
      dailyPerPerson = 0; // replaced by canned/dry
    }
    if (item.stdKey === 'tuna' || item.stdKey === 'beans') {
      dailyPerPerson *= 1.5;
    }
  }

  if (item.isCondiment) {
    let weights = item.mealWeights ?? { BREAKFAST: 33, LUNCH: 34, DINNER: 33 };
    if (template === 'ramadan') {
      if (mealType === 'SUHOOR') {
        const w = weights.BREAKFAST ?? 30;
        return Math.round(dailyPerPerson * (w / 100) * 10000) / 10000;
      }
      if (mealType === 'IFTAR') {
        const w = (weights.LUNCH ?? 40) + (weights.DINNER ?? 30);
        return Math.round(dailyPerPerson * (w / 100) * 10000) / 10000;
      }
      return 0;
    }
    if (template === 'summer' && item.stdKey === 'tomato_fresh') {
      weights = { BREAKFAST: 15, LUNCH: 70, DINNER: 15 };
    }
    const w = weights[mealType] ?? 0;
    return Math.round(dailyPerPerson * (w / 100) * 10000) / 10000;
  } else {
    // Main dish ingredient: weekly entitlement divided by number of weekly servings
    const weeklyEntitlement = dailyPerPerson * 7;
    return Math.round((weeklyEntitlement / Math.max(1, weeklyDishServings)) * 10000) / 10000;
  }
}

export function computeCycleQuantity(
  monthlyQtyPerPerson: number,
  standard: OfficialStandardKey,
  cycleDays: RationCycleDays,
  strength: number
): number {
  const baseDays = getStandardBaseDays(standard);
  return Math.round(((monthlyQtyPerPerson / baseDays) * cycleDays * strength) * 1000) / 1000;
}
