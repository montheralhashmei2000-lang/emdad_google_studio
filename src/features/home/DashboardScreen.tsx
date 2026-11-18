// Supply Operations Executive Dashboard:
// Interactive KPIs with drill-down, 14-Day SVG Inbound/Outbound Flow Chart, Warehouse Readiness Breakdown,
// Dual Days-of-Supply & FIFO Expiry Watchlist with 1-Click Ration Order / Receive triggers, Live Action Queue

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Package,
  Printer,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdKpiCard,
  ImdPage,
  ImdPanel,
  ImdStatusText,
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { todayIso } from '../../core/ui/imdTokens';
import { computeGlobalTotalStrengthForDate } from '../../domain/strengthEngine';
import { evaluateDaysOfSupply } from '../../domain/ruleEngine';
import { getTotalItemStock, isMovementActive } from '../../domain/stockLedger';
import { computeFifoExpiryAlerts } from '../../domain/stockAlerts';
import { filterAllowedWarehouses } from '../../domain/accessControl';

type KpiId = 'strength' | 'items' | 'alerts' | 'orders';

const KPI_LABELS: Array<{ id: KpiId; label: string }> = [
  { id: 'strength', label: 'القوة اليومية' },
  { id: 'items', label: 'قيمة وأرصدة المخزون' },
  { id: 'alerts', label: 'الكفاية وصلاحية FIFO' },
  { id: 'orders', label: 'الطلبيات والتحويلات المعلقة' },
];

function pastDateIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const DashboardScreen: React.FC = () => {
  const { db, currentUser, ledger, fuelTanks, navigateTo, mutateDb, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const today = todayIso();
  const yesterday = pastDateIso(1);

  const [showCustomize, setShowCustomize] = useState(false);
  const [watchlistTab, setWatchlistTab] = useState<'dos' | 'fifo'>('dos');
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  const [visibleKpis, setVisibleKpis] = useState<Record<KpiId, boolean>>(() => {
    try {
      const saved = localStorage.getItem('emdad_dash_kpis');
      if (saved) return JSON.parse(saved) as Record<KpiId, boolean>;
    } catch {
      // default
    }
    return { strength: true, items: true, alerts: true, orders: true };
  });

  const toggleKpi = (id: KpiId) => {
    setVisibleKpis((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('emdad_dash_kpis', JSON.stringify(next));
      return next;
    });
  };

  const allowedWarehouses = useMemo(
    () => filterAllowedWarehouses(currentUser, db.warehouses),
    [currentUser, db.warehouses]
  );
  const allowedWhNames = useMemo(() => allowedWarehouses.map((w) => w.name), [allowedWarehouses]);
  const allowedWhSet = useMemo(() => new Set(allowedWhNames), [allowedWhNames]);

  const totalStrength = useMemo(
    () => computeGlobalTotalStrengthForDate(today, db.strengths, db.beneficiary_units),
    [today, db.strengths, db.beneficiary_units]
  );
  const yesterdayStrength = useMemo(
    () => computeGlobalTotalStrengthForDate(yesterday, db.strengths, db.beneficiary_units),
    [yesterday, db.strengths, db.beneficiary_units]
  );
  const strengthDelta = totalStrength - yesterdayStrength;

  const itemAlerts = useMemo(() => {
    const entMap = new Map(db.entitlements.map((e) => [e.itemId, e]));
    return db.items.map((item) => {
      const bal = getTotalItemStock(ledger, item.id, allowedWhNames);
      const dos = evaluateDaysOfSupply(
        bal,
        entMap.get(item.id),
        totalStrength,
        item.minQty,
        db.config.supplyDaysMin,
        db.config.supplyDaysCritical
      );
      return { item, bal, dos, estValue: bal * item.unitValue };
    });
  }, [db.items, db.entitlements, ledger, allowedWhNames, totalStrength, db.config]);

  const totalInventoryValue = useMemo(
    () => itemAlerts.reduce((s, x) => s + x.estValue, 0),
    [itemAlerts]
  );

  const criticalAlerts = useMemo(
    () =>
      itemAlerts
        .filter((x) => x.dos.status === 'empty' || x.dos.status === 'critical' || x.dos.status === 'reorder')
        .sort((a, b) => (a.dos.daysRemaining ?? 999) - (b.dos.daysRemaining ?? 999)),
    [itemAlerts]
  );

  const fifoExpiryAlerts = useMemo(
    () =>
      computeFifoExpiryAlerts({
        receipts: db.receipts,
        ledger: ledger.filter((l) => allowedWhSet.has(l.warehouse)),
        asOfDate: today,
        warnDays: 45,
      }),
    [db.receipts, ledger, allowedWhSet, today]
  );

  const pendingOrders = useMemo(
    () => db.ration_orders.filter((o) => o.status === 'PENDING' || o.status === 'APPROVED'),
    [db.ration_orders]
  );
  const pendingTransfers = useMemo(
    () =>
      db.transfers.filter(
        (t) => t.status === 'PENDING' && (allowedWhSet.has(t.warehouse) || allowedWhSet.has(t.destWarehouse))
      ),
    [db.transfers, allowedWhSet]
  );
  const openStocktakes = useMemo(
    () => db.stocktakes.filter((s) => s.status === 'COUNTING' && allowedWhSet.has(s.warehouse)),
    [db.stocktakes, allowedWhSet]
  );

  // 14-day flow data for SVG chart
  const flow14Days = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, idx) => pastDateIso(13 - idx));
    return days.map((dt) => {
      const inbound =
        db.receipts
          .filter((r) => r.date === dt && isMovementActive(r.status) && allowedWhSet.has(r.warehouse))
          .reduce((s, r) => s + r.baseQty, 0) +
        db.returns
          .filter((r) => r.date === dt && isMovementActive(r.status) && r.type === 'FROM_UNIT' && allowedWhSet.has(r.warehouse))
          .reduce((s, r) => s + r.baseQty, 0);

      const outbound =
        db.issues
          .filter((i) => i.date === dt && isMovementActive(i.status) && allowedWhSet.has(i.warehouse))
          .reduce((s, i) => s + i.baseQty, 0) +
        db.transfers
          .filter((t) => t.date === dt && isMovementActive(t.status) && allowedWhSet.has(t.warehouse))
          .reduce((s, t) => s + t.baseQty, 0);

      const docsCount =
        db.receipts.filter((r) => r.date === dt && allowedWhSet.has(r.warehouse)).length +
        db.issues.filter((i) => i.date === dt && allowedWhSet.has(i.warehouse)).length +
        db.transfers.filter((t) => t.date === dt && allowedWhSet.has(t.warehouse)).length;

      return { date: dt, label: dt.slice(5), inbound, outbound, docsCount };
    });
  }, [db.receipts, db.returns, db.issues, db.transfers, allowedWhSet]);

  const maxFlowVal = useMemo(
    () => Math.max(100, ...flow14Days.flatMap((d) => [d.inbound, d.outbound])),
    [flow14Days]
  );

  const activeDayPoint = hoveredDayIdx !== null ? flow14Days[hoveredDayIdx] : flow14Days[flow14Days.length - 1];

  // Warehouse summary cards
  const warehouseSummary = useMemo(() => {
    const itemValMap = new Map(db.items.map((i) => [i.id, i.unitValue]));
    return allowedWarehouses.map((wh) => {
      const rows = ledger.filter((l) => l.warehouse === wh.name && l.balance > 0);
      const totalQty = rows.reduce((s, r) => s + r.balance, 0);
      const totalVal = rows.reduce((s, r) => s + r.balance * (itemValMap.get(r.itemId) ?? 0), 0);
      const incomingPending = db.transfers.filter((t) => t.destWarehouse === wh.name && t.status === 'PENDING').length;
      const frozen = db.stocktakes.some((s) => s.warehouse === wh.name && s.status === 'COUNTING' && s.freeze);
      return { wh, stockedCount: rows.length, totalQty, totalVal, incomingPending, frozen };
    });
  }, [allowedWarehouses, ledger, db.items, db.transfers, db.stocktakes]);

  const recentMoves = useMemo(() => {
    const all = [
      ...db.receipts.map((r) => ({ id: r.id, refNo: r.refNo, date: r.date, type: 'استلام', itemName: r.itemName, qty: r.baseQty, unit: r.unitName, warehouse: r.warehouse, party: r.supplier, status: r.status })),
      ...db.issues.map((i) => ({ id: i.id, refNo: i.refNo, date: i.date, type: 'صرف', itemName: i.itemName, qty: i.baseQty, unit: i.unitName, warehouse: i.warehouse, party: i.recipientDisplay, status: i.status })),
      ...db.transfers.map((t) => ({ id: t.id, refNo: t.refNo, date: t.date, type: 'تحويل', itemName: t.itemName, qty: t.baseQty, unit: t.unitName, warehouse: t.warehouse, party: t.destWarehouse, status: t.status })),
      ...db.returns.map((ret) => ({ id: ret.id, refNo: ret.refNo, date: ret.date, type: 'مرتجع', itemName: ret.itemName, qty: ret.baseQty, unit: ret.unitName, warehouse: ret.warehouse, party: ret.party, status: ret.status })),
    ]
      .filter((m) => allowedWhSet.has(m.warehouse))
      .sort((a, b) => b.date.localeCompare(a.date));
    return all.slice(0, 8);
  }, [db.receipts, db.issues, db.transfers, db.returns, allowedWhSet]);

  const moveColumns: ImdColumn<(typeof recentMoves)[number]>[] = [
    { key: 'refNo', header: 'رقم السند', render: (r) => <span className="font-mono-num font-semibold text-[var(--imd-accent)]">{r.refNo}</span> },
    { key: 'type', header: 'النوع', render: (r) => <span className="font-medium">{r.type}</span> },
    { key: 'date', header: 'التاريخ', numeric: true, render: (r) => r.date },
    { key: 'item', header: 'الصنف', render: (r) => r.itemName },
    { key: 'qty', header: 'الكمية (بالأساس)', numeric: true, render: (r) => <strong>{fmt(r.qty)}</strong> },
    { key: 'wh', header: 'المستودع', render: (r) => r.warehouse },
    { key: 'party', header: 'الجهة / الطرف', render: (r) => r.party },
    {
      key: 'status',
      header: 'الحالة',
      render: (r) => (
        <ImdStatusText
          label={
            r.status === 'COMPLETED' || r.status === 'RECEIVED'
              ? 'معتمد'
              : r.status === 'PENDING'
              ? 'بانتظار الاستلام'
              : r.status === 'CANCELLED'
              ? 'ملغي'
              : r.status
          }
          tone={
            r.status === 'COMPLETED' || r.status === 'RECEIVED'
              ? 'success'
              : r.status === 'CANCELLED'
              ? 'danger'
              : 'warn'
          }
        />
      ),
    },
  ];

  // Inline Quick Confirm Incoming Transfer right from Dashboard queue
  const handleQuickReceiveTransfer = (transferId: string) => {
    const tr = db.transfers.find((t) => t.id === transferId);
    if (!tr) return;
    mutateDb((prev) => ({
      ...prev,
      transfers: prev.transfers.map((t) =>
        t.id === transferId ? { ...t, status: 'RECEIVED' } : t
      ),
    }));
    logAudit({
      action: 'TRANSFER_RECEIVED',
      entityType: 'transfers',
      summary: `تأكيد استلام التحويل ${tr.refNo} في ${tr.destWarehouse}`,
      refNo: tr.refNo,
      warehouse: tr.destWarehouse,
      qty: tr.baseQty,
    });
    notify(`تم تأكيد استلام التحويل ${tr.refNo} وإضافته لرصيد ${tr.destWarehouse}`, 'success');
  };

  const topChartItems = [...itemAlerts]
    .sort((a, b) => b.bal - a.bal)
    .slice(0, 7);
  const maxItemStock = Math.max(1, ...topChartItems.map((x) => Math.max(x.bal, x.dos.dynamicMin)));

  const handlePrintExecutiveBriefing = () => {
    const totalPetrol = fuelTanks.reduce((s, t) => s + t.petrol, 0);
    const totalDiesel = fuelTanks.reduce((s, t) => s + t.diesel, 0);
    const openCustodies = db.link_fin_custodies.filter((c) => c.status === 'open').length;
    const rows: Array<Array<string | number>> = [
      ['1. القوة اليومية الفعّالة', `${fmt(totalStrength, 0)} فرد`, strengthDelta >= 0 ? `+${fmt(strengthDelta, 0)} عن الأمس` : `${fmt(strengthDelta, 0)} عن الأمس`],
      ['2. قيمة المخزون الإجمالية', `${fmt(totalInventoryValue, 0)} ${db.config.currencyPrimary}`, `${fmt(db.items.length, 0)} صنف في ${fmt(allowedWarehouses.length, 0)} مستودع`],
      ['3. تنبيهات الكفاية الحرجة', `${fmt(criticalAlerts.length, 0)} أصناف`, criticalAlerts.slice(0, 3).map((x) => x.item.name).join('، ') || 'جميع الأصناف ضمن حد الأمان'],
      ['4. دفعات FIFO قريبة الانتهاء', `${fmt(fifoExpiryAlerts.length, 0)} دفعة`, fifoExpiryAlerts.slice(0, 2).map((x) => `${x.itemName} (${x.expiryDate})`).join('، ') || 'لا توجد دفعات قريبة الانتهاء'],
      ['5. الطلبيات والتحويلات المعلقة', `${fmt(pendingOrders.length, 0)} طلبية · ${fmt(pendingTransfers.length, 0)} تحويل`, `${fmt(openStocktakes.length, 0)} جلسات جرد مفتوحة`],
      ['6. احتياطي المحروقات الفعلي', `${fmt(totalPetrol, 0)} لتر بترول · ${fmt(totalDiesel, 0)} لتر ديزل`, `${fmt(fuelTanks.filter((t) => t.isLowStock).length, 0)} محطات منخفضة المخزون`],
      ['7. العهد المالية المفتوحة', `${fmt(openCustodies, 0)} عهدة`, `${fmt(db.cables.filter((c) => c.status === 'new').length, 0)} برقيات جديدة`],
    ];
    openPrintPreview({
      formKey: 'executive_commander_briefing',
      space: 'supply',
      title: 'التقرير التنفيذي الموحد لقائد الشعبة (الموقف اليومي الشامل)',
      refNo: `CMD-${today.replace(/-/g, '')}`,
      date: today,
      warehouse: `نطاق ${allowedWhNames.length} مستودعات + محطات المحروقات`,
      partyLabel: 'مُعدّ التقرير',
      partyValue: currentUser?.name ?? 'غرفة العمليات',
      opType: 'موجز تنفيذي شامل',
      columns: ['المحور التشغيلي', 'المؤشر الرقمي', 'التفاصيل والتنبيهات'],
      rows,
      totalQty: totalStrength,
      notes: 'يشمل هذا الموجز حالة القوة البشرية، المخزون التمويني، تنبيهات FIFO، احتياطي الوقود، والموقف المالي.',
      actorName: currentUser?.name ?? '',
    });
  };

  return (
    <ImdPage
      title="مركز عمليات الإمداد والتموين"
      subtitle={`التاريخ التشغيلي: ${today} · نطاق المستودعات: ${allowedWhNames.length} مستودعات · المعسكرات النشطة: ${db.beneficiary_units.filter((u) => u.isCamp).length}`}
      actions={
        <>
          <ImdButton variant="secondary" size="sm" onClick={handlePrintExecutiveBriefing}>
            <Printer className="w-3.5 h-3.5" />
            <span>التقرير التنفيذي الموحد</span>
          </ImdButton>
          <ImdButton variant="secondary" size="sm" onClick={() => setShowCustomize((s) => !s)}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>تخصيص المؤشرات</span>
          </ImdButton>
          <ImdButton
            variant="orange"
            onClick={() => navigateTo({ door: 'supplyMoves', subTab: 'receive' })}
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>توريد واستلام</span>
          </ImdButton>
          <ImdButton
            variant="secondary"
            onClick={() => navigateTo({ door: 'supplyMoves', subTab: 'issue' })}
          >
            <ArrowUpFromLine className="w-4 h-4" />
            <span>صرف مخزون</span>
          </ImdButton>
          <ImdButton
            variant="primary"
            onClick={() => navigateTo({ door: 'supplyDaily', subTab: 'ops' })}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>التفريدة والوجبات</span>
          </ImdButton>
        </>
      }
    >
      {showCustomize && (
        <div
          className="border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] p-3 flex flex-wrap items-center gap-4 text-xs"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        >
          <span className="font-bold text-[var(--imd-text2)]">البطاقات المعروضة:</span>
          {KPI_LABELS.map((k) => (
            <label key={k.id} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleKpis[k.id]}
                onChange={() => toggleKpi(k.id)}
              />
              <span>{k.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* 1. Executive KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {visibleKpis.strength && (
          <ImdKpiCard
            label="إجمالي القوة اليومية"
            value={`${fmt(totalStrength, 0)} فرد`}
            icon={<Users className="w-4 h-4" />}
            tone="accent"
            meta={
              strengthDelta === 0
                ? 'مطابق لتفريدة الأمس'
                : strengthDelta > 0
                ? `+${fmt(strengthDelta, 0)} عن الأمس`
                : `${fmt(strengthDelta, 0)} عن الأمس`
            }
            onClick={() => navigateTo({ door: 'supplyDaily', subTab: 'strength' })}
          />
        )}

        {visibleKpis.items && (
          <ImdKpiCard
            label="قيمة الأرصدة المقدّرة"
            value={`${fmt(totalInventoryValue, 0)} ${db.config.currencyPrimary}`}
            icon={<Package className="w-4 h-4" />}
            tone="default"
            meta={`${fmt(db.items.length, 0)} صنف · ${fmt(allowedWarehouses.length, 0)} مستودعات · ${fmt(db.facilities.length, 0)} مطابخ`}
            onClick={() => navigateTo({ door: 'supplyReports', subTab: 'balances' })}
          />
        )}

        {visibleKpis.alerts && (
          <ImdKpiCard
            label="تنبيهات الكفاية والصلاحية"
            value={fmt(criticalAlerts.length + fifoExpiryAlerts.length, 0)}
            icon={<AlertTriangle className="w-4 h-4" />}
            tone={criticalAlerts.length + fifoExpiryAlerts.length > 0 ? 'danger' : 'success'}
            meta={`${fmt(criticalAlerts.length, 0)} نقص كفاية · ${fmt(fifoExpiryAlerts.length, 0)} قرب انتهاء FIFO`}
            onClick={() => navigateTo({ door: 'supplyReports', subTab: 'alerts' })}
          />
        )}

        {visibleKpis.orders && (
          <ImdKpiCard
            label="طلبيات وتحويلات قيد الإجراء"
            value={fmt(pendingOrders.length + pendingTransfers.length, 0)}
            icon={<ShoppingCart className="w-4 h-4" />}
            tone={pendingOrders.length + pendingTransfers.length > 0 ? 'warn' : 'info'}
            meta={`${fmt(pendingOrders.length, 0)} طلبية · ${fmt(pendingTransfers.length, 0)} تحويل بالطريق · ${fmt(openStocktakes.length, 0)} جرد`}
            onClick={() => navigateTo({ door: 'supplyOrders', subTab: 'orders' })}
          />
        )}
      </div>

      {/* 2. 14-Day SVG Inbound vs Outbound Flow Chart + Warehouse Readiness */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ImdPanel
          title="تدفق حركة المخزون خلال 14 يوماً"
          subtitle="مقارنة الكميات الواردة (استلام ومرتجع) مقابل المنصرفة والتحويلات بالوحدة الأساسية"
          icon={<TrendingUp className="w-4 h-4" />}
          className="xl:col-span-2"
          headerRight={
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: 'var(--imd-accent)', borderRadius: '2px' }} />
                <span>الوارد</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: '#F39C12', borderRadius: '2px' }} />
                <span>المنصرف والمحوّل</span>
              </span>
            </div>
          }
        >
          <div className="space-y-3">
            {/* Active day readout strip */}
            {activeDayPoint && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-xs tabular-nums"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <span className="font-bold text-[var(--imd-text)]">
                  يوم {activeDayPoint.date}
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    الوارد: <strong style={{ color: 'var(--imd-accent)' }}>{fmt(activeDayPoint.inbound, 0)}</strong>
                  </span>
                  <span>
                    المنصرف والمحوّل: <strong style={{ color: 'var(--imd-warn)' }}>{fmt(activeDayPoint.outbound, 0)}</strong>
                  </span>
                  <span className="text-[var(--imd-muted)]">
                    السندات: {fmt(activeDayPoint.docsCount, 0)}
                  </span>
                </div>
              </div>
            )}

            {/* SVG Bar Chart */}
            <div className="w-full overflow-x-auto">
              <svg viewBox="0 0 700 185" className="w-full min-w-[520px] h-48 select-none">
                {/* Horizontal gridlines */}
                {[0.25, 0.5, 0.75, 1].map((step) => {
                  const y = 150 - step * 125;
                  return (
                    <g key={step}>
                      <line x1={32} y1={y} x2={690} y2={y} stroke="var(--imd-line)" strokeDasharray="3 3" strokeWidth={1} />
                      <text x={28} y={y + 3} textAnchor="end" fontSize={9} fill="var(--imd-muted)">
                        {Math.round(maxFlowVal * step)}
                      </text>
                    </g>
                  );
                })}
                <line x1={32} y1={150} x2={690} y2={150} stroke="var(--imd-line-strong)" strokeWidth={1} />

                {flow14Days.map((d, idx) => {
                  const groupX = 40 + idx * 46;
                  const inH = Math.max(d.inbound > 0 ? 3 : 0, (d.inbound / maxFlowVal) * 125);
                  const outH = Math.max(d.outbound > 0 ? 3 : 0, (d.outbound / maxFlowVal) * 125);
                  const isHovered = hoveredDayIdx === idx;
                  return (
                    <g
                      key={d.date}
                      onMouseEnter={() => setHoveredDayIdx(idx)}
                      onMouseLeave={() => setHoveredDayIdx(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={groupX - 4}
                        y={20}
                        width={38}
                        height={130}
                        fill={isHovered ? 'var(--imd-hover)' : 'transparent'}
                        rx={3}
                      />
                      <rect
                        x={groupX + 1}
                        y={150 - inH}
                        width={12}
                        height={inH}
                        fill="var(--imd-accent)"
                        rx={2}
                      />
                      <rect
                        x={groupX + 16}
                        y={150 - outH}
                        width={12}
                        height={outH}
                        fill="#F39C12"
                        rx={2}
                      />
                      <text
                        x={groupX + 15}
                        y={166}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={isHovered ? 700 : 500}
                        fill={isHovered ? 'var(--imd-accent)' : 'var(--imd-muted)'}
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </ImdPanel>

        {/* Warehouses Status Breakdown */}
        <ImdPanel
          title="جاهزية المستودعات"
          subtitle="الأرصدة والمبالغ التقديرية لكل مستودع"
          icon={<Warehouse className="w-4 h-4" />}
          headerRight={
            <ImdButton size="sm" variant="ghost" onClick={() => navigateTo({ door: 'supplyData', subTab: 'warehouses' })}>
              إدارة المستودعات
            </ImdButton>
          }
        >
          <div className="space-y-2.5">
            {warehouseSummary.map(({ wh, stockedCount, totalQty, totalVal, incomingPending, frozen }) => (
              <button
                key={wh.id}
                type="button"
                onClick={() =>
                  navigateTo({ door: 'supplyReports', subTab: 'balances', prefillWarehouse: wh.name })
                }
                className="w-full text-right p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] hover:border-[var(--imd-accent)] transition-colors cursor-pointer space-y-1.5"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--imd-text)] truncate">{wh.name}</span>
                  <ImdStatusText
                    label={frozen ? 'مجمّد لجرد' : wh.isMain ? 'رئيسي' : 'نشط'}
                    tone={frozen ? 'danger' : wh.isMain ? 'info' : 'success'}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--imd-muted)] tabular-nums">
                  <span>{fmt(stockedCount, 0)} صنف متوفر · {fmt(totalQty, 0)} وحدة</span>
                  <strong className="text-[var(--imd-text2)]">{fmt(totalVal, 0)} {db.config.currencyPrimary}</strong>
                </div>
                {incomingPending > 0 && (
                  <div className="text-[11px] font-semibold" style={{ color: 'var(--imd-warn)' }}>
                    {fmt(incomingPending, 0)} تحويلات واردة بانتظار الاستلام
                  </div>
                )}
              </button>
            ))}
          </div>
        </ImdPanel>
      </div>

      {/* 3. Action Queue + Dual Watchlist (Days-of-Supply & FIFO Expiry) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Watchlist Panel */}
        <ImdPanel
          title="مراقبة الكفاية وصلاحية الدفعات"
          subtitle="احتساب آلي حسب التفريدة اليومية ونظام FIFO"
          icon={<Activity className="w-4 h-4" />}
          className="xl:col-span-7"
          headerRight={
            <div className="flex items-center gap-1 border border-[var(--imd-line)] p-0.5 bg-[var(--imd-surface)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <button
                type="button"
                onClick={() => setWatchlistTab('dos')}
                className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                  watchlistTab === 'dos' ? 'bg-[var(--imd-accent)] text-[var(--imd-on-accent)]' : 'text-[var(--imd-muted)]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                حد الكفاية ({fmt(criticalAlerts.length, 0)})
              </button>
              <button
                type="button"
                onClick={() => setWatchlistTab('fifo')}
                className={`px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                  watchlistTab === 'fifo' ? 'bg-[var(--imd-accent)] text-[var(--imd-on-accent)]' : 'text-[var(--imd-muted)]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                صلاحية FIFO ({fmt(fifoExpiryAlerts.length, 0)})
              </button>
            </div>
          }
        >
          {watchlistTab === 'dos' ? (
            <div className="space-y-3">
              {/* Top Inventory vs Reorder Threshold bars */}
              <div className="space-y-2.5">
                {(criticalAlerts.length > 0 ? criticalAlerts.slice(0, 6) : topChartItems).map(({ item, bal, dos }) => {
                  const barMax = Math.max(1, maxItemStock);
                  const barPct = Math.min(100, (bal / barMax) * 100);
                  const minPct = Math.min(100, (dos.dynamicMin / barMax) * 100);
                  const barColor =
                    dos.status === 'critical' || dos.status === 'empty'
                      ? 'var(--imd-danger)'
                      : dos.status === 'reorder'
                      ? 'var(--imd-warn)'
                      : 'var(--imd-accent)';

                  return (
                    <div
                      key={item.id}
                      className="p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] space-y-1.5"
                      style={{ borderRadius: 'var(--imd-radius-sm)' }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-[var(--imd-text)]">{item.name}</span>
                          <ImdStatusText
                            label={
                              dos.status === 'empty'
                                ? 'نافد'
                                : dos.status === 'critical'
                                ? 'حرج'
                                : dos.status === 'reorder'
                                ? 'إعادة طلب'
                                : 'آمن'
                            }
                            tone={
                              dos.status === 'empty' || dos.status === 'critical'
                                ? 'danger'
                                : dos.status === 'reorder'
                                ? 'warn'
                                : 'success'
                            }
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-[var(--imd-muted)] tabular-nums">
                            {fmt(bal)} / حد الطلب {fmt(dos.dynamicMin)} {item.baseUnit}
                            {dos.daysRemaining !== null && ` · يكفي ${fmt(dos.daysRemaining, 1)} يوم`}
                          </span>
                          {dos.status !== 'healthy' && (
                            <ImdButton
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                navigateTo({
                                  door: 'supplyOrders',
                                  subTab: 'orders',
                                  prefillItemId: item.id,
                                })
                              }
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>طلب توريد</span>
                            </ImdButton>
                          )}
                        </div>
                      </div>
                      <div className="relative h-2 bg-[var(--imd-subtle)] overflow-hidden" style={{ borderRadius: '2px' }}>
                        <div className="h-full transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                        {minPct > 0 && (
                          <div
                            title={`حد إعادة الطلب (${fmt(dos.dynamicMin)})`}
                            className="absolute top-0 bottom-0 w-0.5 bg-[var(--imd-text)] opacity-65"
                            style={{ right: `${minPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : fifoExpiryAlerts.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--imd-muted)]">
              جميع الدفعات المتبقية ذات صلاحية آمنة (أكثر من 45 يوماً)
            </div>
          ) : (
            <div className="divide-y divide-[var(--imd-table-row-line)]">
              {fifoExpiryAlerts.map((ex, i) => (
                <div key={`${ex.receiptRefNo}-${i}`} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-[var(--imd-text)]">{ex.itemName}</div>
                    <div className="text-[11px] text-[var(--imd-muted)] tabular-nums mt-0.5">
                      الدفعة {ex.receiptRefNo} · {ex.warehouse} · متبقٍ بالدفعة: {fmt(ex.remainingBatchQty)} {ex.baseUnit}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left tabular-nums">
                      <div className="font-bold">{ex.expiryDate}</div>
                      <ImdStatusText
                        label={
                          ex.daysUntilExpiry < 0
                            ? `منتهٍ منذ ${Math.abs(ex.daysUntilExpiry)} يوم`
                            : `متبقٍ ${ex.daysUntilExpiry} يوم`
                        }
                        tone={ex.status === 'expired' || ex.status === 'expiringSoon' ? 'danger' : 'warn'}
                      />
                    </div>
                    <ImdButton
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigateTo({
                          door: 'supplyMoves',
                          subTab: 'issue',
                          prefillItemId: ex.itemId,
                          prefillWarehouse: ex.warehouse,
                        })
                      }
                    >
                      <span>صرف FIFO</span>
                    </ImdButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ImdPanel>

        {/* Action Queue Panel */}
        <ImdPanel
          title="قائمة المهام والإجراءات الفورية"
          subtitle="الطلبيات، التحويلات بالطريق، وجلسات الجرد المفتوحة"
          icon={<Clock className="w-4 h-4" />}
          className="xl:col-span-5"
        >
          <div className="space-y-2.5">
            {pendingTransfers.map((tr) => (
              <div
                key={tr.id}
                className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] flex items-center justify-between gap-2"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--imd-warn)] shrink-0" />
                    <span className="font-mono-num font-bold">{tr.refNo}</span>
                    <span className="truncate font-semibold">{tr.itemName}</span>
                  </div>
                  <div className="text-[11px] text-[var(--imd-muted)] mt-0.5 truncate tabular-nums">
                    إلى: {tr.destWarehouse} · {fmt(tr.qty)} {tr.unitName}
                  </div>
                </div>
                <ImdButton size="sm" variant="primary" onClick={() => handleQuickReceiveTransfer(tr.id)}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تأكيد استلام</span>
                </ImdButton>
              </div>
            ))}

            {pendingOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] flex items-center justify-between gap-2"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <ShoppingCart className="w-3.5 h-3.5 text-[var(--imd-info)] shrink-0" />
                    <span className="font-mono-num font-bold">{ord.refNo}</span>
                    <ImdStatusText
                      label={ord.status === 'PENDING' ? 'بانتظار الاعتماد' : 'معتمدة للتنفيذ'}
                      tone={ord.status === 'PENDING' ? 'warn' : 'info'}
                    />
                  </div>
                  <div className="text-[11px] text-[var(--imd-muted)] mt-0.5 truncate">
                    {ord.requestingWarehouse} · أولوية: {ord.priority}
                  </div>
                </div>
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() => navigateTo({ door: 'supplyOrders', subTab: 'orders', focusId: ord.id })}
                >
                  <span>فتح</span>
                </ImdButton>
              </div>
            ))}

            {openStocktakes.map((stk) => (
              <div
                key={stk.id}
                className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] flex items-center justify-between gap-2"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <ClipboardCheck className="w-3.5 h-3.5 text-[var(--imd-accent)] shrink-0" />
                    <span className="font-mono-num font-bold">{stk.orderNo}</span>
                    <span className="font-semibold">جرد قيد العدّ</span>
                  </div>
                  <div className="text-[11px] text-[var(--imd-muted)] mt-0.5 tabular-nums">
                    {stk.warehouse} · عُدّ {fmt(stk.countedCount, 0)} من {fmt(stk.itemsCount, 0)}
                  </div>
                </div>
                <ImdButton size="sm" variant="secondary" onClick={() => navigateTo({ door: 'stocktake', focusId: stk.id })}>
                  <span>استكمال العدّ</span>
                </ImdButton>
              </div>
            ))}

            {pendingTransfers.length === 0 && pendingOrders.length === 0 && openStocktakes.length === 0 && (
              <div className="py-6 text-center text-xs text-[var(--imd-muted)]">
                لا توجد مهام معلقة — كافة التحويلات والطلبيات مكتملة
              </div>
            )}
          </div>
        </ImdPanel>
      </div>

      {/* 4. Recent Movements Table with 1-Click Voucher Drill-Down */}
      <ImdPanel
        title="آخر حركات المخزون النشطة"
        subtitle="انقر على أي سند لفتحه ومعاينته وطباعته في سجل المستندات"
        headerRight={
          <ImdButton size="sm" variant="secondary" onClick={() => navigateTo({ door: 'documents' })}>
            سجل المستندات الكامل
          </ImdButton>
        }
      >
        <ImdTable
          columns={moveColumns}
          rows={recentMoves}
          rowKey={(r) => r.id}
          onRowClick={(row) => navigateTo({ door: 'documents', searchQuery: row.refNo })}
          reportCountToStatusBar={true}
        />
      </ImdPanel>
    </ImdPage>
  );
};
