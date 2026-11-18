// Pure Domain Notification Engine mirroring notification_item.dart & notifications_repo.dart
// Derived from live state, scoped by AppSpace + User Permissions + WarehouseScope, capped per kind.

import { hasPerm } from './accessControl';
import { computeAllocationBalance, type FuelTankBalance } from './fuelEngine';
import { evaluateDaysOfSupply } from './ruleEngine';
import { computeFifoExpiryAlerts } from './stockAlerts';
import { getTotalItemStock, type WarehouseItemBalance } from './stockLedger';
import { computeGlobalTotalStrengthForDate } from './strengthEngine';
import type {
  AppSpace,
  Asset,
  BeneficiaryUnit,
  CampStockLimit,
  CampLedger,
  Entitlement,
  FuelAllocation,
  FuelIssue,
  FuelSettingsRow,
  Issue,
  Item,
  LinkFinCustody,
  LinkPerson,
  MealPlan,
  MonthlySettlement,
  RationOrder,
  Receipt,
  StrengthRecord,
  Transfer,
  User,
  WarehouseStockLimit,
} from './types';

export type NotifySeverity = 'danger' | 'warning' | 'info';

export type NotifyKind =
  | 'warehouseNegative'
  | 'stockCritical'
  | 'expiryAlert'
  | 'assetExpired'
  | 'assetExpiring'
  | 'rationPending'
  | 'issueOrderPending'
  | 'transferPending'
  | 'mealPlanEnding'
  | 'settlementDue'
  | 'fuelLow'
  | 'fuelDrained'
  | 'linkPerson'
  | 'linkFinance';

export interface AppNotification {
  id: string;
  kind: NotifyKind;
  severity: NotifySeverity;
  title: string;
  body: string;
  routeDoor: string;
  perm: string;
  read: boolean;
}

const SEVERITY_RANK: Record<NotifySeverity, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

const PER_KIND_CAP = 8;

const SUPPLY_DOORS = new Set([
  'dashboard',
  'supplyMoves',
  'supplyOrders',
  'documents',
  'supplyDaily',
  'stocktake',
  'campAccounts',
  'supplyReports',
  'supplyData',
  'cables',
  'archive',
  'personnel',
  'linkages',
  'supplyAudit',
  'settings',
]);

const FUEL_DOORS = new Set([
  'fuelDashboard',
  'fuelMoves',
  'fuelAllocations',
  'fuelStocktake',
  'fuelReports',
  'fuelData',
  'fuelSettings',
]);

