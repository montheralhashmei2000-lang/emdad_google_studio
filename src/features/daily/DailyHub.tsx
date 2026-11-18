// Daily Operations Hub (Part 2 Complete: Copy Prev Strength, Weekly Sat-Fri Menu + Dishes + Condiments, CarryBanner Reset, RationVariance 3-color, Inline Ratios Grid + OfficialRationDialogs 32/27 Calculator)

import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Copy, Download, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdFld,
  ImdModal,
  ImdNote,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
  ImdTabs,
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { todayIso } from '../../core/ui/imdTokens';
import { Ids } from '../../core/security/crypto';
import { exportRowsToXlsx } from '../../core/export/excelEngine';
import {
  computeCampStrengthForDate,
  computeFacilityStrengthForDate,
  resolveMealHeadcount,
} from '../../domain/strengthEngine';
import {
  computeMealRationWithTemplate,
  getStandardItems,
  type RationTemplateKey,
} from '../../domain/officialStandards';
import {
  buildDishAndCondimentPlan,
  DEFAULT_MEAL_DISHES,
  STD_SEASONS,
  type MealDish,
} from '../../domain/mealDishes';
import { runSmartRationDispenser } from '../../domain/smartDispenser';
import { dailyRatePerPerson, distributeGroupRequirement } from '../../domain/entitlements';
import type {
  Entitlement,
  EntitlementGroup,
  Issue,
  KitchenLog,
  MealDispatch,
  MealDispatchLine,
  MealHeadcount,
  MealPlan,
  MealPlanEntry,
  MealType,
  StrengthRecord,
} from '../../domain/types';

const WEEK_DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const DEFAULT_WEEKLY_DISHES: Record<string, { b: string; l: string; d: string; suhoor: string; iftar: string }> = {
  السبت: { b: 'فول + خبز بر + شاي', l: 'كبسة دجاج + سلطة', d: 'عدس + فاصولياء + خبز', suhoor: 'أرز بالحليب + تمر', iftar: 'كبسة دجاج + شوربة' },
  الأحد: { b: 'تونة + جبن + خبز', l: 'أرز أبيض + إدام لحم', d: 'مكرونة + صلصة + شاي', suhoor: 'فول + خبز + لبن', iftar: 'إدام لحم + سمبوسة' },
  الإثنين: { b: 'فاصولياء + شاي بالحليب', l: 'مقلوبة دجاج + خضار', d: 'تونة + خبز بر', suhoor: 'عدس + خبز + تمر', iftar: 'مقلوبة دجاج + عصير' },
  الثلاثاء: { b: 'عدس + خبز + زيتون', l: 'أرز بسمتي + دجاج مشوي', d: 'فول + أجبان', suhoor: 'فاصولياء + خبز', iftar: 'دجاج مشوي + أرز' },
  الأربعاء: { b: 'فول + تونة + شاي', l: 'مندي دجاج + مرق', d: 'شوربة + خبز + مربى', suhoor: 'تونة + لبن + تمر', iftar: 'مندي دجاج + شوربة' },
  الخميس: { b: 'فاصولياء + خبز أبيض', l: 'أرز كابلي + دجاج', d: 'عدس + زيت نباتي', suhoor: 'أرز + زبادي', iftar: 'أرز كابلي + تمر' },
  الجمعة: { b: 'إفطار متكامل + حلاوة', l: 'مضغوط دجاج مميز', d: 'تونة + فاصولياء + شاي', suhoor: 'فول + تمر + لبن', iftar: 'مضغوط دجاج + فواكه' },
};

