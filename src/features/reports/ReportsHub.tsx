// Supply Reports Hub (3 Tabs: مركز التقارير - 9 تقارير شاملة، الأرصدة الحالية، تنبيهات المخزون)

import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Printer, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdFld,
  ImdModal,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
  ImdTabs,
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { exportRowsToXlsx } from '../../core/export/excelEngine';
import {
  loadDailyFormVars,
  saveDailyFormVars,
  type DailyFormVars,
  type DailySignerSlot,
} from '../../core/print/printEngine';
import { Ids } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import { filterAllowedWarehouses } from '../../domain/accessControl';
import { computeGlobalTotalStrengthForDate } from '../../domain/strengthEngine';
import { evaluateDaysOfSupply } from '../../domain/ruleEngine';
import { computeFifoExpiryAlerts } from '../../domain/stockAlerts';
import { getTotalItemStock, isMovementActive, type WarehouseItemBalance } from '../../domain/stockLedger';
import type { CampStockLimit, WarehouseStockLimit } from '../../domain/types';

const NINE_REPORTS = [
  { id: 'r1', title: '1. تقرير الأرصدة الختامية للمستودعات', desc: 'رصيد الافتتاح والوارد والمنصرف والمتبقي لكل صنف ومستودع' },
  { id: 'r2', title: '2. تقرير الوارد والتوريدات', desc: 'تفاصيل سندات الاستلام حسب الموردين والفواتير' },
  { id: 'r3', title: '3. تقرير الصرف للوحدات والمطابخ', desc: 'حصر المنصرف الفعلي للكتائب والمعسكرات والمنشآت' },
  { id: 'r4', title: '4. تقرير التحويلات المخزنية', desc: 'التحويلات الصادرة والواردة بين المستودع الرئيسي والفرعية' },
  { id: 'r5', title: '5. تقرير الاستحقاق ومؤشر الكفاية', desc: 'أيام التغطية المتبقية (Days of Supply) ومعدل الاستهلاك اليومي' },
  { id: 'r6', title: '6. تقرير أسطوانات الغاز والتعبئة', desc: 'موقف الأسطوانات الممتلئة والفارغة وقيد التعبئة' },
  { id: 'r7', title: '7. تقرير تواريخ الصلاحية', desc: 'متابعة التوريدات ذات تواريخ الانتهاء القريبة' },
  { id: 'r8', title: '8. تقرير سجل الأصول الثابتة', desc: 'الأصول والمعدات وحالتها الفنية وعهدتها' },
  { id: 'r9', title: '9. التقرير الإحصائي الشهري الموحد', desc: 'ملخص شامل للحركة والقوة والطلبيات' },
];

