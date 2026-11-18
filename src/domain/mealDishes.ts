// Pure MealDishes, DishMenu (7 days standard & ramadan), Auto-Condiments & StdSeasons Engine (Zero Dependencies)

import type { Entitlement, EntitlementGroup, Item, MealPlanEntry, MealType } from './types';
import { dailyRatePerPerson } from './entitlements';
import { computeMealRationWithTemplate, getStandardItems, type OfficialStandardKey, type RationTemplateKey } from './officialStandards';

export interface MealDish {
  id: string;
  name: string;
  itemIds: string[];
  weeklyServings: number;
  defaultMeals: MealType[];
}

export type DayOfWeekKey = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export type DishMenu = Record<DayOfWeekKey, Partial<Record<MealType, string[]>>>;

export const DEFAULT_MEAL_DISHES: MealDish[] = [
  { id: 'dish_kabsa', name: 'كبسة / أرز ودجاج أو لحم', itemIds: [], weeklyServings: 4, defaultMeals: ['LUNCH', 'IFTAR'] },
  { id: 'dish_beans', name: 'فاصولياء / فول مدمس', itemIds: [], weeklyServings: 4, defaultMeals: ['BREAKFAST', 'DINNER', 'SUHOOR'] },
  { id: 'dish_tuna', name: 'تونة ونواشف', itemIds: [], weeklyServings: 3, defaultMeals: ['BREAKFAST', 'DINNER', 'SUHOOR'] },
  { id: 'dish_lentils', name: 'عدس وشوربة', itemIds: [], weeklyServings: 3, defaultMeals: ['DINNER', 'IFTAR', 'SUHOOR'] },
];

export const STD_SEASONS: Array<{
  key: RationTemplateKey;
  label: string;
  description: string;
}> = [
  { key: 'standard', label: 'القياسي المعتاد', description: 'توزيع الوجبات الثلاث القياسية (فطور، غداء، عشاء)' },
  { key: 'ramadan', label: 'موسم رمضان', description: 'وجبتا سحور وإفطار بتركيز التمر والشوربة والسحور' },
  { key: 'summer', label: 'الموسم الصيفي', description: 'زيادة مخصص المياه والليمون وتخفيف الدهون في الغداء' },
  { key: 'emergency', label: 'طوارئ وميدان', description: 'الاعتماد على المعلبات والجاف بدل الطازج والمجمد' },
];

export interface BuildDishMealPlanInput {
  standard: OfficialStandardKey;
  template: RationTemplateKey;
  mealType: MealType;
  selectedDishIds: string[];
  dishes: MealDish[];
  entitlements: Entitlement[];
  groups: EntitlementGroup[];
  items: Item[];
}

/**
 * Combines selected Main Dishes + remaining non-dish Condiments (التوابع)
 * respecting "المجموعة تغلب مقرر الصنف" and seasonal meal weights.
 */
export function buildDishAndCondimentPlan(input: BuildDishMealPlanInput): MealPlanEntry[] {
  const itemMap = new Map(input.items.map((i) => [i.id, i]));
  const dishMemberItemIds = new Set<string>();
  const activeDishes = input.dishes.filter((d) => input.selectedDishIds.includes(d.id));
  for (const d of activeDishes) {
    for (const id of d.itemIds) dishMemberItemIds.add(id);
  }

  const groupMemberIds = new Set<string>();
  for (const g of input.groups) {
    for (const m of g.members) groupMemberIds.add(m.itemId);
  }

  const stdItems = getStandardItems(input.standard);
  const result: MealPlanEntry[] = [];

  for (const ent of input.entitlements) {
    // Group overrides individual item entitlement
    if (!ent.itemId.startsWith('grp:') && groupMemberIds.has(ent.itemId)) continue;

    const item = itemMap.get(ent.itemId);
    const stdMatch = stdItems.find((s) => (item?.name ?? ent.itemName).includes(s.name.split(' ')[0]));
    const inDish = dishMemberItemIds.has(ent.itemId);

    let perPerson = 0;
    if (stdMatch) {
      const servingDish = activeDishes.find((d) => d.itemIds.includes(ent.itemId));
      if (!stdMatch.isCondiment && activeDishes.length > 0 && !inDish && servingDish === undefined) {
        // Main dish item not in today's dish selection -> skip if dishes are explicitly selected
        continue;
      }
      perPerson = computeMealRationWithTemplate(
        stdMatch,
        input.standard,
        input.template,
        input.mealType,
        servingDish?.weeklyServings ?? 3
      );
    } else {
      const daily = dailyRatePerPerson(ent);
      const divisor = input.template === 'ramadan' ? 2 : 3;
      perPerson = Math.round((daily / divisor) * 10000) / 10000;
    }

    if (perPerson <= 0) continue;

    result.push({
      id: `mpe_gen_${ent.itemId}_${input.mealType}`,
      planId: 'generated',
      entryDate: '',
      mealType: input.mealType,
      itemId: ent.itemId,
      itemCode: item?.code ?? '',
      itemName: item?.name ?? ent.itemName,
      unitName: ent.measureUnitName || item?.baseUnit || 'كجم',
      factor: ent.measureFactor > 0 ? ent.measureFactor : 1,
      qtyPerPerson: perPerson,
      isCritical: ent.isCritical,
      substituteItemId: ent.substituteItemId,
      substituteItemName: ent.substituteItemName,
      substituteUnitName: itemMap.get(ent.substituteItemId)?.baseUnit ?? ent.measureUnitName,
      substituteFactor: 1,
      substituteQtyPerPerson: perPerson * (ent.substituteRatio > 0 ? ent.substituteRatio : 1),
      stdKey: stdMatch?.stdKey ?? '',
      notes: inDish ? 'مكون طبق رئيسي' : 'تابع يومي بالأوزان',
    });
  }

  return result;
}