export const DailyHub: React.FC = () => {
  const { db, currentUser, ledger, navIntent, clearNavIntent, upsertRow, deleteRow, mutateDb, nextDocRef, logAudit, notify, openPrintPreview, fmt } =
    useEmdad();
  const [tab, setTab] = useState<'strength' | 'ops' | 'ratios'>('strength');
  const [opsSubTab, setOpsSubTab] = useState<'plans' | 'dispense' | 'kitchen'>('dispense');
  const [ratioSubTab, setRatioSubTab] = useState<'items' | 'groups'>('items');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'supplyDaily') return;
    if (navIntent.subTab === 'strength' || navIntent.subTab === 'ops' || navIntent.subTab === 'ratios') {
      setTab(navIntent.subTab);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  // --- Strength State ---
  const [strDate, setStrDate] = useState(todayIso());
  const [strMode, setStrMode] = useState<'detail' | 'camp'>('detail');
  const [strUnitId, setStrUnitId] = useState(db.beneficiary_units[1]?.id ?? db.beneficiary_units[0]?.id ?? '');
  const [soldiers, setSoldiers] = useState('380');
  const [officers, setOfficers] = useState('24');

  // --- Meal Plan Template Generator + Dishes + Weekly Menu ---
  const [tplKey, setTplKey] = useState<RationTemplateKey>('standard');
  const [planFacId, setPlanFacId] = useState(db.facilities[0]?.id ?? '');
  const [planWh, setPlanWh] = useState(db.facilities[0]?.warehouse ?? db.warehouses[0]?.name ?? '');
  const [weeklyMenu, setWeeklyMenu] = useState(DEFAULT_WEEKLY_DISHES);
  const [dishes, setDishes] = useState<MealDish[]>(DEFAULT_MEAL_DISHES);
  const [selectedDishIds, setSelectedDishIds] = useState<string[]>(() =>
    DEFAULT_MEAL_DISHES.map((d) => d.id)
  );
  const [newDishName, setNewDishName] = useState('');
  const [newDishServings, setNewDishServings] = useState('3');

  // --- Smart Dispenser State ---
  const [dispPlanId, setDispPlanId] = useState(db.meal_plans[0]?.id ?? '');
  const [dispDate, setDispDate] = useState(todayIso());
  const [dispMeal, setDispMeal] = useState<MealType>('LUNCH');
  const [headcountOverride, setHeadcountOverride] = useState('');
  const [wastePct, setWastePct] = useState('3');
  const [wholePacks, setWholePacks] = useState(true);
  const [carryMap, setCarryMap] = useState<Record<string, number>>({});
  const [flushCarry, setFlushCarry] = useState(false);

  // --- Entitlement Form + Official Standards Dialog State ---
  const [entItemId, setEntItemId] = useState(db.items[0]?.id ?? '');
  const [entQty, setEntQty] = useState('9');
  const [entCritical, setEntCritical] = useState('true');
  const [entSubId, setEntSubId] = useState('');

  const [stdModalOpen, setStdModalOpen] = useState(false);
  const [stdKind, setStdKind] = useState<'detailed32' | 'compact27'>(db.config.officialStandard);
  const [stdForce, setStdForce] = useState('500');
  const [stdDays, setStdDays] = useState('30');

  // --- Group Simulator State ---
  const [simGrpId, setSimGrpId] = useState(db.entitlement_groups[0]?.id ?? '');
  const [simReqBase, setSimReqBase] = useState('500');
  const [simWh, setSimWh] = useState(db.warehouses[0]?.name ?? '');

  const camps = db.beneficiary_units.filter((u) => u.isCamp);

  const handleSaveStrength = () => {
    const unit = db.beneficiary_units.find((u) => u.id === strUnitId);
    if (!unit) return;
    const sCount = Math.max(0, Number(soldiers) || 0);
    const oCount = Math.max(0, Number(officers) || 0);
    const total = sCount + oCount;
    const campId = unit.isCamp ? unit.id : unit.parentId;
    const campName = unit.isCamp
      ? unit.name
      : db.beneficiary_units.find((u) => u.id === unit.parentId)?.name ?? '';

    const rec: StrengthRecord = {
      id: Ids.next('str'),
      unitId: unit.id,
      unitName: unit.name,
      campId,
      campName,
      strengthDate: strDate,
      soldierCount: sCount,
      officerCount: oCount,
      total,
      pct: 100,
      mode: unit.isCamp ? 'camp' : strMode,
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    upsertRow('strengths', rec);
    logAudit({
      action: 'RECORD_STRENGTH',
      entityType: 'strengths',
      summary: `تفريدة يوم ${strDate} لـ ${unit.name}: ${total} فرد وضابط`,
      target: unit.name,
      qty: total,
    });
    notify(`تم حفظ التفريدة (${total} فرد)`, 'success');
  };

  // Copy Previous Day Strength button
  const handleCopyPreviousDayStrength = () => {
    const d = new Date(strDate);
    d.setDate(d.getDate() - 1);
    const prevIso = d.toISOString().slice(0, 10);
    const prevRows = db.strengths.filter((s) => s.strengthDate === prevIso);
    const sourceRows =
      prevRows.length > 0
        ? prevRows
        : db.strengths.filter((s) => s.strengthDate < strDate).slice(0, 4);

    if (sourceRows.length === 0) {
      notify('لا توجد تفريدة سابقة لنسخها', 'warn');
      return;
    }

    const copied: StrengthRecord[] = sourceRows.map((s) => ({
      ...s,
      id: Ids.next('str'),
      strengthDate: strDate,
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    }));
    mutateDb((prev) => ({
      ...prev,
      strengths: [...copied, ...prev.strengths],
    }));
    notify(`تم نسخ ${copied.length} سجلات تفريدة إلى يوم ${strDate}`, 'success');
  };

  const handleGeneratePlanFromTemplate = () => {
    const fac = db.facilities.find((f) => f.id === planFacId) ?? db.facilities[0];
    if (!fac) return;
    const now = new Date().toISOString();
    const planId = Ids.next('mpl');
    const tplLabel =
      tplKey === 'ramadan'
        ? 'رمضان (سحور/إفطار)'
        : tplKey === 'summer'
        ? 'القالب الصيفي'
        : tplKey === 'emergency'
        ? 'الطوارئ والميدان'
        : 'القالب القياسي';
    const plan: MealPlan = {
      id: planId,
      name: `خطة ${tplLabel} — ${fac.name}`,
      planType: 'WEEKLY',
      startDate: todayIso(),
      endDate: todayIso(),
      status: 'ACTIVE',
      facilityId: fac.id,
      facilityName: fac.name,
      warehouse: planWh || fac.warehouse,
      notes: `مولّدة آلياً وفق معيار ${db.config.officialStandard}`,
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };

    const mealTypes: MealType[] = tplKey === 'ramadan' ? ['SUHOOR', 'IFTAR'] : ['BREAKFAST', 'LUNCH', 'DINNER'];
    const entries: MealPlanEntry[] = [];

    for (const mType of mealTypes) {
      if (db.entitlements.length > 0) {
        const built = buildDishAndCondimentPlan({
          standard: db.config.officialStandard,
          template: tplKey,
          mealType: mType,
          selectedDishIds,
          dishes,
          entitlements: db.entitlements,
          groups: db.entitlement_groups,
          items: db.items,
        });
        for (const b of built) {
          entries.push({
            ...b,
            id: Ids.next('mpe'),
            planId,
            entryDate: todayIso(),
          });
        }
      } else {
        const stdItems = getStandardItems(db.config.officialStandard).slice(0, 8);
        for (const std of stdItems) {
          const matchedItem =
            db.items.find((i) => i.name.includes(std.name.split(' ')[0])) ?? db.items[0];
          if (!matchedItem) continue;
          const perPerson = computeMealRationWithTemplate(
            std,
            db.config.officialStandard,
            tplKey,
            mType,
            3
          );
          if (perPerson <= 0) continue;
          entries.push({
            id: Ids.next('mpe'),
            planId,
            entryDate: todayIso(),
            mealType: mType,
            itemId: matchedItem.id,
            itemCode: matchedItem.code,
            itemName: matchedItem.name,
            unitName: matchedItem.baseUnit,
            factor: 1,
            qtyPerPerson: perPerson,
            isCritical: std.isCritical,
            substituteItemId: '',
            substituteItemName: '',
            substituteUnitName: '',
            substituteFactor: 1,
            substituteQtyPerPerson: 0,
            stdKey: std.stdKey,
            notes: std.isCondiment ? 'توابع يومية' : 'طبق رئيسي',
          });
        }
      }
    }

    mutateDb((prev) => ({
      ...prev,
      meal_plans: [plan, ...prev.meal_plans],
      meal_plan_entries: [...entries, ...prev.meal_plan_entries],
    }));
    setDispPlanId(planId);
    notify(`تم توليد خطة الوجبات (${tplLabel}) بـ ${entries.length} بند`, 'success');
  };

  // Smart Dispenser live preview
  const dispPlan = db.meal_plans.find((p) => p.id === dispPlanId) ?? db.meal_plans[0];
  const dispFac = db.facilities.find((f) => f.id === dispPlan?.facilityId) ?? db.facilities[0];
  const dispEntries = useMemo(
    () =>
      db.meal_plan_entries.filter(
        (e) => e.planId === dispPlan?.id && e.mealType === dispMeal
      ),
    [db.meal_plan_entries, dispPlan?.id, dispMeal]
  );

  const resolvedHc = dispFac
    ? resolveMealHeadcount(
        dispFac,
        dispDate,
        dispMeal,
        db.meal_headcounts,
        db.strengths,
        db.beneficiary_units
      )
    : { headcount: 0, source: 'dayTotal' as const };
  const effectiveHeadcount =
    Number(headcountOverride) > 0 ? Number(headcountOverride) : resolvedHc.headcount;

  const dispenserPreview = useMemo(() => {
    if (!dispPlan) return null;
    return runSmartRationDispenser({
      entries: dispEntries,
      headcount: effectiveHeadcount,
      wastePct: Number(wastePct) || 0,
      wholePacks: flushCarry ? false : wholePacks,
      warehouse: dispPlan.warehouse,
      ledger,
      items: db.items,
      previousCarryByItem: carryMap,
    });
  }, [dispPlan, dispEntries, effectiveHeadcount, wastePct, wholePacks, flushCarry, ledger, db.items, carryMap]);

  const handleConfirmMealDispatch = () => {
    if (!dispPlan || !dispFac || !dispenserPreview) return;
    if (dispenserPreview.hasHardShortfall && currentUser?.role !== 'owner') {
      notify('يوجد عجز في صنف حرج — يتطلب اعتماد المالك للمتابعة', 'danger');
      return;
    }

    const issueRef = nextDocRef('issue');
    const now = new Date().toISOString();
    const dispatchId = Ids.next('mdsp');

    const dispatch: MealDispatch = {
      id: dispatchId,
      issueRef,
      planId: dispPlan.id,
      planName: dispPlan.name,
      facilityId: dispFac.id,
      facilityName: dispFac.name,
      warehouse: dispPlan.warehouse,
      date: dispDate,
      mealType: dispMeal,
      headcount: effectiveHeadcount,
      wastePct: Number(wastePct) || 0,
      wholePacks,
      decision: dispenserPreview.hasHardShortfall
        ? 'hard'
        : dispenserPreview.warnings.length > 0
        ? 'soft'
        : 'pass',
      reason: '',
      warnings: dispenserPreview.warnings,
      overrideBy: dispenserPreview.hasHardShortfall ? currentUser?.name ?? '' : '',
      overrideToken: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
    };

    const newIssues: Issue[] = [];
    const newKitchenLogs: KitchenLog[] = [];
    const newDispatchLines: MealDispatchLine[] = [];

    for (const ln of dispenserPreview.lines) {
      const item = db.items.find((i) => i.id === ln.itemId);
      newDispatchLines.push({
        id: Ids.next('mdl'),
        dispatchId,
        itemId: ln.itemId,
        itemName: ln.itemName,
        unitName: ln.unitName,
        requiredBase: ln.requiredBase,
        issuedBase: ln.issuedBase,
        carryIn: carryMap[ln.itemId] ?? 0,
        carryOut: dispenserPreview.carryByItem[ln.itemId] ?? 0,
        kind: ln.kind,
        isCritical: ln.isCritical,
        substituteForId: '',
        substituteForName: '',
        note: ln.note,
      });
      if (ln.issuedBase <= 0) continue;
      newIssues.push({
        id: Ids.next('iss'),
        refNo: issueRef,
        date: dispDate,
        warehouse: dispPlan.warehouse,
        itemId: ln.itemId,
        itemCode: item?.code ?? '',
        itemName: ln.itemName,
        unitName: ln.unitName,
        factor: 1,
        qty: ln.issuedBase,
        baseQty: ln.issuedBase,
        status: 'COMPLETED',
        notes: `صرف وجبة ${dispMeal} — ${ln.note || dispPlan.name}`,
        createdBy: currentUser?.name ?? '',
        createdAt: now,
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
        targetType: 1,
        recipientDisplay: dispFac.name,
        unitId: '',
        facilityId: dispFac.id,
        beneficiaryUnitId: '',
        beneficiaryUnitName: '',
        soldierCount: effectiveHeadcount,
        officerCount: 0,
        durationDays: 1,
        approvedBy: currentUser?.name ?? '',
        rejectReason: '',
        rejectedBy: '',
        cylinderAction: '',
        receiverName: dispFac.name,
      });

      newKitchenLogs.push({
        id: Ids.next('kl'),
        facilityId: dispFac.id,
        facilityName: dispFac.name,
        date: dispDate,
        mealType: dispMeal,
        strength: effectiveHeadcount,
        itemId: ln.itemId,
        itemName: ln.itemName,
        unitName: ln.unitName,
        qty: ln.issuedBase,
        baseQty: ln.issuedBase,
        expectedBase: ln.requiredBase,
        varianceBase: Math.round((ln.issuedBase - ln.requiredBase) * 1000) / 1000,
        notes: ln.note,
        createdAt: now,
      });
    }

    setCarryMap(flushCarry ? {} : dispenserPreview.carryByItem);
    setFlushCarry(false);
    mutateDb((prev) => ({
      ...prev,
      meal_dispatches: [dispatch, ...prev.meal_dispatches],
      meal_dispatch_lines: [...newDispatchLines, ...prev.meal_dispatch_lines],
      issues: [...newIssues, ...prev.issues],
      kitchen_logs: [...newKitchenLogs, ...prev.kitchen_logs],
    }));
    logAudit({
      action: 'MEAL_DISPATCH',
      entityType: 'meal_dispatches',
      summary: `صرف وجبة ${dispMeal} لـ ${dispFac.name} (${effectiveHeadcount} فرد) بسند ${issueRef}`,
      refNo: issueRef,
      warehouse: dispPlan.warehouse,
      target: dispFac.name,
    });
    notify(`تم صرف الوجبة بنجاح وتوليد سند ${issueRef}`, 'success');
  };

  const handleSaveMealHeadcount = () => {
    if (!dispFac) return;
    const countVal = Math.max(0, Number(headcountOverride) || resolvedHc.headcount);
    const existing = db.meal_headcounts.find(
      (h) => h.facilityId === dispFac.id && h.date === dispDate && h.mealType === dispMeal
    );
    const now = new Date().toISOString();
    const rec: MealHeadcount = {
      id: existing?.id ?? Ids.next('mhc'),
      facilityId: dispFac.id,
      facilityName: dispFac.name,
      date: dispDate,
      mealType: dispMeal,
      headcount: countVal,
      notes: existing?.notes ?? '',
      createdBy: currentUser?.name ?? '',
      updatedAt: now,
    };
    upsertRow('meal_headcounts', rec);
    notify(`تم تثبيت عدد الحاضرين لوجبة ${dispMeal} (${countVal} فرد) ليوم ${dispDate}`, 'success');
  };

  const handleSaveEntitlement = () => {
    const item = db.items.find((i) => i.id === entItemId);
    const sub = db.items.find((i) => i.id === entSubId);
    if (!item) return;
    const ent: Entitlement = {
      itemId: item.id,
      itemName: item.name,
      qtyPerPerson: Math.max(0, Number(entQty) || 0),
      measureUnitName: item.baseUnit,
      measureFactor: 1,
      notes: '',
      isCritical: entCritical === 'true',
      substituteItemId: sub?.id ?? '',
      substituteItemName: sub?.name ?? '',
      substituteRatio: 1,
      updatedAt: new Date().toISOString(),
    };
    upsertRow('entitlements', ent);
    notify(`تم تحديث مقرر ${item.name}`, 'success');
  };

  const simGroup: EntitlementGroup | undefined =
    db.entitlement_groups.find((g) => g.id === simGrpId) ?? db.entitlement_groups[0];
  const simResult = useMemo(() => {
    if (!simGroup) return null;
    return distributeGroupRequirement(
      simGroup,
      Math.max(0, Number(simReqBase) || 0),
      simWh,
      ledger,
      db.items
    );
  }, [simGroup, simReqBase, simWh, ledger, db.items]);

  // Official Standards Interactive Dialog calculations
  const stdCalcRows = useMemo(() => {
    const force = Math.max(1, Number(stdForce) || 0);
    const days = Math.max(1, Number(stdDays) || 0);
    const baseDays = stdKind === 'detailed32' ? 31 : 30;
    return getStandardItems(stdKind).map((s, idx) => {
      const exactTotal = (s.monthlyQtyPerPerson / baseDays) * force * days;
      const matched = db.items.find((i) => i.name.includes(s.name.split(' ')[0]));
      const pack = matched?.units[matched.units.length - 1];
      const packsRounded = pack && pack.factor > 1 ? Math.ceil(exactTotal / pack.factor) : null;
      return {
        idx: idx + 1,
        name: s.name,
        unit: s.unit,
        monthlyQty: s.monthlyQtyPerPerson,
        dailyRate: s.monthlyQtyPerPerson / baseDays,
        totalQty: Math.round(exactTotal * 100) / 100,
        packLabel: packsRounded && pack ? `${packsRounded} ${pack.name}` : '—',
        isCritical: s.isCritical,
      };
    });
  }, [stdKind, stdForce, stdDays, db.items]);

  const handleDeleteStrength = (r: StrengthRecord) => {
    deleteRow('strengths', r.id);
    logAudit({
      action: 'DELETE_STRENGTH',
      entityType: 'strengths',
      summary: `حذف سجل تفريدة يوم ${r.strengthDate} — ${r.unitName} (${r.total} فرد)`,
      risk: 'sensitive',
      target: r.unitName,
      qty: r.total,
    });
    notify(`تم حذف سجل التفريدة لـ ${r.unitName}`, 'warn');
  };

  const handlePrintDailyStrength = () => {
    const dayRows = db.strengths.filter((s) => s.strengthDate === strDate);
    const list = dayRows.length > 0 ? dayRows : db.strengths.slice(0, 30);
    openPrintPreview({
      formKey: 'daily_strength',
      space: 'supply',
      title: `كشف التفريدة اليومية للقوة — ${strDate}`,
      refNo: `STR-${strDate.replace(/-/g, '')}`,
      date: strDate,
      warehouse: 'كافة المعسكرات والوحدات',
      partyLabel: 'التاريخ',
      partyValue: strDate,
      opType: 'التفريدة اليومية',
      columns: ['التاريخ', 'الوحدة / المعسكر', 'المعسكر التابع', 'الوضع', 'الأفراد', 'الضباط', 'الإجمالي'],
      rows: list.map((r) => [
        r.strengthDate,
        r.unitName,
        r.campName || '—',
        r.mode === 'camp' ? 'إجمالي معسكر' : 'تفصيلي وحدة',
        fmt(r.soldierCount, 0),
        fmt(r.officerCount, 0),
        fmt(r.total, 0),
      ]),
      totalQty: list.reduce((s, r) => s + r.total, 0),
      actorName: currentUser?.name ?? '',
    });
  };

  const handlePrintRatios = () => {
    openPrintPreview({
      formKey: 'entitlement_ratios',
      space: 'supply',
      title: 'جدول مقررات الاستحقاق الرسمية للأصناف (30 يوماً)',
      refNo: `RAT-${todayIso().replace(/-/g, '')}`,
      date: todayIso(),
      warehouse: 'المعيار المعتمد بالإعدادات',
      partyLabel: 'المعيار الرسمي',
      partyValue: db.config.officialStandard === 'detailed32' ? 'معيار 32 صنفاً (31 يوماً)' : 'معيار 27 صنفاً (30 يوماً)',
      opType: 'مقررات الاستحقاق',
      columns: ['الصنف', 'المقرر الشهري (30 يوم)', 'الوحدة', 'المعدل اليومي', 'التصنيف', 'البديل'],
      rows: db.entitlements.map((r) => [
        r.itemName,
        fmt(r.qtyPerPerson),
        r.measureUnitName,
        fmt(dailyRatePerPerson(r), 4),
        r.isCritical ? 'حرج' : 'تكميلي',
        r.substituteItemName || '—',
      ]),
      totalQty: db.entitlements.length,
      actorName: currentUser?.name ?? '',
    });
  };

  const handleExportRatios = () => {
    exportRowsToXlsx(
      `emdad_entitlements_${todayIso()}.xlsx`,
      'Entitlements',
      [
        { header: 'الصنف', key: 'itemName' },
        { header: 'المقرر الشهري للفرد', key: 'qtyPerPerson' },
        { header: 'الوحدة', key: 'measureUnitName' },
        { header: 'المعدل اليومي للفرد', key: 'dailyRate' },
        { header: 'صنف حرج', key: 'criticalLabel' },
        { header: 'البديل المعتمد', key: 'substituteItemName' },
      ],
      db.entitlements.map((r) => ({
        itemName: r.itemName,
        qtyPerPerson: r.qtyPerPerson,
        measureUnitName: r.measureUnitName,
        dailyRate: Number(dailyRatePerPerson(r).toFixed(4)),
        criticalLabel: r.isCritical ? 'حرج' : 'تكميلي',
        substituteItemName: r.substituteItemName || '',
      }))
    );
    notify('تم تصدير جدول مقررات الاستحقاق إلى Excel', 'success');
  };

  const strCols: ImdColumn<StrengthRecord>[] = [
    { key: 'dt', header: 'التاريخ', numeric: true, sortValue: (r) => r.strengthDate, render: (r) => r.strengthDate },
    { key: 'unit', header: 'الوحدة / المعسكر', sortValue: (r) => r.unitName, render: (r) => r.unitName },
    { key: 'camp', header: 'المعسكر التابع', render: (r) => r.campName || '—' },
    { key: 'mode', header: 'الوضع', render: (r) => (r.mode === 'camp' ? 'إجمالي معسكر' : 'تفصيلي وحدة') },
    { key: 'sol', header: 'أفراد', numeric: true, render: (r) => fmt(r.soldierCount, 0) },
    { key: 'off', header: 'ضباط', numeric: true, render: (r) => fmt(r.officerCount, 0) },
    { key: 'tot', header: 'الإجمالي', numeric: true, render: (r) => <strong>{fmt(r.total, 0)}</strong> },
    {
      key: 'act',
      header: 'حذف',
      render: (r) => (
        <ImdButton size="sm" variant="ghost" title="حذف سجل التفريدة" onClick={() => handleDeleteStrength(r)}>
          <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
        </ImdButton>
      ),
    },
  ];

  return (
    <ImdPage
      title="التشغيل اليومي والوجبات والاستحقاق"
      subtitle="التفريدة اليومية · خطط وصرف الوجبات الذكي · مؤشر الانحراف · نسب الاستحقاق والمعايير الرسمية"
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as 'strength' | 'ops' | 'ratios')}
        tabs={[
          { id: 'strength', label: 'التفريدة اليومية', count: db.strengths.length },
          { id: 'ops', label: 'التخطيط والتشغيل (الوجبات)', count: db.meal_dispatches.length },
          { id: 'ratios', label: 'نسب الاستحقاق', count: db.entitlements.length },
        ]}
      />

      {tab === 'strength' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {camps.map((c) => {
              const res = computeCampStrengthForDate(c.id, strDate, db.strengths, db.beneficiary_units);
              return (
                <div
                  key={c.id}
                  className="border border-[var(--imd-line)] bg-[var(--imd-surface)] p-3.5"
                  style={{ borderRadius: 'var(--imd-radius)' }}
                >
                  <div className="text-xs text-[var(--imd-muted)]">{c.name} ({strDate})</div>
                  <div className="text-xl font-bold mt-1 tabular-nums">{fmt(res.total, 0)} فرد</div>
                  <div className="text-[11px] text-[var(--imd-muted)] mt-0.5">
                    أفراد: {fmt(res.soldiers, 0)} · ضباط: {fmt(res.officers, 0)} · المصدر:{' '}
                    {res.source === 'camp' ? 'سجل معسكر' : res.source === 'detail' ? 'تجميع الوحدات' : 'لا يوجد'}
                  </div>
                </div>
              );
            })}
            {db.facilities.slice(0, 1).map((f) => {
              const facStr = computeFacilityStrengthForDate(f, strDate, db.strengths, db.beneficiary_units);
              return (
                <div
                  key={f.id}
                  className="border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] p-3.5"
                  style={{ borderRadius: 'var(--imd-radius)' }}
                >
                  <div className="text-xs text-[var(--imd-muted)]">قوة {f.name}</div>
                  <div className="text-xl font-bold mt-1 tabular-nums text-[var(--imd-accent)]">
                    {fmt(facStr, 0)} مستفيد
                  </div>
                  <div className="text-[11px] text-[var(--imd-muted)] mt-0.5">بدون جمع مزدوج</div>
                </div>
              );
            })}
          </div>

          <ImdPanel
            title="تسجيل التفريدة اليومية"
            headerRight={
              <div className="flex items-center gap-2">
                <ImdButton size="sm" variant="secondary" onClick={handleCopyPreviousDayStrength}>
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ تفريدة اليوم السابق</span>
                </ImdButton>
                <ImdButton size="sm" variant="secondary" onClick={handlePrintDailyStrength}>
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة التفريدة اليومية</span>
                </ImdButton>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdFld label="التاريخ" type="date" value={strDate} onChange={setStrDate} />
              <ImdSelect
                label="الوحدة / المعسكر"
                value={strUnitId}
                onChange={setStrUnitId}
                options={db.beneficiary_units.map((u) => ({
                  value: u.id,
                  label: `${u.isCamp ? '[معسكر] ' : ''}${u.name}`,
                }))}
              />
              <ImdSelect
                label="وضع التسجيل"
                value={strMode}
                onChange={(v) => setStrMode(v as 'detail' | 'camp')}
                options={[
                  { value: 'detail', label: 'تفصيلي وحدة' },
                  { value: 'camp', label: 'إجمالي معسكر' },
                ]}
              />
              <ImdFld label="عدد الأفراد" type="number" value={soldiers} onChange={setSoldiers} />
              <ImdFld label="عدد الضباط" type="number" value={officers} onChange={setOfficers} />
            </div>
            <div className="mt-3 flex justify-end">
              <ImdButton variant="primary" onClick={handleSaveStrength}>
                <Check className="w-4 h-4" />
                <span>اعتماد التفريدة</span>
              </ImdButton>
            </div>
          </ImdPanel>

          <ImdPanel
            title="أرشيف التفريدات المسجلة"
            headerRight={
              <ImdButton size="sm" variant="ghost" onClick={handlePrintDailyStrength}>
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة الكشف</span>
              </ImdButton>
            }
          >
            <ImdTable columns={strCols} rows={db.strengths} rowKey={(r) => r.id} />
          </ImdPanel>
        </div>
      )}

      {tab === 'ops' && (
        <div className="space-y-4">
          <ImdTabs
            active={opsSubTab}
            onChange={(v) => setOpsSubTab(v as 'plans' | 'dispense' | 'kitchen')}
            tabs={[
              { id: 'dispense', label: 'صرف الوجبات الذكي' },
              { id: 'plans', label: 'خطط الوجبات والقائمة الأسبوعية', count: db.meal_plans.length },
              { id: 'kitchen', label: 'سجل الطهي ومؤشر الانحراف', count: db.kitchen_logs.length },
            ]}
          />

          {opsSubTab === 'dispense' && (
            <ImdPanel
              title="محرك صرف الوجبات الذكي (SmartRationDispenser)"
              subtitle="يتتبع الرصيد الجاري، يستكمل بالبديل (mixSubstitute)، ويرحّل كسور العبوات"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <ImdSelect
                  label="خطة الوجبات"
                  value={dispPlanId}
                  onChange={setDispPlanId}
                  options={db.meal_plans.map((p) => ({ value: p.id, label: p.name }))}
                  className="lg:col-span-2"
                />
                <ImdFld label="التاريخ" type="date" value={dispDate} onChange={setDispDate} />
                <ImdSelect
                  label="الوجبة"
                  value={dispMeal}
                  onChange={(v) => setDispMeal(v as MealType)}
                  options={[
                    { value: 'BREAKFAST', label: 'الإفطار' },
                    { value: 'LUNCH', label: 'الغداء' },
                    { value: 'DINNER', label: 'العشاء' },
                    { value: 'SUHOOR', label: 'السحور' },
                    { value: 'IFTAR', label: 'الإفطار (رمضان)' },
                  ]}
                />
                <div className="flex items-end gap-1.5">
                  <ImdFld
                    label={`قوة الوجبة (تلقائي: ${resolvedHc.headcount})`}
                    type="number"
                    value={headcountOverride}
                    onChange={setHeadcountOverride}
                    placeholder={String(resolvedHc.headcount)}
                    className="flex-1"
                  />
                  <ImdButton size="sm" variant="secondary" title="حفظ قوة الوجبة (MealHeadcount)" onClick={handleSaveMealHeadcount}>
                    تثبيت
                  </ImdButton>
                </div>
                <ImdFld label="نسبة الهدر %" type="number" value={wastePct} onChange={setWastePct} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wholePacks}
                      onChange={(e) => setWholePacks(e.target.checked)}
                    />
                    <span>صرف عبوات صحيحة وترحيل الكسور للوجبة التالية (wholePacks)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer text-[var(--imd-accent)]">
                    <input
                      type="checkbox"
                      checked={flushCarry}
                      onChange={(e) => setFlushCarry(e.target.checked)}
                    />
                    <span>إضافة وتصفير الكسور المتراكمة في هذا الصرف</span>
                  </label>
                </div>
                <div className="text-xs text-[var(--imd-muted)]">
                  المستودع المغذي: <strong>{dispPlan?.warehouse}</strong>
                </div>
              </div>

              {dispenserPreview && dispenserPreview.carryBannerItems.length > 0 && (
                <div className="mb-3">
                  <ImdNote tone="info" title="تنبيه ترحيل العبوات (CarryBanner)">
                    بلغت الكسور المرحلة عبوة كاملة للأصناف:{' '}
                    {dispenserPreview.carryBannerItems.map((b) => `${b.itemName} (${b.carryPacks})`).join('، ')}
                  </ImdNote>
                </div>
              )}

              {dispenserPreview && dispenserPreview.warnings.length > 0 && (
                <div className="mb-3">
                  <ImdNote tone={dispenserPreview.hasHardShortfall ? 'danger' : 'note'}>
                    {dispenserPreview.warnings.join(' · ')}
                  </ImdNote>
                </div>
              )}

              <ImdTable
                columns={[
                  { key: 'item', header: 'الصنف', render: (r) => r.itemName },
                  {
                    key: 'crit',
                    header: 'التصنيف',
                    render: (r) => (
                      <ImdStatusText
                        label={r.isCritical ? 'حرج' : 'تكميلي'}
                        tone={r.isCritical ? 'danger' : 'muted'}
                      />
                    ),
                  },
                  { key: 'req', header: 'المطلوب بالأساس', numeric: true, render: (r) => `${fmt(r.requiredBase)} ${r.unitName}` },
                  { key: 'iss', header: 'المصروف الفعلي', numeric: true, render: (r) => <strong>{fmt(r.issuedBase)} {r.unitName}</strong> },
                  {
                    key: 'kind',
                    header: 'حالة الصرف',
                    render: (r) => (
                      <ImdStatusText
                        label={
                          r.kind === 'full'
                            ? 'كامل'
                            : r.kind === 'substitute'
                            ? 'استكمال بالبديل'
                            : r.kind === 'carried'
                            ? 'مرحّل'
                            : 'جزئي / عجز'
                        }
                        tone={
                          r.kind === 'full'
                            ? 'success'
                            : r.kind === 'substitute'
                            ? 'info'
                            : 'warn'
                        }
                      />
                    ),
                  },
                  { key: 'note', header: 'البيان', render: (r) => r.note || '—' },
                ]}
                rows={dispenserPreview?.lines ?? []}
                rowKey={(r, idx) => `${r.itemId}-${idx}`}
                emptyTitle="لا توجد بنود لهذه الوجبة في الخطة المختارة"
                emptyHint="اختر وجبة الغداء أو ولّد خطة وجبات جديدة من القوالب"
              />

              <div className="mt-4 flex justify-end">
                <ImdButton
                  variant="primary"
                  onClick={handleConfirmMealDispatch}
                  disabled={!dispenserPreview || dispenserPreview.lines.length === 0}
                >
                  <Check className="w-4 h-4" />
                  <span>اعتماد صرف الوجبة وتوليد سند الصرف</span>
                </ImdButton>
              </div>
            </ImdPanel>
          )}

          {opsSubTab === 'plans' && (
            <div className="space-y-4">
              <ImdPanel
                title="توليد خطة وجبات من المعايير الرسمية والمواسم (StdSeasons & MealDishes)"
                subtitle={`المعيار المعتمد بالإعدادات: ${db.config.officialStandard === 'detailed32' ? 'الجدول التفصيلي 32 صنفاً (31 يوماً)' : 'الجدول المدمج 27 صنفاً (30 يوماً)'}`}
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <ImdSelect
                    label="الموسم / القالب"
                    value={tplKey}
                    onChange={(v) => setTplKey(v as RationTemplateKey)}
                    options={STD_SEASONS.map((s) => ({ value: s.key, label: s.label }))}
                  />
                  <ImdSelect
                    label="المطبخ / الفرن"
                    value={planFacId}
                    onChange={setPlanFacId}
                    options={db.facilities.map((f) => ({ value: f.id, label: f.name }))}
                  />
                  <ImdSelect
                    label="المستودع المغذي"
                    value={planWh}
                    onChange={setPlanWh}
                    options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
                  />
                  <ImdButton variant="primary" onClick={handleGeneratePlanFromTemplate}>
                    <Sparkles className="w-4 h-4" />
                    <span>توليد خطة وجبات</span>
                  </ImdButton>
                </div>

                {/* Main Dishes Selection & Quick Add (MealDish) */}
                <div className="mt-4 pt-3 border-t border-[var(--imd-line)] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--imd-text2)]">
                      الأطباق الرئيسية المشمولة (MealDishes — تُدمج تلقائياً مع التوابع اليومية):
                    </span>
                    <span className="text-[11px] text-[var(--imd-muted)]">
                      {STD_SEASONS.find((s) => s.key === tplKey)?.description}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dishes.map((dish) => {
                      const active = selectedDishIds.includes(dish.id);
                      return (
                        <button
                          key={dish.id}
                          type="button"
                          onClick={() =>
                            setSelectedDishIds((prev) =>
                              active ? prev.filter((x) => x !== dish.id) : [...prev, dish.id]
                            )
                          }
                          className={`px-2.5 py-1 text-xs border cursor-pointer transition-colors ${
                            active
                              ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-semibold'
                              : 'border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-[var(--imd-muted)]'
                          }`}
                          style={{ borderRadius: 'var(--imd-radius-sm)' }}
                        >
                          {dish.name} ({dish.weeklyServings}/أسبوع)
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end pt-1">
                    <ImdFld
                      label="إضافة طبق رئيسي مخصص"
                      value={newDishName}
                      onChange={setNewDishName}
                      placeholder="مثال: سليق دجاج"
                      className="md:col-span-2"
                    />
                    <ImdFld
                      label="مرات التقديم بالأسبوع"
                      type="number"
                      value={newDishServings}
                      onChange={setNewDishServings}
                    />
                    <ImdButton
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!newDishName.trim()) return;
                        const d: MealDish = {
                          id: Ids.next('dish'),
                          name: newDishName.trim(),
                          itemIds: [],
                          weeklyServings: Math.max(1, Number(newDishServings) || 3),
                          defaultMeals: ['LUNCH'],
                        };
                        setDishes((p) => [...p, d]);
                        setSelectedDishIds((p) => [...p, d.id]);
                        setNewDishName('');
                        notify(`تمت إضافة الطبق "${d.name}"`, 'success');
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة طبق</span>
                    </ImdButton>
                  </div>
                </div>
              </ImdPanel>

              {/* Weekly Menu Grid (Saturday -> Friday) */}
              <ImdPanel
                title={tplKey === 'ramadan' ? 'القائمة الأسبوعية لرمضان (سحور / إفطار)' : 'القائمة الأسبوعية للأطباق الأساسية (السبت — الجمعة)'}
                subtitle="قابلة للتعديل المباشر لكل يوم ووجبة"
              >
                <ImdTable
                  columns={
                    tplKey === 'ramadan'
                      ? [
                          { key: 'day', header: 'اليوم', render: (d) => <strong>{d}</strong> },
                          {
                            key: 'suh',
                            header: 'وجبة السحور',
                            render: (d) => (
                              <input
                                value={weeklyMenu[d].suhoor}
                                onChange={(e) =>
                                  setWeeklyMenu((p) => ({ ...p, [d]: { ...p[d], suhoor: e.target.value } }))
                                }
                                className="w-full h-8 px-2 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
                              />
                            ),
                          },
                          {
                            key: 'ift',
                            header: 'وجبة الإفطار (رمضان)',
                            render: (d) => (
                              <input
                                value={weeklyMenu[d].iftar}
                                onChange={(e) =>
                                  setWeeklyMenu((p) => ({ ...p, [d]: { ...p[d], iftar: e.target.value } }))
                                }
                                className="w-full h-8 px-2 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
                              />
                            ),
                          },
                        ]
                      : [
                          { key: 'day', header: 'اليوم', render: (d) => <strong>{d}</strong> },
                          {
                            key: 'b',
                            header: 'الإفطار',
                            render: (d) => (
                              <input
                                value={weeklyMenu[d].b}
                                onChange={(e) => setWeeklyMenu((p) => ({ ...p, [d]: { ...p[d], b: e.target.value } }))}
                                className="w-full h-8 px-2 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
                              />
                            ),
                          },
                          {
                            key: 'l',
                            header: 'الغداء',
                            render: (d) => (
                              <input
                                value={weeklyMenu[d].l}
                                onChange={(e) => setWeeklyMenu((p) => ({ ...p, [d]: { ...p[d], l: e.target.value } }))}
                                className="w-full h-8 px-2 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
                              />
                            ),
                          },
                          {
                            key: 'd',
                            header: 'العشاء',
                            render: (d) => (
                              <input
                                value={weeklyMenu[d].d}
                                onChange={(e) => setWeeklyMenu((p) => ({ ...p, [d]: { ...p[d], d: e.target.value } }))}
                                className="w-full h-8 px-2 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
                              />
                            ),
                          },
                        ]
                  }
                  rows={WEEK_DAYS_AR}
                  rowKey={(d) => d}
                  reportCountToStatusBar={false}
                />
              </ImdPanel>

              <ImdPanel title="خطط الوجبات النشطة والمحفوظة">
                <ImdTable
                  columns={[
                    { key: 'n', header: 'اسم الخطة', render: (r) => r.name },
                    { key: 'f', header: 'المنشأة', render: (r) => r.facilityName },
                    { key: 'w', header: 'المستودع', render: (r) => r.warehouse },
                    { key: 'd', header: 'الفترة', numeric: true, render: (r) => `${r.startDate} → ${r.endDate}` },
                    { key: 's', header: 'الحالة', render: (r) => <ImdStatusText label={r.status === 'ACTIVE' ? 'نشطة' : r.status} tone="success" /> },
                  ]}
                  rows={db.meal_plans}
                  rowKey={(r) => r.id}
                />
              </ImdPanel>
            </div>
          )}

          {opsSubTab === 'kitchen' && (
            <ImdPanel
              title="سجل التشغيل والطهي ومؤشر الانحراف (RationVarianceView)"
              subtitle="أخضر: ضمن ±5% (طبيعي) · أصفر: نقص إمداد (>15% تحت المتوقع) · أحمر: تجاوز وهدر"
            >
              <ImdTable
                columns={[
                  { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
                  { key: 'fac', header: 'المطبخ', render: (r) => r.facilityName },
                  { key: 'meal', header: 'الوجبة', render: (r) => r.mealType },
                  { key: 'str', header: 'القوة', numeric: true, render: (r) => fmt(r.strength, 0) },
                  { key: 'itm', header: 'الصنف', render: (r) => r.itemName },
                  { key: 'act', header: 'المصروف الفعلي', numeric: true, render: (r) => `${fmt(r.baseQty)} ${r.unitName}` },
                  { key: 'exp', header: 'المخطط القياسي', numeric: true, render: (r) => `${fmt(r.expectedBase)} ${r.unitName}` },
                  {
                    key: 'var',
                    header: 'مؤشر الانحراف 3-أبعاد',
                    numeric: true,
                    render: (r) => {
                      const pct = r.expectedBase > 0 ? ((r.baseQty - r.expectedBase) / r.expectedBase) * 100 : 0;
                      const isNormal = Math.abs(pct) <= 5;
                      const isShortfall = pct < -15;
                      const color = isNormal
                        ? 'var(--imd-success)'
                        : isShortfall
                        ? 'var(--imd-warn)'
                        : pct > 5
                        ? 'var(--imd-danger)'
                        : 'var(--imd-info)';
                      const label = isNormal
                        ? 'طبيعي ±5%'
                        : isShortfall
                        ? 'نقص إمداد >15%'
                        : pct > 5
                        ? 'تجاوز وهدر'
                        : 'انحراف طفيف';
                      return (
                        <span className="font-bold" style={{ color }}>
                          {pct > 0 ? `+${fmt(pct, 1)}%` : `${fmt(pct, 1)}%`} ({label})
                        </span>
                      );
                    },
                  },
                ]}
                rows={db.kitchen_logs}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}
        </div>
      )}

      {tab === 'ratios' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ImdTabs
              active={ratioSubTab}
              onChange={(v) => setRatioSubTab(v as 'items' | 'groups')}
              tabs={[
                { id: 'items', label: 'مقررات الأصناف (30 يوم)', count: db.entitlements.length },
                { id: 'groups', label: 'مجموعات الاستحقاق (grp:)', count: db.entitlement_groups.length },
              ]}
            />
            <div className="flex items-center gap-2">
              <ImdButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStdKind('detailed32');
                  setStdModalOpen(true);
                }}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>معيار 1 (32 صنفاً / 31 يوماً)</span>
              </ImdButton>
              <ImdButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStdKind('compact27');
                  setStdModalOpen(true);
                }}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>معيار 2 (27 صنفاً / 30 يوماً)</span>
              </ImdButton>
            </div>
          </div>

          {ratioSubTab === 'items' && (
            <div className="space-y-4">
              <ImdPanel title="تحديث / إضافة مقرر صنف">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <ImdSelect
                    label="الصنف"
                    value={entItemId}
                    onChange={setEntItemId}
                    options={db.items.map((i) => ({ value: i.id, label: i.name }))}
                  />
                  <ImdFld label="المقرر الشهري للفرد (30 يوم)" type="number" value={entQty} onChange={setEntQty} />
                  <ImdSelect
                    label="الأهمية"
                    value={entCritical}
                    onChange={setEntCritical}
                    options={[
                      { value: 'true', label: 'صنف حرج (يوقف الصرف عند العجز)' },
                      { value: 'false', label: 'صنف تكميلي' },
                    ]}
                  />
                  <ImdSelect
                    label="الصنف البديل"
                    value={entSubId}
                    onChange={setEntSubId}
                    options={[
                      { value: '', label: 'بدون بديل' },
                      ...db.items.map((i) => ({ value: i.id, label: i.name })),
                    ]}
                  />
                  <ImdButton variant="primary" onClick={handleSaveEntitlement}>
                    <Plus className="w-4 h-4" />
                    <span>حفظ المقرر</span>
                  </ImdButton>
                </div>
              </ImdPanel>

              <ImdPanel
                title="جدول مقررات الاستحقاق (تحرير شبكي مباشر)"
                headerRight={
                  <div className="flex items-center gap-2">
                    <ImdButton size="sm" variant="secondary" onClick={handleExportRatios}>
                      <Download className="w-3.5 h-3.5" />
                      <span>تصدير Excel</span>
                    </ImdButton>
                    <ImdButton size="sm" variant="secondary" onClick={handlePrintRatios}>
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة مقررات الاستحقاق</span>
                    </ImdButton>
                  </div>
                }
              >
                <ImdTable
                  columns={[
                    { key: 'name', header: 'الصنف / المجموعة', render: (r) => r.itemName },
                    {
                      key: 'm',
                      header: 'المقرر الشهري (30 يوم)',
                      numeric: true,
                      render: (r) => (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={r.qtyPerPerson}
                            onChange={(e) =>
                              upsertRow('entitlements', {
                                ...r,
                                qtyPerPerson: Math.max(0, Number(e.target.value) || 0),
                                updatedAt: new Date().toISOString(),
                              })
                            }
                            className="w-20 h-7 px-1.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] tabular-nums"
                          />
                          <span>{r.measureUnitName}</span>
                        </div>
                      ),
                    },
                    { key: 'd', header: 'المعدل اليومي للفرد', numeric: true, render: (r) => `${fmt(dailyRatePerPerson(r), 4)} ${r.measureUnitName}` },
                    { key: 'crit', header: 'حرج؟', render: (r) => <ImdStatusText label={r.isCritical ? 'حرج' : 'تكميلي'} tone={r.isCritical ? 'danger' : 'muted'} /> },
                    { key: 'sub', header: 'البديل المعتمد', render: (r) => r.substituteItemName || '—' },
                    {
                      key: 'del',
                      header: 'حذف',
                      render: (r) => (
                        <ImdButton
                          size="sm"
                          variant="ghost"
                          title="حذف المقرر"
                          onClick={() => {
                            deleteRow('entitlements', r.itemId);
                            notify(`تم حذف مقرر "${r.itemName}"`, 'warn');
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                        </ImdButton>
                      ),
                    },
                  ]}
                  rows={db.entitlements}
                  rowKey={(r) => r.itemId}
                />
              </ImdPanel>
            </div>
          )}

          {ratioSubTab === 'groups' && (
            <div className="space-y-4">
              <ImdPanel title="محاكي توزيع مجموعات الاستحقاق (byStock · shares · priority)">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <ImdSelect
                    label="المجموعة"
                    value={simGrpId}
                    onChange={setSimGrpId}
                    options={db.entitlement_groups.map((g) => ({
                      value: g.id,
                      label: `${g.name} (${g.distMode})`,
                    }))}
                  />
                  <ImdSelect
                    label="المستودع"
                    value={simWh}
                    onChange={setSimWh}
                    options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
                  />
                  <ImdFld label="الكمية المطلوب توزيعها" type="number" value={simReqBase} onChange={setSimReqBase} />
                </div>
                {simResult && (
                  <ImdTable
                    columns={[
                      { key: 'n', header: 'الصنف العضو', render: (r) => r.itemName },
                      { key: 'stk', header: 'المتوفر بالمستودع', numeric: true, render: (r) => fmt(r.availableStock) },
                      { key: 'alloc', header: 'الكمية الموزعة', numeric: true, render: (r) => <strong>{fmt(r.allocatedBase)}</strong> },
                      { key: 'pct', header: 'النسبة %', numeric: true, render: (r) => `${fmt(r.shareUsedPct, 1)}%` },
                    ]}
                    rows={simResult.lines}
                    rowKey={(r) => r.itemId}
                  />
                )}
              </ImdPanel>
            </div>
          )}
        </div>
      )}

      {/* OfficialRationDialogs Calculator Modal */}
      <ImdModal
        open={stdModalOpen}
        onClose={() => setStdModalOpen(false)}
        title={`حاسبة المعايير الرسمية — ${stdKind === 'detailed32' ? 'معيار 1 (32 صنفاً / 31 يوماً)' : 'معيار 2 (27 صنفاً / 30 يوماً)'}`}
        widthClass="max-w-4xl"
        footer={
          <>
            <ImdButton
              variant="secondary"
              onClick={() =>
                openPrintPreview({
                  formKey: 'official_ration_std',
                  space: 'supply',
                  title: `جدول الاحتياج وفق ${stdKind === 'detailed32' ? 'معيار 1 (32 صنفاً / 31 يوماً)' : 'معيار 2 (27 صنفاً / 30 يوماً)'}`,
                  refNo: `STD-${todayIso().replace(/-/g, '')}`,
                  date: todayIso(),
                  warehouse: `قوة ${stdForce} فرد لمدة ${stdDays} يوماً`,
                  partyLabel: 'المعيار',
                  partyValue: stdKind === 'detailed32' ? '32 صنفاً / 31 يوماً' : '27 صنفاً / 30 يوماً',
                  opType: 'حاسبة المعيار الرسمي',
                  columns: ['م', 'المادة', 'مقرر الفرد/الشهر', 'الحصة اليومية', 'الكمية المستحقة', 'تقريب العبوات'],
                  rows: stdCalcRows.map((r) => [
                    String(r.idx),
                    r.name,
                    `${fmt(r.monthlyQty)} ${r.unit}`,
                    fmt(r.dailyRate, 4),
                    `${fmt(r.totalQty)} ${r.unit}`,
                    r.packLabel,
                  ]),
                  totalQty: stdCalcRows.length,
                  actorName: currentUser?.name ?? '',
                })
              }
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة جدول المعيار</span>
            </ImdButton>
            <ImdButton variant="primary" onClick={() => setStdModalOpen(false)}>إغلاق</ImdButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <ImdSelect
            label="المعيار"
            value={stdKind}
            onChange={(v) => setStdKind(v as 'detailed32' | 'compact27')}
            options={[
              { value: 'detailed32', label: 'معيار 1: 32 صنفاً (31 يوم)' },
              { value: 'compact27', label: 'معيار 2: 27 صنفاً (30 يوم)' },
            ]}
          />
          <ImdFld label="القوة البشرية (أفراد + ضباط)" type="number" value={stdForce} onChange={setStdForce} />
          <ImdFld label="عدد الأيام" type="number" value={stdDays} onChange={setStdDays} />
        </div>
        <ImdTable
          columns={[
            { key: 'i', header: 'م', numeric: true, render: (r) => r.idx },
            { key: 'n', header: 'المادة', render: (r) => r.name },
            { key: 'm', header: 'مقرر الفرد/الشهر', numeric: true, render: (r) => `${fmt(r.monthlyQty)} ${r.unit}` },
            { key: 'd', header: 'الحصة اليومية', numeric: true, render: (r) => fmt(r.dailyRate, 4) },
            { key: 'tot', header: 'الكمية المستحقة', numeric: true, render: (r) => <strong>{fmt(r.totalQty)} {r.unit}</strong> },
            { key: 'pk', header: 'تقريب العبوات/الكراتين', render: (r) => r.packLabel },
          ]}
          rows={stdCalcRows}
          rowKey={(r) => String(r.idx)}
          reportCountToStatusBar={false}
        />
      </ImdModal>
    </ImdPage>
  );
};