export const ReportsHub: React.FC = () => {
  const { db, currentUser, ledger, navIntent, clearNavIntent, upsertRow, deleteRow, notify, openPrintPreview, fmt } = useEmdad();
  const [tab, setTab] = useState<'center' | 'daily_form' | 'balances' | 'alerts'>('center');
  const [selectedReportId, setSelectedReportId] = useState('r1');
  const [whFilter, setWhFilter] = useState('ALL');
  const today = todayIso();

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'supplyReports') return;
    if (
      navIntent.subTab === 'center' ||
      navIntent.subTab === 'daily_form' ||
      navIntent.subTab === 'balances' ||
      navIntent.subTab === 'alerts'
    ) {
      setTab(navIntent.subTab);
    }
    if (navIntent.prefillWarehouse) {
      setWhFilter(navIntent.prefillWarehouse);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  // Daily Movement Form & Signers state (daily_movement_form_dialog.dart parity)
  const [dailyDate, setDailyDate] = useState(today);
  const [dailyWh, setDailyWh] = useState('ALL');
  const [signersModalOpen, setSignersModalOpen] = useState(false);
  const [dailyFormVars, setDailyFormVars] = useState<DailyFormVars>(() => loadDailyFormVars());
  const [pickedOverrideWh, setPickedOverrideWh] = useState(db.warehouses[0]?.name ?? '');

  // Custom Warehouse & Camp Stock Limits state
  const [limScope, setLimScope] = useState<'warehouse' | 'camp'>('warehouse');
  const [limTargetId, setLimTargetId] = useState(db.warehouses[0]?.name ?? '');
  const [limItemId, setLimItemId] = useState(db.items[0]?.id ?? '');
  const [limMin, setLimMin] = useState('150');
  const [limWarn, setLimWarn] = useState('250');
  const [limCrit, setLimCrit] = useState('75');

  const allowedWhs = useMemo(
    () => filterAllowedWarehouses(currentUser, db.warehouses),
    [currentUser, db.warehouses]
  );
  const allowedWhNames = useMemo(() => new Set(allowedWhs.map((w) => w.name)), [allowedWhs]);

  const filteredLedger = useMemo(
    () =>
      ledger.filter(
        (r) =>
          allowedWhNames.has(r.warehouse) &&
          (whFilter === 'ALL' ? true : r.warehouse === whFilter)
      ),
    [ledger, allowedWhNames, whFilter]
  );

  const totalStrength = useMemo(
    () => computeGlobalTotalStrengthForDate(today, db.strengths, db.beneficiary_units),
    [today, db.strengths, db.beneficiary_units]
  );

  const alertRows = useMemo(() => {
    const entMap = new Map(db.entitlements.map((e) => [e.itemId, e]));
    return db.items.map((item) => {
      const bal = getTotalItemStock(ledger, item.id, Array.from(allowedWhNames));
      const customWhLim = db.warehouse_stock_limits.find(
        (l) => l.itemId === item.id && (whFilter === 'ALL' ? allowedWhNames.has(l.warehouseName) : l.warehouseName === whFilter)
      );
      const effectiveMin = customWhLim ? customWhLim.minStock : item.minQty;
      const dos = evaluateDaysOfSupply(
        bal,
        entMap.get(item.id),
        totalStrength,
        effectiveMin,
        db.config.supplyDaysMin,
        db.config.supplyDaysCritical
      );
      return { item, bal, dos, hasCustomLimit: Boolean(customWhLim) };
    });
  }, [db.items, db.entitlements, db.warehouse_stock_limits, ledger, allowedWhNames, whFilter, totalStrength, db.config]);

  const handleSaveCustomLimit = () => {
    const it = db.items.find((x) => x.id === limItemId);
    if (!it) return;
    const minStock = Math.max(0, Number(limMin) || 0);
    const maxStock = Math.max(minStock, Number(limWarn) || minStock);
    const alertDaysBefore = Math.max(1, Number(limCrit) || 3);
    const now = new Date().toISOString();

    if (limScope === 'warehouse') {
      const targetWhName = limTargetId || db.warehouses[0]?.name || '';
      const whObj = db.warehouses.find((w) => w.name === targetWhName);
      if (!targetWhName) return;
      const existing = db.warehouse_stock_limits.find((l) => l.warehouseName === targetWhName && l.itemId === it.id);
      const rec: WarehouseStockLimit = {
        id: existing?.id ?? Ids.next('wsl'),
        warehouseId: whObj?.id ?? targetWhName,
        warehouseName: targetWhName,
        itemId: it.id,
        itemName: it.name,
        unitName: it.baseUnit,
        factor: 1,
        minStock,
        maxStock,
        notes: '',
        updatedAt: now,
      };
      upsertRow('warehouse_stock_limits', rec);
      notify(`تم تثبيت حد المخزون المخصص لصنف "${it.name}" في ${targetWhName}`, 'success');
    } else {
      const camp = db.beneficiary_units.find((u) => u.id === limTargetId) ?? db.beneficiary_units.find((u) => u.isCamp);
      if (!camp) return;
      const existing = db.camp_stock_limits.find((l) => l.campId === camp.id && l.itemId === it.id);
      const rec: CampStockLimit = {
        id: existing?.id ?? Ids.next('csl'),
        campId: camp.id,
        campName: camp.name,
        itemId: it.id,
        itemName: it.name,
        minStock,
        maxStock,
        alertDaysBefore,
        updatedAt: now,
      };
      upsertRow('camp_stock_limits', rec);
      notify(`تم تثبيت حد المعسكر المخصص لصنف "${it.name}" في ${camp.name}`, 'success');
    }
  };

  const fifoExpiryAlerts = useMemo(
    () =>
      computeFifoExpiryAlerts({
        receipts: db.receipts,
        ledger: filteredLedger,
        asOfDate: today,
        warnDays: 60,
      }),
    [db.receipts, filteredLedger, today]
  );

  const reportData = useMemo(() => {
    switch (selectedReportId) {
      case 'r2':
        return {
          title: 'تقرير الوارد والتوريدات',
          headers: ['رقم السند', 'التاريخ', 'المستودع', 'المورد', 'الصنف', 'الكمية بالأساس'],
          rows: db.receipts.map((r) => [r.refNo, r.date, r.warehouse, r.supplier, r.itemName, fmt(r.baseQty)]),
        };
      case 'r3':
        return {
          title: 'تقرير الصرف للوحدات والمطابخ',
          headers: ['رقم السند', 'التاريخ', 'المستودع', 'المستفيد', 'الصنف', 'الكمية بالأساس'],
          rows: db.issues.map((i) => [i.refNo, i.date, i.warehouse, i.recipientDisplay, i.itemName, fmt(i.baseQty)]),
        };
      case 'r4':
        return {
          title: 'تقرير التحويلات المخزنية',
          headers: ['رقم السند', 'التاريخ', 'من مستودع', 'إلى مستودع', 'الصنف', 'الكمية بالأساس'],
          rows: db.transfers.map((t) => [t.refNo, t.date, t.warehouse, t.destWarehouse, t.itemName, fmt(t.baseQty)]),
        };
      case 'r5':
        return {
          title: 'تقرير الاستحقاق ومؤشر كفاية المخزون',
          headers: ['الصنف', 'الرصيد الكلي', 'الاستهلاك اليومي', 'حد إعادة الطلب', 'أيام التغطية', 'الحالة'],
          rows: alertRows.map((a) => [
            a.item.name,
            `${fmt(a.bal)} ${a.item.baseUnit}`,
            fmt(a.dos.dailyConsumption),
            fmt(a.dos.dynamicMin),
            a.dos.daysRemaining !== null ? `${fmt(a.dos.daysRemaining, 1)} يوم` : '—',
            a.dos.status === 'healthy' ? 'آمن' : a.dos.status === 'reorder' ? 'إعادة طلب' : 'حرج',
          ]),
        };
      case 'r6':
        return {
          title: 'تقرير أسطوانات الغاز والتعبئة',
          headers: ['المستودع', 'الصنف', 'ممتلئة', 'فارغة', 'في التعبئة', 'الإجمالي'],
          rows: filteredLedger
            .filter((l) => l.isRefillable)
            .map((l) => [l.warehouse, l.itemName, fmt(l.cylFull, 0), fmt(l.cylEmpty, 0), fmt(l.cylInRefill, 0), fmt(l.balance, 0)]),
        };
      case 'r7':
        return {
          title: 'تقرير تواريخ الصلاحية (وفق قاعدة الوارد أولاً يُصرف أولاً FIFO)',
          headers: ['السند', 'الصنف', 'المستودع', 'تاريخ التوريد', 'تاريخ الانتهاء', 'المتبقي فعلياً من الدفعة', 'الأيام المتبقية'],
          rows: fifoExpiryAlerts.map((e) => [
            e.receiptRefNo,
            e.itemName,
            e.warehouse,
            e.receiptDate,
            e.expiryDate,
            `${fmt(e.remainingBatchQty)} ${e.baseUnit}`,
            e.daysUntilExpiry <= 0 ? 'منتهي الصلاحية' : `${e.daysUntilExpiry} يوم`,
          ]),
        };
      case 'r8':
        return {
          title: 'تقرير سجل الأصول الثابتة',
          headers: ['الأصل', 'الرقم التسلسلي', 'المنشأة / المستودع', 'الحالة', 'القيمة'],
          rows: db.assets.map((a) => [a.name, a.serialNumber, a.facilityName || a.warehouse, a.status, fmt(a.value)]),
        };
      case 'r9':
        return {
          title: 'التقرير الإحصائي الشهري الموحد',
          headers: ['المؤشر', 'القيمة'],
          rows: [
            ['إجمالي القوة اليومية النشطة', fmt(totalStrength, 0)],
            ['عدد سندات الاستلام', fmt(db.receipts.length, 0)],
            ['عدد سندات الصرف', fmt(db.issues.length, 0)],
            ['عدد سندات التحويل', fmt(db.transfers.length, 0)],
            ['عدد الأصول الثابتة', fmt(db.assets.length, 0)],
          ],
        };
      default:
        return {
          title: 'تقرير الأرصدة الختامية للمستودعات',
          headers: ['المستودع', 'الصنف', 'الافتتاحي', 'الوارد', 'المنصرف', 'الرصيد الحالي'],
          rows: filteredLedger.map((r) => [
            r.warehouse,
            r.itemName,
            fmt(r.opening),
            fmt(r.received + r.transferredIn + r.returnedIn),
            fmt(r.issued + r.transferredOut + r.returnedOut),
            `${fmt(r.balance)} ${r.baseUnit}`,
          ]),
        };
    }
  }, [selectedReportId, db, filteredLedger, alertRows, fifoExpiryAlerts, totalStrength, fmt]);

  const balCols: ImdColumn<WarehouseItemBalance>[] = [
    { key: 'wh', header: 'المستودع', render: (r) => r.warehouse },
    { key: 'code', header: 'الكود', render: (r) => <span className="font-mono-num">{r.itemCode}</span> },
    { key: 'name', header: 'الصنف', render: (r) => r.itemName },
    { key: 'op', header: 'الافتتاحي', numeric: true, render: (r) => fmt(r.opening) },
    { key: 'in', header: 'الوارد + التحويل', numeric: true, render: (r) => fmt(r.received + r.transferredIn + r.returnedIn) },
    { key: 'out', header: 'المنصرف + الصادر', numeric: true, render: (r) => fmt(r.issued + r.transferredOut + r.returnedOut) },
    { key: 'adj', header: 'التسويات', numeric: true, render: (r) => fmt(r.adjusted) },
    {
      key: 'bal',
      header: 'الرصيد الفعلي',
      numeric: true,
      render: (r) => (
        <strong className="text-[var(--imd-accent)]">
          {fmt(r.balance)} {r.baseUnit}
        </strong>
      ),
    },
  ];

  const dailyMovementRows = useMemo(() => {
    const scopeCheck = (w: string) =>
      allowedWhNames.has(w) && (dailyWh === 'ALL' ? true : w === dailyWh);

    return db.items.map((item) => {
      let prior = 0;
      let todayIn = 0;
      let todayOut = 0;

      for (const ob of db.opening_balances) {
        if (ob.itemId !== item.id || !scopeCheck(ob.warehouse)) continue;
        if (ob.date < dailyDate) prior += ob.qty;
        else if (ob.date === dailyDate) todayIn += ob.qty;
      }
      for (const r of db.receipts) {
        if (r.itemId !== item.id || !isMovementActive(r.status) || !scopeCheck(r.warehouse)) continue;
        if (r.date < dailyDate) prior += r.baseQty;
        else if (r.date === dailyDate) todayIn += r.baseQty;
      }
      for (const i of db.issues) {
        if (i.itemId !== item.id || !isMovementActive(i.status) || !scopeCheck(i.warehouse)) continue;
        if (i.date < dailyDate) prior -= i.baseQty;
        else if (i.date === dailyDate) todayOut += i.baseQty;
      }
      for (const tr of db.transfers) {
        if (tr.itemId !== item.id || !isMovementActive(tr.status)) continue;
        if (scopeCheck(tr.warehouse)) {
          if (tr.date < dailyDate) prior -= tr.baseQty;
          else if (tr.date === dailyDate) todayOut += tr.baseQty;
        }
        if ((tr.status === 'RECEIVED' || tr.status === 'COMPLETED') && scopeCheck(tr.destWarehouse)) {
          if (tr.date < dailyDate) prior += tr.baseQty;
          else if (tr.date === dailyDate) todayIn += tr.baseQty;
        }
      }
      for (const ret of db.returns) {
        if (ret.itemId !== item.id || !isMovementActive(ret.status) || !scopeCheck(ret.warehouse)) continue;
        if (ret.type === 'FROM_UNIT' && ret.condition !== 'صالحة') continue;
        const sign = ret.type === 'FROM_UNIT' ? 1 : -1;
        if (ret.date < dailyDate) prior += sign * ret.baseQty;
        else if (ret.date === dailyDate) {
          if (sign > 0) todayIn += ret.baseQty;
          else todayOut += ret.baseQty;
        }
      }
      for (const adj of db.adjustments) {
        if (adj.itemId !== item.id || !isMovementActive(adj.status) || !scopeCheck(adj.warehouse)) continue;
        if (adj.date < dailyDate) prior += adj.baseQty;
        else if (adj.date === dailyDate) {
          if (adj.baseQty >= 0) todayIn += adj.baseQty;
          else todayOut += Math.abs(adj.baseQty);
        }
      }

      const closing = prior + todayIn - todayOut;
      return {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        baseUnit: item.baseUnit,
        prior,
        todayIn,
        todayOut,
        closing,
      };
    });
  }, [db, allowedWhNames, dailyDate, dailyWh]);

  const resolvedDailySigners: DailySignerSlot[] = useMemo(() => {
    if (dailyWh !== 'ALL' && dailyFormVars.warehouseSigns[dailyWh]?.length) {
      return dailyFormVars.warehouseSigns[dailyWh];
    }
    const whObj = db.warehouses.find((w) => w.name === dailyWh);
    if (dailyWh === 'ALL' || whObj?.isMain) return dailyFormVars.mainSigns;
    return dailyFormVars.subSigns;
  }, [dailyFormVars, dailyWh, db.warehouses]);

  return (
    <ImdPage
      title="التقارير والأرصدة والتنبيهات"
      subtitle="مركز التقارير التسعة · نموذج الحركة اليومية وتواقيعه · الأرصدة اللحظية · تنبيهات Days-of-Supply"
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as 'center' | 'daily_form' | 'balances' | 'alerts')}
        tabs={[
          { id: 'center', label: 'مركز التقارير (9 تقارير)' },
          { id: 'daily_form', label: 'نموذج الحركة اليومية' },
          { id: 'balances', label: 'الأرصدة الحالية', count: filteredLedger.length },
          {
            id: 'alerts',
            label: 'تنبيهات المخزون والصلاحية',
            count: alertRows.filter((a) => a.dos.status !== 'healthy').length + fifoExpiryAlerts.length,
          },
        ]}
      />

      {tab === 'center' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {NINE_REPORTS.map((rep) => (
              <button
                key={rep.id}
                type="button"
                onClick={() => setSelectedReportId(rep.id)}
                className={`text-right p-3 border transition-colors cursor-pointer ${
                  selectedReportId === rep.id
                    ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)]'
                    : 'border-[var(--imd-line)] bg-[var(--imd-surface)] hover:bg-[var(--imd-hover)]'
                }`}
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <div className="text-xs font-bold text-[var(--imd-text)]">{rep.title}</div>
                <div className="text-[11px] text-[var(--imd-muted)] mt-0.5">{rep.desc}</div>
              </button>
            ))}
          </div>

          <ImdPanel
            title={reportData.title}
            headerRight={
              <div className="flex items-center gap-2">
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const cols = reportData.headers.map((h, i) => ({ header: h, key: `c${i}` }));
                    const rows = reportData.rows.map((r) => {
                      const obj: Record<string, unknown> = {};
                      r.forEach((cell, i) => (obj[`c${i}`] = cell));
                      return obj;
                    });
                    exportRowsToXlsx(`${selectedReportId}_${today}.xlsx`, 'Report', cols, rows);
                  }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير Excel</span>
                </ImdButton>
                <ImdButton
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    openPrintPreview({
                      formKey: `report_${selectedReportId}`,
                      space: 'supply',
                      title: reportData.title,
                      refNo: `REP-${selectedReportId.toUpperCase()}-${today.replace(/-/g, '')}`,
                      date: today,
                      warehouse: whFilter === 'ALL' ? 'كافة المستودعات' : whFilter,
                      partyLabel: 'النطاق',
                      partyValue: 'تقارير الإمداد والتموين',
                      opType: 'تقرير إحصائي',
                      columns: reportData.headers,
                      rows: reportData.rows,
                      totalQty: reportData.rows.length,
                      actorName: currentUser?.name ?? '',
                    })
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة رسمية</span>
                </ImdButton>
              </div>
            }
          >
            <ImdTable
              columns={reportData.headers.map((h, idx) => ({
                key: `c${idx}`,
                header: h,
                render: (row: Array<string | number>) => row[idx],
              }))}
              rows={reportData.rows}
              rowKey={(_, idx) => String(idx)}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'daily_form' && (
        <div className="space-y-4">
          <ImdPanel
            title="تقرير الحركة اليومية (DailyMovementForm)"
            subtitle="رصيد اليوم السابق + الوارد اليومي − المنصرف اليومي = المتبقي الختامي"
            headerRight={
              <div className="flex flex-wrap items-center gap-2">
                <ImdFld label="" type="date" value={dailyDate} onChange={setDailyDate} className="w-40" />
                <ImdSelect
                  value={dailyWh}
                  onChange={setDailyWh}
                  options={[
                    { value: 'ALL', label: 'جميع المستودعات' },
                    ...allowedWhs.map((w) => ({ value: w.name, label: w.name })),
                  ]}
                  className="w-44"
                />
                <ImdButton size="sm" variant="secondary" onClick={() => setSignersModalOpen(true)}>
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>تخصيص التواقيع</span>
                </ImdButton>
                <ImdButton
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    openPrintPreview({
                      formKey: 'daily_movement',
                      space: 'supply',
                      title: 'تقرير الحركة اليومية للمخازن',
                      refNo: `DMF-${dailyDate.replace(/-/g, '')}`,
                      date: dailyDate,
                      warehouse: dailyWh === 'ALL' ? 'جميع المستودعات' : dailyWh,
                      partyLabel: 'التواقيع المعتمدة',
                      partyValue: resolvedDailySigners.map((s) => `${s.role}${s.name ? `: ${s.name}` : ''}`).join(' · '),
                      opType: 'نموذج حركة يومية',
                      columns: ['الكود', 'الصنف', 'الوحدة', 'السابق', 'الوارد', 'المنصرف', 'المتبقي'],
                      rows: dailyMovementRows.map((r) => [
                        r.itemCode,
                        r.itemName,
                        r.baseUnit,
                        fmt(r.prior),
                        fmt(r.todayIn),
                        fmt(r.todayOut),
                        fmt(r.closing),
                      ]),
                      totalQty: dailyMovementRows.length,
                      actorName: currentUser?.name ?? '',
                    })
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة النموذج</span>
                </ImdButton>
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--imd-muted)] pb-2 border-b border-[var(--imd-line)]">
              {resolvedDailySigners.map((s, idx) => (
                <span key={idx}>
                  {s.role}: <strong className="text-[var(--imd-text)]">{s.name || 'مدير المستودع'}</strong>
                </span>
              ))}
            </div>
            <ImdTable
              columns={[
                { key: 'c', header: 'الكود', render: (r) => <span className="font-mono-num">{r.itemCode}</span> },
                { key: 'n', header: 'الصنف', render: (r) => <strong>{r.itemName}</strong> },
                { key: 'u', header: 'الوحدة', render: (r) => r.baseUnit },
                { key: 'pr', header: 'الرصيد السابق', numeric: true, render: (r) => fmt(r.prior) },
                { key: 'in', header: 'وارد اليوم', numeric: true, render: (r) => <span className="text-[var(--imd-success)] font-bold">{fmt(r.todayIn)}</span> },
                { key: 'out', header: 'منصرف اليوم', numeric: true, render: (r) => <span className="text-[var(--imd-danger)] font-bold">{fmt(r.todayOut)}</span> },
                { key: 'cl', header: 'المتبقي', numeric: true, render: (r) => <strong>{fmt(r.closing)}</strong> },
              ]}
              rows={dailyMovementRows}
              rowKey={(r) => r.itemId}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'balances' && (
        <ImdPanel
          title="الأرصدة الحالية في المستودعات"
          headerRight={
            <ImdSelect
              value={whFilter}
              onChange={setWhFilter}
              options={[
                { value: 'ALL', label: 'جميع المستودعات المصرح بها' },
                ...allowedWhs.map((w) => ({ value: w.name, label: w.name })),
              ]}
            />
          }
        >
          <ImdTable columns={balCols} rows={filteredLedger} rowKey={(r) => `${r.warehouse}-${r.itemId}`} />
        </ImdPanel>
      )}

      {tab === 'alerts' && (
        <div className="space-y-4">
          <ImdPanel title="مؤشر كفاية المخزون (Days of Supply)" subtitle={`تُحسب الحدود ديناميكياً وفق القوة اليومية (${fmt(totalStrength, 0)} فرد)`}>
            <ImdTable
              columns={[
                { key: 'name', header: 'الصنف', render: (r) => r.item.name },
                { key: 'bal', header: 'الرصيد الكلي', numeric: true, render: (r) => `${fmt(r.bal)} ${r.item.baseUnit}` },
                { key: 'daily', header: 'الاستهلاك اليومي', numeric: true, render: (r) => fmt(r.dos.dailyConsumption) },
                { key: 'min', header: `حد الطلب (${db.config.supplyDaysMin} أيام)`, numeric: true, render: (r) => fmt(r.dos.dynamicMin) },
                { key: 'crit', header: `حد الخطر (${db.config.supplyDaysCritical} أيام)`, numeric: true, render: (r) => fmt(r.dos.criticalLevel) },
                {
                  key: 'days',
                  header: 'أيام الكفاية',
                  numeric: true,
                  render: (r) => (r.dos.daysRemaining !== null ? `${fmt(r.dos.daysRemaining, 1)} يوم` : '—'),
                },
                {
                  key: 'st',
                  header: 'الحالة',
                  render: (r) => (
                    <ImdStatusText
                      label={
                        r.dos.status === 'empty'
                          ? 'نافد'
                          : r.dos.status === 'critical'
                          ? 'حرج'
                          : r.dos.status === 'reorder'
                          ? 'إعادة طلب'
                          : 'آمن'
                      }
                      tone={
                        r.dos.status === 'empty' || r.dos.status === 'critical'
                          ? 'danger'
                          : r.dos.status === 'reorder'
                          ? 'warn'
                          : 'success'
                      }
                    />
                  ),
                },
              ]}
              rows={alertRows}
              rowKey={(r) => r.item.id}
            />
          </ImdPanel>

          <ImdPanel
            title="تنبيهات انتهاء الصلاحية (FIFO Expiry Alerts)"
            subtitle="توزيع الدفعات الأقدم استهلاكاً أولاً وعرض المتبقي فعلياً من الدفعات قريبة الانتهاء (خلال 60 يوماً)"
          >
            <ImdTable
              columns={[
                { key: 'ref', header: 'السند', render: (r) => <span className="font-mono-num">{r.receiptRefNo}</span> },
                { key: 'wh', header: 'المستودع', render: (r) => r.warehouse },
                { key: 'item', header: 'الصنف', render: (r) => r.itemName },
                { key: 'qty', header: 'المتبقي من الدفعة', numeric: true, render: (r) => `${fmt(r.remainingBatchQty)} ${r.baseUnit}` },
                { key: 'exp', header: 'تاريخ الانتهاء', numeric: true, render: (r) => r.expiryDate },
                {
                  key: 'st',
                  header: 'الحالة',
                  render: (r) => (
                    <ImdStatusText
                      label={r.status === 'expired' ? 'منتهي' : `خلال ${r.daysUntilExpiry} يوم`}
                      tone={r.status === 'expired' ? 'danger' : r.status === 'expiringSoon' ? 'danger' : 'warn'}
                    />
                  ),
                },
              ]}
              rows={fifoExpiryAlerts}
              rowKey={(r) => `${r.receiptRefNo}-${r.itemId}`}
              emptyTitle="لا توجد دفعات قريبة الانتهاء أو منتهية — جميع الأرصدة ضمن الصلاحية الآمنة"
            />
          </ImdPanel>

          <ImdPanel
            title="حدود المخزون المخصصة للمستودعات والمعسكرات (Warehouse & Camp Stock Limits)"
            subtitle="تعيين حد أدنى/تحذير/حرج مخصص لكل مستودع أو معسكر يتجاوز الحد الافتراضي العام"
          >
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end mb-4">
              <ImdSelect
                label="النطاق"
                value={limScope}
                onChange={(v) => {
                  const mode = v as 'warehouse' | 'camp';
                  setLimScope(mode);
                  setLimTargetId(
                    mode === 'warehouse'
                      ? db.warehouses[0]?.name ?? ''
                      : db.beneficiary_units.find((u) => u.isCamp)?.id ?? ''
                  );
                }}
                options={[
                  { value: 'warehouse', label: 'مستودع' },
                  { value: 'camp', label: 'معسكر' },
                ]}
              />
              <ImdSelect
                label={limScope === 'warehouse' ? 'المستودع' : 'المعسكر'}
                value={limTargetId}
                onChange={setLimTargetId}
                options={
                  limScope === 'warehouse'
                    ? allowedWhs.map((w) => ({ value: w.name, label: w.name }))
                    : db.beneficiary_units.filter((u) => u.isCamp).map((c) => ({ value: c.id, label: c.name }))
                }
              />
              <ImdSelect
                label="الصنف"
                value={limItemId}
                onChange={setLimItemId}
                options={db.items.map((i) => ({ value: i.id, label: i.name }))}
              />
              <ImdFld label="الحد الأقصى" type="number" value={limWarn} onChange={setLimWarn} />
              <ImdFld label="الحد الأدنى" type="number" value={limMin} onChange={setLimMin} />
              <ImdFld label="أيام التنبيه" type="number" value={limCrit} onChange={setLimCrit} />
              <ImdButton variant="primary" onClick={handleSaveCustomLimit}>
                <Plus className="w-4 h-4" />
                <span>تثبيت الحد</span>
              </ImdButton>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ImdTable
                columns={[
                  { key: 'w', header: 'المستودع', render: (r) => r.warehouseName },
                  { key: 'i', header: 'الصنف', render: (r) => r.itemName },
                  { key: 'm', header: 'أدنى / أقصى', numeric: true, render: (r) => `${fmt(r.minStock, 0)} / ${fmt(r.maxStock, 0)}` },
                  {
                    key: 'del',
                    header: 'حذف',
                    render: (r) => (
                      <ImdButton size="sm" variant="ghost" onClick={() => deleteRow('warehouse_stock_limits', r.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    ),
                  },
                ]}
                rows={db.warehouse_stock_limits}
                rowKey={(r) => r.id}
                emptyTitle="لا توجد حدود مستودعات مخصصة بعد"
                reportCountToStatusBar={false}
              />
              <ImdTable
                columns={[
                  { key: 'c', header: 'المعسكر', render: (r) => r.campName },
                  { key: 'i', header: 'الصنف', render: (r) => r.itemName },
                  { key: 'm', header: 'أدنى / أقصى (أيام)', numeric: true, render: (r) => `${fmt(r.minStock, 0)} / ${fmt(r.maxStock, 0)} (${r.alertDaysBefore}ي)` },
                  {
                    key: 'del',
                    header: 'حذف',
                    render: (r) => (
                      <ImdButton size="sm" variant="ghost" onClick={() => deleteRow('camp_stock_limits', r.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    ),
                  },
                ]}
                rows={db.camp_stock_limits}
                rowKey={(r) => r.id}
                emptyTitle="لا توجد حدود معسكرات مخصصة بعد"
                reportCountToStatusBar={false}
              />
            </div>
          </ImdPanel>
        </div>
      )}

      {/* Daily Movement Signers Dialog (daily_movement_form_dialog.dart parity) */}
      <ImdModal
        open={signersModalOpen}
        onClose={() => setSignersModalOpen(false)}
        title="تواقيع تقرير الحركة اليومية"
        widthClass="max-w-2xl"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setSignersModalOpen(false)}>إلغاء</ImdButton>
            <ImdButton
              variant="primary"
              onClick={() => {
                saveDailyFormVars(dailyFormVars);
                setSignersModalOpen(false);
                notify('تم حفظ تواقيع تقرير الحركة اليومية', 'success');
              }}
            >
              حفظ التواقيع
            </ImdButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-[var(--imd-text)]">تواقيع المخزن الرئيسي (وجميع المخازن)</div>
            {dailyFormVars.mainSigns.map((slot, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2">
                <ImdFld
                  label={`المسمى ${idx + 1}`}
                  value={slot.role}
                  onChange={(v) => {
                    const next = [...dailyFormVars.mainSigns];
                    next[idx] = { ...slot, role: v };
                    setDailyFormVars({ ...dailyFormVars, mainSigns: next });
                  }}
                />
                <ImdFld
                  label="الرتبة والاسم"
                  value={slot.name}
                  placeholder="فارغ = مدير المستودع"
                  onChange={(v) => {
                    const next = [...dailyFormVars.mainSigns];
                    next[idx] = { ...slot, name: v };
                    setDailyFormVars({ ...dailyFormVars, mainSigns: next });
                  }}
                />
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-3 border-t border-[var(--imd-line)]">
            <div className="text-xs font-bold text-[var(--imd-text)]">تواقيع المخزن الفرعي (المعسكر)</div>
            {dailyFormVars.subSigns.map((slot, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2">
                <ImdFld
                  label={`المسمى ${idx + 1}`}
                  value={slot.role}
                  onChange={(v) => {
                    const next = [...dailyFormVars.subSigns];
                    next[idx] = { ...slot, role: v };
                    setDailyFormVars({ ...dailyFormVars, subSigns: next });
                  }}
                />
                <ImdFld
                  label="الرتبة والاسم"
                  value={slot.name}
                  placeholder="فارغ = مدير المستودع"
                  onChange={(v) => {
                    const next = [...dailyFormVars.subSigns];
                    next[idx] = { ...slot, name: v };
                    setDailyFormVars({ ...dailyFormVars, subSigns: next });
                  }}
                />
              </div>
            ))}
          </div>

          {allowedWhs.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[var(--imd-line)]">
              <ImdSelect
                label="تخصيص لمخزن بعينه (اختياري)"
                value={pickedOverrideWh}
                onChange={setPickedOverrideWh}
                options={allowedWhs.map((w) => ({ value: w.name, label: w.name }))}
              />
              {(dailyFormVars.warehouseSigns[pickedOverrideWh] ?? dailyFormVars.subSigns).map((slot, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2">
                  <ImdFld
                    label={`المسمى ${idx + 1}`}
                    value={slot.role}
                    onChange={(v) => {
                      const cur = [...(dailyFormVars.warehouseSigns[pickedOverrideWh] ?? dailyFormVars.subSigns)];
                      cur[idx] = { ...slot, role: v };
                      setDailyFormVars({
                        ...dailyFormVars,
                        warehouseSigns: { ...dailyFormVars.warehouseSigns, [pickedOverrideWh]: cur },
                      });
                    }}
                  />
                  <ImdFld
                    label="الرتبة والاسم"
                    value={slot.name}
                    onChange={(v) => {
                      const cur = [...(dailyFormVars.warehouseSigns[pickedOverrideWh] ?? dailyFormVars.subSigns)];
                      cur[idx] = { ...slot, name: v };
                      setDailyFormVars({
                        ...dailyFormVars,
                        warehouseSigns: { ...dailyFormVars.warehouseSigns, [pickedOverrideWh]: cur },
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </ImdModal>
    </ImdPage>
  );
};