function daysBetweenIso(fromIso: string, toIso: string): number | null {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function addMonthsIso(dateIso: string, months: number): string {
  const parts = dateIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
  const d = new Date(Date.UTC(parts[0], parts[1] - 1 + months, parts[2]));
  return d.toISOString().slice(0, 10);
}

export function scanSystemNotifications(params: {
  space: AppSpace;
  user: User | null;
  today: string;
  items: Item[];
  entitlements: Entitlement[];
  strengths: StrengthRecord[];
  beneficiaryUnits: BeneficiaryUnit[];
  receipts: Receipt[];
  issues: Issue[];
  transfers: Transfer[];
  rationOrders: RationOrder[];
  mealPlans: MealPlan[];
  assets: Asset[];
  campLedgers: CampLedger[];
  monthlySettlements: MonthlySettlement[];
  campStockLimits: CampStockLimit[];
  warehouseStockLimits: WarehouseStockLimit[];
  ledger: WarehouseItemBalance[];
  fuelTanks: FuelTankBalance[];
  fuelAllocations: FuelAllocation[];
  fuelIssues: FuelIssue[];
  fuelSettings?: FuelSettingsRow;
  persons: LinkPerson[];
  finCustodies: LinkFinCustody[];
  supplyDaysMin: number;
  supplyDaysCritical: number;
  readIds: ReadonlySet<string>;
}): AppNotification[] {
  const {
    space,
    user,
    today,
    items,
    entitlements,
    strengths,
    beneficiaryUnits,
    receipts,
    issues,
    transfers,
    rationOrders,
    mealPlans,
    assets,
    campLedgers,
    monthlySettlements,
    warehouseStockLimits,
    ledger,
    fuelTanks,
    fuelAllocations,
    fuelIssues,
    fuelSettings,
    persons,
    finCustodies,
    supplyDaysMin,
    supplyDaysCritical,
    readIds,
  } = params;

  const allowedDoors = space === 'fuel' ? FUEL_DOORS : SUPPLY_DOORS;
  const inWhScope = (wh: string) =>
    !user || user.warehouseScope === 'ALL' || !wh || user.warehouseScope.includes(wh);
  const canDoor = (door: string, perm: string) =>
    allowedDoors.has(door) && hasPerm(user, perm);

  const raw: Omit<AppNotification, 'read'>[] = [];

  if (space === 'supply') {
    // 1. Negative warehouse stock
    if (canDoor('supplyReports', 'supply.reports')) {
      for (const b of ledger) {
        if (b.balance < 0 && inWhScope(b.warehouse)) {
          raw.push({
            id: `wh.neg.${b.warehouse}.${b.itemId}`,
            kind: 'warehouseNegative',
            severity: 'danger',
            title: `رصيد سالب: ${b.itemName}`,
            body: `المستودع «${b.warehouse}» يظهر رصيداً سالباً (${b.balance} ${b.baseUnit}) — راجع سندات الصرف`,
            routeDoor: 'supplyReports',
            perm: 'supply.reports',
          });
        }
      }

      // 2. Critical / Empty stock (Days of Supply)
      const strength = computeGlobalTotalStrengthForDate(today, strengths, beneficiaryUnits);
      const entMap = new Map(entitlements.map((e) => [e.itemId, e]));
      const allowedWhs =
        user && user.warehouseScope !== 'ALL' ? user.warehouseScope : undefined;
      for (const item of items) {
        const bal = getTotalItemStock(ledger, item.id, allowedWhs);
        const whLimit = warehouseStockLimits.find(
          (l) => l.itemId === item.id && inWhScope(l.warehouseName)
        );
        const dos = evaluateDaysOfSupply(
          bal,
          entMap.get(item.id),
          strength,
          whLimit ? whLimit.minStock : item.minQty,
          supplyDaysMin,
          supplyDaysCritical
        );
        if (dos.status === 'empty' || dos.status === 'critical') {
          raw.push({
            id: `stock.crit.${item.id}`,
            kind: 'stockCritical',
            severity: dos.status === 'empty' ? 'danger' : 'warning',
            title: `${dos.status === 'empty' ? 'نفاد صنف' : 'رصيد حرج'}: ${item.name}`,
            body:
              dos.daysRemaining !== null
                ? `الرصيد ${bal} ${item.baseUnit} — يكفي ${dos.daysRemaining.toFixed(1)} يوم فقط`
                : `الرصيد ${bal} ${item.baseUnit} أقل من الحد الحرج`,
            routeDoor: 'supplyReports',
            perm: 'supply.reports',
          });
        }
      }

      // 3. FIFO Expiry Alerts
      const expiryAlerts = computeFifoExpiryAlerts({
        receipts,
        ledger,
        asOfDate: today,
        warnDays: 45,
      });
      for (const ex of expiryAlerts) {
        if (ex.status === 'watch' || !inWhScope(ex.warehouse)) continue;
        raw.push({
          id: `exp.${ex.receiptRefNo}.${ex.itemId}`,
          kind: 'expiryAlert',
          severity: ex.status === 'expired' ? 'danger' : 'warning',
          title:
            ex.status === 'expired'
              ? `دفعة منتهية الصلاحية: ${ex.itemName}`
              : `قرب انتهاء الصلاحية: ${ex.itemName}`,
          body: `سند ${ex.receiptRefNo} (${ex.warehouse}) — المتبقي ${ex.remainingBatchQty} ${ex.baseUnit} · ينتهي ${ex.expiryDate}`,
          routeDoor: 'supplyReports',
          perm: 'supply.reports',
        });
      }
    }

    // 4. Assets nearing end / expired
    if (canDoor('supplyData', 'supply.data')) {
      for (const a of assets) {
        if (a.status === 'DAMAGED' || a.status === 'RETIRED') continue;
        if (!a.acquisitionDate || a.lifespanMonths <= 0 || !inWhScope(a.warehouse)) continue;
        const endIso = addMonthsIso(a.acquisitionDate, a.lifespanMonths);
        const left = daysBetweenIso(today, endIso);
        if (left === null) continue;
        if (left < 0) {
          raw.push({
            id: `asset.expired.${a.id}`,
            kind: 'assetExpired',
            severity: 'warning',
            title: `انقضى العمر الافتراضي: ${a.name}`,
            body: `انتهى قبل ${Math.abs(left)} يوماً (${a.warehouse || a.facilityName})`,
            routeDoor: 'supplyData',
            perm: 'supply.data',
          });
        } else if (left <= 45) {
          raw.push({
            id: `asset.expiring.${a.id}`,
            kind: 'assetExpiring',
            severity: 'info',
            title: `يقارب انتهاء العمر الافتراضي: ${a.name}`,
            body: `يتبقى ${left} يوماً (${a.warehouse || a.facilityName})`,
            routeDoor: 'supplyData',
            perm: 'supply.data',
          });
        }
      }
    }

    // 5. Pending Ration Orders (>= 3 days old) + Directed Issue Orders (ORDER)
    if (canDoor('supplyOrders', 'supply.orders')) {
      for (const o of rationOrders) {
        if (o.status !== 'PENDING' && o.status !== 'APPROVED') continue;
        if (!inWhScope(o.requestingWarehouse) && !inWhScope(o.supplyingWarehouse)) continue;
        const age = daysBetweenIso(o.date, today) ?? 0;
        if (age < 1) continue;
        raw.push({
          id: `ration.pend.${o.id}`,
          kind: 'rationPending',
          severity: age >= 5 ? 'warning' : 'info',
          title: `طلبية معلقة: ${o.refNo}`,
          body: `من «${o.requestingWarehouse}» منذ ${age} يوم — الحالة: ${o.status === 'PENDING' ? 'قيد الانتظار' : 'معتمدة بانتظار التوريد'}`,
          routeDoor: 'supplyOrders',
          perm: 'supply.orders',
        });
      }

      const seenOrderRefs = new Set<string>();
      for (const iss of issues) {
        if (iss.status !== 'ORDER' || !inWhScope(iss.warehouse)) continue;
        const refKey = iss.refNo || iss.id;
        if (seenOrderRefs.has(refKey)) continue;
        seenOrderRefs.add(refKey);
        raw.push({
          id: `issue.order.${refKey}`,
          kind: 'issueOrderPending',
          severity: 'warning',
          title: `أمر صرف موجّه بانتظار الاعتماد: ${refKey}`,
          body: `${iss.recipientDisplay || iss.beneficiaryUnitName || 'جهة مستفيدة'} — مستودع ${iss.warehouse}`,
          routeDoor: 'supplyOrders',
          perm: 'supply.orders',
        });
      }
    }

    // 6. Pending Transfers
    if (canDoor('supplyMoves', 'supply.moves.read')) {
      const seenTr = new Set<string>();
      for (const tr of transfers) {
        if (tr.status !== 'PENDING') continue;
        if (!inWhScope(tr.warehouse) && !inWhScope(tr.destWarehouse)) continue;
        const key = tr.refNo || tr.id;
        if (seenTr.has(key)) continue;
        seenTr.add(key);
        raw.push({
          id: `tr.pend.${key}`,
          kind: 'transferPending',
          severity: 'info',
          title: `تحويل مخزني في الطريق: ${key}`,
          body: `من ${tr.warehouse} إلى ${tr.destWarehouse} — بانتظار تأكيد الاستلام`,
          routeDoor: 'supplyMoves',
          perm: 'supply.moves.read',
        });
      }
    }

    // 7. Meal Plans ending or ended
    if (canDoor('supplyDaily', 'supply.daily')) {
      for (const p of mealPlans) {
        if (p.status !== 'ACTIVE' || !inWhScope(p.warehouse)) continue;
        const left = daysBetweenIso(today, p.endDate);
        if (left === null) continue;
        if (left < 0) {
          raw.push({
            id: `mealplan.ended.${p.id}`,
            kind: 'mealPlanEnding',
            severity: 'warning',
            title: `انتهت خطة الوجبات: ${p.name}`,
            body: `انتهى نطاق الخطة في ${p.endDate} ولم تُؤرشف أو تُستنسخ`,
            routeDoor: 'supplyDaily',
            perm: 'supply.daily',
          });
        } else if (left <= 3) {
          raw.push({
            id: `mealplan.ending.${p.id}`,
            kind: 'mealPlanEnding',
            severity: 'info',
            title: `توشك خطة الوجبات على الانتهاء: ${p.name}`,
            body: `تنتهي خلال ${left} يوم (${p.endDate}) — يُنصح باستنساخها`,
            routeDoor: 'supplyDaily',
            perm: 'supply.daily',
          });
        }
      }
    }

    // 8. Previous month camp settlement due
    if (canDoor('campAccounts', 'supply.campAccounts')) {
      const [yStr, mStr] = today.split('-');
      const curY = Number(yStr) || new Date().getFullYear();
      const curM = Number(mStr) || new Date().getMonth() + 1;
      const prevY = curM === 1 ? curY - 1 : curY;
      const prevM = curM === 1 ? 12 : curM - 1;
      const settled = monthlySettlements.some((s) => s.year === prevY && s.month === prevM);
      const openPrev = campLedgers.filter(
        (c) => c.year === prevY && c.month === prevM && c.status === 'OPEN'
      );
      if (!settled && openPrev.length > 0) {
        raw.push({
          id: `settlement.${prevY}.${prevM}`,
          kind: 'settlementDue',
          severity: 'warning',
          title: `تصفية شهر ${prevM}/${prevY} غير مكتملة`,
          body: `${openPrev.length} سطر دفتر معسكر مفتوح — الأرصدة لا تُرحّل قبل الإغلاق الشهري`,
          routeDoor: 'campAccounts',
          perm: 'supply.campAccounts',
        });
      }
    }

    // 9. Personnel overdue returns
    if (canDoor('personnel', 'supply.personnel')) {
      for (const p of persons) {
        if (
          p.status !== 'present' &&
          p.status !== 'retired' &&
          p.status !== 'transferred' &&
          p.statusTo &&
          p.statusTo < today
        ) {
          raw.push({
            id: `person.overdue.${p.id}.${p.statusTo}`,
            kind: 'linkPerson',
            severity: 'danger',
            title: `متجاوز المدة: ${p.rank} / ${p.fullName}`,
            body: `انتهى تاريخ الحالة (${p.statusTo}) ولم تُسجّل العودة`,
            routeDoor: 'personnel',
            perm: 'supply.personnel',
          });
        }
      }
    }

    // 10. Financial custody overdue
    if (canDoor('linkages', 'supply.linkages')) {
      for (const fc of finCustodies) {
        if (fc.status === 'open' && fc.dueDate && fc.dueDate < today) {
          raw.push({
            id: `fin.overdue.${fc.id}`,
            kind: 'linkFinance',
            severity: 'warning',
            title: `عهدة مالية متأخرة عن الإخلاء: ${fc.custodyNo}`,
            body: `${fc.holder} — استحقت في ${fc.dueDate} (${fc.amount} ${fc.currency.toUpperCase()})`,
            routeDoor: 'linkages',
            perm: 'supply.linkages',
          });
        }
      }
    }
  } else {
    // FUEL SPACE
    if (canDoor('fuelDashboard', 'fuel.dashboard')) {
      for (const t of fuelTanks) {
        if (t.isLowStock || t.total <= 0) {
          raw.push({
            id: `fuel.tank.${t.warehouseId}`,
            kind: 'fuelLow',
            severity: t.total <= 0 ? 'danger' : 'warning',
            title:
              t.total <= 0
                ? `نفاد مخزون المحطة: ${t.warehouseName}`
                : `انخفاض مستوى الوقود: ${t.warehouseName}`,
            body: `نسبة الإشغال ${t.occupancyPct.toFixed(1)}% (${t.total.toLocaleString()} لتر متبقي)`,
            routeDoor: 'fuelDashboard',
            perm: 'fuel.dashboard',
          });
        }
      }
    }

    if (canDoor('fuelAllocations', 'fuel.allocations')) {
      const effectiveFuelSettings: FuelSettingsRow = fuelSettings ?? {
        id: 'default',
        lowStockPercent: 20,
        defaultDailyLiters: 0,
        defaultWeeklyLiters: 0,
        defaultMonthlyLiters: 0,
        parentOrg: '',
        agencyTitle: '',
        commandTitle: '',
        branchTitle: '',
        orgName: '',
        sealLines: '',
        roleOfficer: '',
        roleSupply: '',
        roleChief: '',
        signOfficer: '',
        signSupply: '',
        signChief: '',
        requireChassis: false,
        allowExceptional: true,
        carryCapPeriods: 4,
        notes: '',
        updatedAt: '',
      };
      for (const a of fuelAllocations) {
        if (!a.active) continue;
        const calc = computeAllocationBalance(a, fuelIssues, effectiveFuelSettings, today);
        if (calc.grossEntitled > 0 && calc.remainingBalance <= 0) {
          raw.push({
            id: `fuel.alloc.drained.${a.id}`,
            kind: 'fuelDrained',
            severity: 'warning',
            title: `استُنفد استحقاق الوقود: ${a.unitName}`,
            body: `${a.refNo} (${a.fuelType === 'petrol' ? 'بترول' : 'ديزل'}) — المصروف ${calc.issuedSoFar} من أصل ${calc.grossEntitled} لتر`,
            routeDoor: 'fuelAllocations',
            perm: 'fuel.allocations',
          });
        }
      }
    }
  }

  // Group and cap per kind (max PER_KIND_CAP)
  const withRead: AppNotification[] = raw.map((n) => ({
    ...n,
    read: readIds.has(n.id),
  }));

  const sortFn = (a: AppNotification, b: AppNotification) => {
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sr !== 0) return sr;
    if (a.read !== b.read) return a.read ? 1 : -1;
    return a.id.localeCompare(b.id);
  };

  const byKind = new Map<NotifyKind, AppNotification[]>();
  for (const n of withRead) {
    const list = byKind.get(n.kind) ?? [];
    list.push(n);
    byKind.set(n.kind, list);
  }

  const out: AppNotification[] = [];
  for (const [kind, list] of byKind.entries()) {
    const sorted = [...list].sort(sortFn);
    out.push(...sorted.slice(0, PER_KIND_CAP));
    const hidden = sorted.length - PER_KIND_CAP;
    if (hidden > 0) {
      const sample = sorted[0];
      out.push({
        id: `more.${kind}`,
        kind,
        severity: 'info',
        title: `و ${hidden} تنبيهات إضافية من نفس النوع`,
        body: 'اضغط لفتح الشاشة ومراجعة القائمة الكاملة',
        routeDoor: sample.routeDoor,
        perm: sample.perm,
        read: false,
      });
    }
  }

  return out.sort(sortFn);
}
