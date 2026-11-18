// Fuel Workspace (Doors 1–4): FuelDashboardScreen, FuelMovesScreen (5 tabs), FuelAllocationsScreen, FuelStocktakeScreen

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CheckCircle2,
  Edit2,
  Flame,
  Fuel,
  Plus,
  Power,
  Printer,
  RotateCcw,
  Trash2,
  Truck,
} from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdFld,
  ImdKpiCard,
  ImdModal,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
  ImdTabs,
} from '../../components/imd/primitives';
import { ImdTable } from '../../components/imd/ImdTable';
import { Ids } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import { computeAllocationBalance, computeFuelVehicleReport } from '../../domain/fuelEngine';
import type {
  FuelAllocation,
  FuelAuditLog,
  FuelIssue,
  FuelMaintenance,
  FuelOpening,
  FuelPeriodType,
  FuelStocktake,
  FuelSupply,
  FuelTankReading,
  FuelTransfer,
  FuelType,
} from '../../domain/types';

function fuelPastDateIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const FuelDashboardScreen: React.FC = () => {
  const { db, fuelTanks, navigateTo, fmt } = useEmdad();
  const today = todayIso();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalPetrol = fuelTanks.reduce((s, t) => s + t.petrol, 0);
  const totalDiesel = fuelTanks.reduce((s, t) => s + t.diesel, 0);
  const totalCap = fuelTanks.reduce((s, t) => s + t.capacityLiters, 0);
  const lowTanksCount = fuelTanks.filter((t) => t.isLowStock).length;
  const activeAllocations = db.fuel_allocations.filter((a) => a.active);
  const totalTodayIssued = db.fuel_issues
    .filter((i) => i.date === today)
    .reduce((s, i) => s + i.quantityLiters, 0);
  const totalTodaySupplied = db.fuel_supplies
    .filter((s) => s.date === today)
    .reduce((acc, s) => acc + s.quantityLiters, 0);

  const flow14Days = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, idx) => fuelPastDateIso(13 - idx));
    return days.map((dt) => {
      const supplied = db.fuel_supplies
        .filter((s) => s.date === dt)
        .reduce((acc, s) => acc + s.quantityLiters, 0);
      const issuedPetrol = db.fuel_issues
        .filter((i) => i.date === dt && i.fuelType === 'petrol')
        .reduce((acc, i) => acc + i.quantityLiters, 0);
      const issuedDiesel = db.fuel_issues
        .filter((i) => i.date === dt && i.fuelType === 'diesel')
        .reduce((acc, i) => acc + i.quantityLiters, 0);
      return {
        date: dt,
        label: dt.slice(5),
        supplied,
        issued: issuedPetrol + issuedDiesel,
        issuedPetrol,
        issuedDiesel,
      };
    });
  }, [db.fuel_supplies, db.fuel_issues]);

  const maxFlow = useMemo(
    () => Math.max(500, ...flow14Days.flatMap((d) => [d.supplied, d.issued])),
    [flow14Days]
  );

  const activePoint = hoveredIdx !== null ? flow14Days[hoveredIdx] : flow14Days[flow14Days.length - 1];

  const topVehicles = useMemo(
    () => computeFuelVehicleReport(db.fuel_issues).slice(0, 5),
    [db.fuel_issues]
  );

  const allocBalances = useMemo(() => {
    const settings = db.fuel_settings_rows[0];
    return activeAllocations
      .map((a) => computeAllocationBalance(a, db.fuel_issues, settings, today))
      .slice(0, 5);
  }, [activeAllocations, db.fuel_issues, db.fuel_settings_rows, today]);

  return (
    <ImdPage
      title="لوحة عمليات المحروقات والوقود"
      subtitle={`التاريخ: ${today} · السعة الإجمالية للخزانات: ${fmt(totalCap, 0)} لتر`}
      actions={
        <div className="flex items-center gap-2">
          <ImdButton
            variant="secondary"
            onClick={() => navigateTo({ door: 'fuelMoves', subTab: 'supply' })}
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>توريد وقود</span>
          </ImdButton>
          <ImdButton
            variant="primary"
            onClick={() => navigateTo({ door: 'fuelMoves', subTab: 'issue' })}
          >
            <Flame className="w-4 h-4" />
            <span>صرف محروقات</span>
          </ImdButton>
        </div>
      }
    >
      {/* Executive Fuel KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ImdKpiCard
          label="رصيد البترول المتاح"
          value={`${fmt(totalPetrol, 0)} لتر`}
          tone="accent"
          icon={<Fuel className="w-4 h-4" />}
          meta={`عبر ${fuelTanks.length} محطات تخزين`}
          onClick={() => navigateTo({ door: 'fuelReports', subTab: 'balances' })}
        />
        <ImdKpiCard
          label="رصيد الديزل المتاح"
          value={`${fmt(totalDiesel, 0)} لتر`}
          tone="info"
          icon={<Flame className="w-4 h-4" />}
          meta={lowTanksCount > 0 ? `${lowTanksCount} خزان دون الحد الأدنى` : 'مستويات التخزين مستقرة'}
          onClick={() => navigateTo({ door: 'fuelReports', subTab: 'balances' })}
        />
        <ImdKpiCard
          label="الحركة اليومية للوقود"
          value={`${fmt(totalTodayIssued, 0)} لتر`}
          tone="default"
          icon={<ArrowUpFromLine className="w-4 h-4" />}
          meta={`وارد اليوم: ${fmt(totalTodaySupplied, 0)} لتر`}
          onClick={() => navigateTo({ door: 'fuelReports', subTab: 'daily' })}
        />
        <ImdKpiCard
          label="التفريدات النشطة"
          value={fmt(activeAllocations.length, 0)}
          tone={lowTanksCount > 0 ? 'warn' : 'success'}
          icon={<Truck className="w-4 h-4" />}
          meta={`${fmt(db.fuel_stocktakes.filter((s) => s.status !== 'posted').length, 0)} جلسات جرد مفتوحة`}
          onClick={() => navigateTo({ door: 'fuelAllocations' })}
        />
      </div>

      {/* 14-Day Fuel Flow Chart + Top Vehicles */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <ImdPanel
            title="تدفق المحروقات — آخر 14 يوماً (التوريد مقابل الصرف)"
            icon={<Activity className="w-4 h-4" />}
            subtitle="مرّر المؤشر على الأعمدة لقراءة حجم التوريد وتوزيع الصرف بين البترول والديزل"
            headerRight={
              activePoint && (
                <div className="flex items-center gap-3 text-xs font-mono-num">
                  <span className="text-[var(--imd-muted)]">{activePoint.date}</span>
                  <span className="text-[var(--imd-accent)] font-bold">
                    وارد: {fmt(activePoint.supplied, 0)} ل
                  </span>
                  <span className="text-[var(--imd-info)] font-bold">
                    صرف: {fmt(activePoint.issued, 0)} ل
                  </span>
                </div>
              )
            }
          >
            <div className="space-y-3">
              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 640 165"
                  className="w-full h-44 select-none"
                  role="img"
                  aria-label="مخطط تدفق المحروقات لآخر 14 يوماً"
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                    const y = 135 - frac * 112;
                    return (
                      <g key={idx}>
                        <line
                          x1={32}
                          x2={630}
                          y1={y}
                          y2={y}
                          stroke="var(--imd-line)"
                          strokeWidth={idx === 0 ? 1.2 : 0.7}
                          strokeDasharray={idx === 0 ? undefined : '3 3'}
                        />
                        <text
                          x={26}
                          y={y + 3}
                          textAnchor="end"
                          fontSize="9"
                          fill="var(--imd-muted)"
                          className="font-mono-num"
                        >
                          {Math.round(maxFlow * frac)}
                        </text>
                      </g>
                    );
                  })}

                  {flow14Days.map((pt, idx) => {
                    const slotW = 590 / flow14Days.length;
                    const xCenter = 38 + idx * slotW + slotW / 2;
                    const barW = Math.min(13, (slotW - 10) / 2);
                    const supH = (pt.supplied / maxFlow) * 112;
                    const issH = (pt.issued / maxFlow) * 112;
                    const isHovered = hoveredIdx === idx;
                    return (
                      <g
                        key={pt.date}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className="cursor-pointer"
                      >
                        {isHovered && (
                          <rect
                            x={xCenter - slotW / 2 + 2}
                            y={15}
                            width={slotW - 4}
                            height={120}
                            fill="var(--imd-accent-soft)"
                            rx={3}
                          />
                        )}
                        <rect
                          x={xCenter - barW - 1}
                          y={135 - supH}
                          width={barW}
                          height={Math.max(1.5, supH)}
                          fill="var(--imd-accent)"
                          opacity={hoveredIdx === null || isHovered ? 0.9 : 0.45}
                          rx={2}
                        />
                        <rect
                          x={xCenter + 1}
                          y={135 - issH}
                          width={barW}
                          height={Math.max(1.5, issH)}
                          fill="var(--imd-warn)"
                          opacity={hoveredIdx === null || isHovered ? 0.9 : 0.45}
                          rx={2}
                        />
                        <text
                          x={xCenter}
                          y={152}
                          textAnchor="middle"
                          fontSize="8.5"
                          fill={isHovered ? 'var(--imd-text)' : 'var(--imd-muted)'}
                          fontWeight={isHovered ? 700 : 500}
                          className="font-mono-num"
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--imd-line)] text-xs text-[var(--imd-muted)]">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: 'var(--imd-accent)', borderRadius: '2px' }} />
                    التوريد الوارد (لتر)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: 'var(--imd-warn)', borderRadius: '2px' }} />
                    الصرف الفعلي (لتر)
                  </span>
                </div>
                {activePoint && (
                  <span className="font-mono-num">
                    تفصيل صرف {activePoint.label}: بترول {fmt(activePoint.issuedPetrol, 0)} ل · ديزل {fmt(activePoint.issuedDiesel, 0)} ل
                  </span>
                )}
              </div>
            </div>
          </ImdPanel>
        </div>

        {/* Top Vehicles by Chassis Consumption */}
        <div className="lg:col-span-4">
          <ImdPanel
            title="المركبات الأكثر استهلاكاً"
            icon={<Truck className="w-4 h-4" />}
            headerRight={
              <ImdButton
                size="sm"
                variant="ghost"
                onClick={() => navigateTo({ door: 'fuelReports', subTab: 'vehicles' })}
              >
                التقرير الكامل
              </ImdButton>
            }
          >
            {topVehicles.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--imd-muted)]">
                لا توجد حركات صرف مسجلة للمركبات بعد
              </div>
            ) : (
              <div className="space-y-2.5">
                {topVehicles.map((v) => {
                  const maxL = topVehicles[0]?.totalLiters || 1;
                  const pct = Math.max(8, Math.round((v.totalLiters / maxL) * 100));
                  return (
                    <button
                      key={v.vehicleKey}
                      type="button"
                      onClick={() => navigateTo({ door: 'fuelReports', subTab: 'vehicles' })}
                      className="w-full text-right p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] hover:border-[var(--imd-line-strong)] transition-colors cursor-pointer"
                      style={{ borderRadius: 'var(--imd-radius-sm)' }}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono-num font-bold text-[var(--imd-text)]">{v.plateOrChassis}</span>
                        <span className="font-mono-num font-bold text-[var(--imd-accent)]">{fmt(v.totalLiters, 0)} لتر</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--imd-muted)] mt-0.5">
                        <span className="truncate">{v.unitName || 'وحدة غير محددة'}</span>
                        <span className="tabular-nums">{fmt(v.issueCount, 0)} تعبئة</span>
                      </div>
                      <div className="h-1.5 bg-[var(--imd-subtle)] mt-1.5 overflow-hidden" style={{ borderRadius: '2px' }}>
                        <div className="h-full bg-[var(--imd-accent)]" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ImdPanel>
        </div>
      </div>

      {/* Tank Occupancy Dual-Fuel Breakdown + Allocations Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ImdPanel title="موقف الخزانات ونسب الإشغال (بترول / ديزل)" icon={<Fuel className="w-4 h-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fuelTanks.map((t) => {
                const petrolPct = t.capacityLiters > 0 ? Math.min(100, (t.petrol / t.capacityLiters) * 100) : 0;
                const dieselPct = t.capacityLiters > 0 ? Math.min(100 - petrolPct, (t.diesel / t.capacityLiters) * 100) : 0;
                return (
                  <div
                    key={t.warehouseId}
                    className="border border-[var(--imd-line)] p-3.5 bg-[var(--imd-panel-fill)] space-y-2.5"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-[var(--imd-text)]">{t.warehouseName}</div>
                        <div className="text-[11px] text-[var(--imd-muted)] font-mono-num">
                          السعة: {fmt(t.capacityLiters, 0)} لتر
                        </div>
                      </div>
                      {t.isLowStock ? (
                        <ImdStatusText label="مستوى منخفض" tone="danger" />
                      ) : (
                        <span className="text-xs font-bold font-mono-num text-[var(--imd-accent)]">
                          {fmt(t.occupancyPct, 1)}%
                        </span>
                      )}
                    </div>

                    <div className="h-2.5 bg-[var(--imd-subtle)] overflow-hidden flex" style={{ borderRadius: '3px' }}>
                      <div
                        className="h-full"
                        style={{ width: `${petrolPct}%`, backgroundColor: 'var(--imd-accent)' }}
                        title={`بترول: ${fmt(t.petrol, 0)} لتر`}
                      />
                      <div
                        className="h-full"
                        style={{ width: `${dieselPct}%`, backgroundColor: 'var(--imd-info)' }}
                        title={`ديزل: ${fmt(t.diesel, 0)} لتر`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[var(--imd-muted)] tabular-nums">
                      <span>
                        بترول: <strong className="text-[var(--imd-text)]">{fmt(t.petrol, 0)}</strong> ل
                      </span>
                      <span>
                        ديزل: <strong className="text-[var(--imd-text)]">{fmt(t.diesel, 0)}</strong> ل
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--imd-line)]">
                      <ImdButton
                        size="sm"
                        variant={t.isLowStock ? 'orange' : 'secondary'}
                        className="flex-1"
                        onClick={() =>
                          navigateTo({
                            door: 'fuelMoves',
                            subTab: 'supply',
                            prefillWarehouse: t.warehouseName,
                          })
                        }
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                        <span>توريد للخزان</span>
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          navigateTo({
                            door: 'fuelMoves',
                            subTab: 'issue',
                            prefillWarehouse: t.warehouseName,
                          })
                        }
                      >
                        صرف
                      </ImdButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </ImdPanel>
        </div>

        <div className="lg:col-span-5">
          <ImdPanel
            title="متابعة استهلاك التفريدات النشطة"
            icon={<AlertTriangle className="w-4 h-4" />}
            headerRight={
              <ImdButton size="sm" variant="ghost" onClick={() => navigateTo({ door: 'fuelAllocations' })}>
                إدارة التفريدات
              </ImdButton>
            }
          >
            <div className="space-y-2.5">
              {allocBalances.map((row) => {
                const ratio = row.grossEntitled > 0 ? Math.min(100, Math.round((row.issuedSoFar / row.grossEntitled) * 100)) : 0;
                return (
                  <div
                    key={row.allocation.id}
                    className="p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[var(--imd-text)]">{row.allocation.unitName}</span>
                      <span className="font-mono-num text-[var(--imd-muted)]">
                        {row.allocation.fuelType === 'petrol' ? 'بترول' : 'ديزل'} · متبقي {fmt(row.remainingBalance, 0)} لتر
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-2 bg-[var(--imd-subtle)] overflow-hidden" style={{ borderRadius: '2px' }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${ratio}%`,
                            backgroundColor:
                              ratio >= 95 ? 'var(--imd-danger)' : ratio >= 80 ? 'var(--imd-warn)' : 'var(--imd-success)',
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-mono-num text-[var(--imd-muted)] w-9 text-left">{ratio}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ImdPanel>
        </div>
      </div>

      {/* Recent Fuel Issues Table */}
      <ImdPanel
        title="آخر سندات صرف المحروقات"
        headerRight={
          <ImdButton size="sm" variant="ghost" onClick={() => navigateTo({ door: 'fuelMoves', subTab: 'log' })}>
            سجل الحركات الكامل
          </ImdButton>
        }
      >
        <ImdTable
          columns={[
            { key: 'ref', header: 'المرجع', render: (r) => <span className="font-mono-num font-semibold text-[var(--imd-accent)]">{r.refNo}</span> },
            { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
            { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
            { key: 'wh', header: 'المحطة', render: (r) => r.warehouse },
            { key: 'src', header: 'المصدر', render: (r) => (r.source === 'allocation' ? 'تفريدة' : 'استثنائي') },
            { key: 'ben', header: 'الوحدة', render: (r) => r.beneficiaryName },
            { key: 'ch', header: 'الشاصي', render: (r) => <span className="font-mono-num text-xs">{r.chassisNo || '—'}</span> },
            { key: 'q', header: 'الكمية', numeric: true, render: (r) => <strong>{fmt(r.quantityLiters, 0)} لتر</strong> },
          ]}
          rows={db.fuel_issues.slice(0, 8)}
          rowKey={(r) => r.id}
          onRowClick={() => navigateTo({ door: 'fuelMoves', subTab: 'log' })}
        />
      </ImdPanel>
    </ImdPage>
  );
};

export const FuelMovesScreen: React.FC = () => {
  const { db, currentUser, fuelTanks, navIntent, clearNavIntent, upsertRow, deleteRow, nextDocRef, logAudit, notify, openPrintPreview, fmt } =
    useEmdad();
  const [tab, setTab] = useState<'issue' | 'supply' | 'transfer' | 'opening' | 'log'>('issue');
  const [logKind, setLogKind] = useState<'issues' | 'supplies' | 'transfers' | 'openings'>('issues');
  const fSettings = db.fuel_settings_rows[0];

  const [date, setDate] = useState(todayIso());
  const [warehouse, setWarehouse] = useState(db.fuel_warehouses[0]?.name ?? '');
  const [destWarehouse, setDestWarehouse] = useState(db.fuel_warehouses[1]?.name ?? db.fuel_warehouses[0]?.name ?? '');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [liters, setLiters] = useState('150');
  const [source, setSource] = useState<'allocation' | 'exceptional'>('allocation');
  const [allocId, setAllocId] = useState(db.fuel_allocations[0]?.id ?? '');
  const [unitId, setUnitId] = useState(db.fuel_units[0]?.id ?? '');
  const [driver, setDriver] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [chassisNo, setChassisNo] = useState('');
  const [supplier, setSupplier] = useState('شركة مصافي النفط الوطنية');
  const [justification, setJustification] = useState('');

  const tank = fuelTanks.find((t) => t.warehouseName === warehouse);
  const availLiters = tank ? (fuelType === 'petrol' ? tank.petrol : tank.diesel) : 0;

  const selectedAllocStat = useMemo(() => {
    if (source !== 'allocation' || !allocId) return null;
    const alloc = db.fuel_allocations.find((a) => a.id === allocId);
    return alloc ? computeAllocationBalance(alloc, db.fuel_issues, fSettings, todayIso()) : null;
  }, [source, allocId, db.fuel_allocations, db.fuel_issues, fSettings]);

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'fuelMoves') return;
    if (navIntent.subTab) {
      setTab(navIntent.subTab as 'issue' | 'supply' | 'transfer' | 'opening' | 'log');
    }
    if (navIntent.prefillWarehouse) {
      setWarehouse(navIntent.prefillWarehouse);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const printFuelIssue = async (iss: FuelIssue) => {
    await openPrintPreview({
      formKey: 'fuel_issue',
      space: 'fuel',
      title: 'سند صرف محروقات',
      refNo: iss.refNo,
      date: iss.date,
      warehouse: iss.warehouse,
      partyLabel: 'الوحدة المستفيدة',
      partyValue: iss.beneficiaryName || '—',
      notes: iss.justification || iss.notes,
      opType: 'صرف محروقات',
      columns: ['نوع الوقود', 'الكمية (لتر)', 'المركبة', 'رقم الشاصي', 'السائق'],
      rows: [[iss.fuelType === 'petrol' ? 'بترول' : 'ديزل', fmt(iss.quantityLiters, 0), iss.vehicleType || '—', iss.chassisNo || '—', iss.driverName || '—']],
      totalQty: iss.quantityLiters,
      actorName: currentUser?.name ?? '',
    });
  };

  const printFuelSupply = async (sup: FuelSupply) => {
    await openPrintPreview({
      formKey: 'fuel_supply',
      space: 'fuel',
      title: 'سند توريد محروقات',
      refNo: sup.refNo,
      date: sup.date,
      warehouse: sup.warehouse,
      partyLabel: 'المورد',
      partyValue: sup.supplierName || '—',
      notes: sup.notes,
      opType: 'توريد محروقات',
      columns: ['نوع الوقود', 'الكمية (لتر)', 'الناقلة', 'السائق'],
      rows: [[sup.fuelType === 'petrol' ? 'بترول' : 'ديزل', fmt(sup.quantityLiters, 0), sup.transportVehicleType || '—', sup.driverName || '—']],
      totalQty: sup.quantityLiters,
      actorName: currentUser?.name ?? '',
    });
  };

  const printFuelTransfer = async (tr: FuelTransfer) => {
    await openPrintPreview({
      formKey: 'fuel_transfer',
      space: 'fuel',
      title: 'إذن تحويل محروقات بين المحطات',
      refNo: tr.refNo,
      date: tr.date,
      warehouse: tr.fromWarehouse,
      partyLabel: 'المحطة الوجهة',
      partyValue: tr.toWarehouse,
      notes: tr.notes,
      opType: 'تحويل محروقات',
      columns: ['نوع الوقود', 'الكمية (لتر)', 'الصهريج', 'السائق'],
      rows: [[tr.fuelType === 'petrol' ? 'بترول' : 'ديزل', fmt(tr.quantityLiters, 0), tr.transportVehicleType || '—', tr.driverName || '—']],
      totalQty: tr.quantityLiters,
      actorName: currentUser?.name ?? '',
    });
  };

  const handleSaveIssue = async () => {
    const qty = Math.max(0, Number(liters) || 0);
    if (qty <= 0) return;
    if (qty > availLiters) {
      notify(`الرصيد المتاح في ${warehouse} (${fmt(availLiters)} لتر) غير كافٍ`, 'danger');
      return;
    }
    if (fSettings?.requireChassis && !chassisNo.trim()) {
      notify('إعدادات المحروقات تشترط إدخال رقم الشاصي عند الصرف', 'danger');
      return;
    }
    if (source === 'exceptional' && !fSettings?.allowExceptional) {
      notify('الصرف الاستثنائي معطّل في إعدادات المحروقات', 'danger');
      return;
    }
    const alloc = db.fuel_allocations.find((a) => a.id === allocId);
    const unit = db.fuel_units.find((u) => u.id === unitId);
    const refNo = nextDocRef('fuelIssue');
    const iss: FuelIssue = {
      id: Ids.next('fiss'),
      refNo,
      date,
      fuelType,
      warehouse,
      source,
      quantityLiters: qty,
      driverName: driver,
      vehicleType,
      chassisNo: chassisNo.trim().toUpperCase(),
      allocationId: source === 'allocation' ? allocId : '',
      beneficiaryUnitId: source === 'allocation' ? alloc?.unitId ?? unitId : unitId,
      beneficiaryName: source === 'allocation' ? alloc?.unitName ?? unit?.name ?? '' : unit?.name ?? '',
      entitledLiters: alloc?.quantityPerPeriod ?? 0,
      periodType: alloc?.periodType ?? 'daily',
      customFrom: '',
      customTo: '',
      justification,
      orderAuthority: '',
      purpose: justification,
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    upsertRow('fuel_issues', iss);
    logAudit({
      action: 'FUEL_ISSUE',
      entityType: 'fuel_issues',
      summary: `صرف ${qty} لتر ${fuelType === 'petrol' ? 'بترول' : 'ديزل'} لـ ${iss.beneficiaryName}`,
      risk: source === 'exceptional' ? 'sensitive' : 'normal',
      refNo,
      warehouse,
      qty,
    });
    notify(`تم اعتماد سند صرف المحروقات ${refNo}`, 'success');
    await printFuelIssue(iss);
  };

  const handleSaveSupply = () => {
    const qty = Math.max(0, Number(liters) || 0);
    if (qty <= 0) return;
    const refNo = nextDocRef('fuelSupply');
    const sup: FuelSupply = {
      id: Ids.next('fsup'),
      refNo,
      date,
      fuelType,
      quantityLiters: qty,
      supplierName: supplier,
      warehouse,
      transportVehicleType: vehicleType,
      driverName: driver,
      notes: justification,
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    upsertRow('fuel_supplies', sup);
    logAudit({
      action: 'FUEL_SUPPLY',
      entityType: 'fuel_supplies',
      summary: `توريد ${qty} لتر ${fuelType === 'petrol' ? 'بترول' : 'ديزل'} إلى ${warehouse}`,
      refNo,
      warehouse,
      qty,
    });
    notify(`تم توريد ${fmt(qty, 0)} لتر بسند ${refNo}`, 'success');
  };

  const handleSaveTransfer = () => {
    const qty = Math.max(0, Number(liters) || 0);
    if (qty <= 0 || warehouse === destWarehouse || qty > availLiters) {
      notify('تحقق من المستودعات والكمية المتاحة', 'danger');
      return;
    }
    const refNo = nextDocRef('fuelTransfer');
    const tr: FuelTransfer = {
      id: Ids.next('ftr'),
      refNo,
      date,
      fuelType,
      quantityLiters: qty,
      fromWarehouse: warehouse,
      toWarehouse: destWarehouse,
      driverName: driver,
      transportVehicleType: vehicleType,
      notes: justification,
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    upsertRow('fuel_transfers', tr);
    logAudit({
      action: 'FUEL_TRANSFER',
      entityType: 'fuel_transfers',
      summary: `تحويل ${qty} لتر ${fuelType === 'petrol' ? 'بترول' : 'ديزل'} من ${warehouse} إلى ${destWarehouse}`,
      refNo,
      warehouse,
      qty,
    });
    notify(`تم تحويل ${fmt(qty, 0)} لتر بسند ${refNo}`, 'success');
  };

  const handleReverseTransfer = (t: FuelTransfer) => {
    const destTank = fuelTanks.find((x) => x.warehouseName === t.toWarehouse);
    const destAvail = destTank ? (t.fuelType === 'petrol' ? destTank.petrol : destTank.diesel) : 0;
    if (destAvail < t.quantityLiters) {
      notify(`لا يمكن عكس التحويل — المتاح حالياً في ${t.toWarehouse} (${fmt(destAvail, 0)} لتر) أقل من الكمية`, 'danger');
      return;
    }
    const revRef = nextDocRef('fuelTransfer');
    const rev: FuelTransfer = {
      id: Ids.next('ftr'),
      refNo: revRef,
      date: todayIso(),
      fuelType: t.fuelType,
      quantityLiters: t.quantityLiters,
      fromWarehouse: t.toWarehouse,
      toWarehouse: t.fromWarehouse,
      driverName: t.driverName,
      transportVehicleType: t.transportVehicleType,
      notes: `عكس سند التحويل ${t.refNo}`,
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    upsertRow('fuel_transfers', rev);
    logAudit({
      action: 'FUEL_TRANSFER_REVERSE',
      entityType: 'fuel_transfers',
      summary: `عكس تحويل محروقات ${t.refNo} بسند عكسي ${revRef} (${t.quantityLiters} لتر)`,
      risk: 'sensitive',
      refNo: revRef,
      warehouse: t.toWarehouse,
      qty: t.quantityLiters,
    });
    notify(`تم إنشاء قيد عكس التحويل ${revRef}`, 'warn');
  };

  const handleSaveOpening = () => {
    const qty = Math.max(0, Number(liters) || 0);
    const op: FuelOpening = {
      id: Ids.next('fop'),
      warehouse,
      fuelType,
      liters: qty,
      asOfDate: date,
      note: justification,
      createdAt: new Date().toISOString(),
    };
    upsertRow('fuel_openings', op);
    logAudit({
      action: 'FUEL_OPENING',
      entityType: 'fuel_openings',
      summary: `رصيد افتتاحي ${qty} لتر ${fuelType === 'petrol' ? 'بترول' : 'ديزل'} في ${warehouse}`,
      warehouse,
      qty,
    });
    notify('تم تسجيل الرصيد الافتتاحي للمحروقات', 'success');
  };

  const handleDeleteOpening = (o: FuelOpening) => {
    deleteRow('fuel_openings', o.id);
    logAudit({
      action: 'FUEL_OPENING_DELETE',
      entityType: 'fuel_openings',
      summary: `حذف رصيد افتتاحي للمحروقات (${o.warehouse} — ${o.liters} لتر)`,
      risk: 'sensitive',
      warehouse: o.warehouse,
      qty: o.liters,
    });
    notify(`تم حذف الرصيد الافتتاحي في ${o.warehouse}`, 'warn');
  };

  useEffect(() => {
    const onGlobalSave = () => {
      if (tab === 'issue') void handleSaveIssue();
      else if (tab === 'supply') handleSaveSupply();
      else if (tab === 'transfer') handleSaveTransfer();
      else if (tab === 'opening') handleSaveOpening();
    };
    window.addEventListener('imd:save', onGlobalSave);
    return () => window.removeEventListener('imd:save', onGlobalSave);
  });

  return (
    <ImdPage title="حركة المحروقات" subtitle="صرف الوقود للمركبات والوحدات · التوريد · التحويل بين المحطات · الرصيد الافتتاحي">
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as typeof tab)}
        tabs={[
          { id: 'issue', label: 'صرف محروقات', count: db.fuel_issues.length },
          { id: 'supply', label: 'توريد محروقات', count: db.fuel_supplies.length },
          { id: 'transfer', label: 'تحويل بين المحطات', count: db.fuel_transfers.length },
          { id: 'opening', label: 'رصيد افتتاحي', count: db.fuel_openings.length },
          { id: 'log', label: 'سجل الحركات الشامل' },
        ]}
      />

      {tab !== 'log' ? (
        <ImdPanel
          title={tab === 'issue' ? 'صرف محروقات' : tab === 'supply' ? 'توريد محروقات' : tab === 'transfer' ? 'تحويل محروقات' : 'رصيد افتتاحي'}
          headerRight={
            <div className="text-xs text-[var(--imd-muted)] tabular-nums">
              الرصيد المتاح ({fuelType === 'petrol' ? 'بترول' : 'ديزل'}): <strong className="text-[var(--imd-accent)]">{fmt(availLiters, 0)} لتر</strong>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <ImdFld label="التاريخ" type="date" value={date} onChange={setDate} />
            <ImdSelect
              label={tab === 'transfer' ? 'المحطة المصدر' : 'المحطة / الخزان'}
              value={warehouse}
              onChange={setWarehouse}
              options={db.fuel_warehouses.map((w) => ({ value: w.name, label: w.name }))}
            />
            <ImdSelect
              label="نوع الوقود"
              value={fuelType}
              onChange={(v) => setFuelType(v as FuelType)}
              options={[
                { value: 'diesel', label: 'ديزل' },
                { value: 'petrol', label: 'بترول' },
              ]}
            />
            <ImdFld label="الكمية (لتر)" type="number" value={liters} onChange={setLiters} />

            {tab === 'issue' && (
              <>
                <ImdSelect
                  label="مصدر الصرف"
                  value={source}
                  onChange={(v) => setSource(v as 'allocation' | 'exceptional')}
                  options={[
                    { value: 'allocation', label: 'من التفريدة الدورية' },
                    { value: 'exceptional', label: 'صرف استثنائي (أمر/طوارئ)' },
                  ]}
                />
                {source === 'allocation' ? (
                  <ImdSelect
                    label="التفريدة"
                    value={allocId}
                    onChange={setAllocId}
                    options={db.fuel_allocations.map((a) => ({ value: a.id, label: `${a.unitName} (${a.fuelType === 'petrol' ? 'بترول' : 'ديزل'})` }))}
                  />
                ) : (
                  <ImdSelect
                    label="الوحدة المستفيدة"
                    value={unitId}
                    onChange={setUnitId}
                    options={db.fuel_units.map((u) => ({ value: u.id, label: u.name }))}
                  />
                )}
                <ImdFld label="رقم الشاصي (chassisNo)" value={chassisNo} onChange={setChassisNo} placeholder="إلزامي عند التفعيل" />
                <ImdFld label="نوع المركبة" value={vehicleType} onChange={setVehicleType} />
                <ImdFld label="اسم السائق" value={driver} onChange={setDriver} />
                <ImdFld label="الغرض / المبرر" value={justification} onChange={setJustification} className="md:col-span-2" />
                {source === 'allocation' && selectedAllocStat && (
                  <div
                    className="md:col-span-4 p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] space-y-2"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="font-bold text-[var(--imd-text)]">
                        جاهزية التفريدة: {selectedAllocStat.allocation.unitName} ({selectedAllocStat.allocation.fuelType === 'petrol' ? 'بترول' : 'ديزل'})
                      </span>
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        <span>المستحق التراكمي: <strong>{fmt(selectedAllocStat.grossEntitled, 0)} لتر</strong></span>
                        <span>المصروف: <strong>{fmt(selectedAllocStat.issuedSoFar, 0)} لتر</strong></span>
                        <span style={{ color: selectedAllocStat.remainingBalance > 0 ? 'var(--imd-accent)' : 'var(--imd-danger)' }}>
                          المتبقي المتاح: <strong>{fmt(selectedAllocStat.remainingBalance, 0)} لتر</strong>
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-[var(--imd-subtle)] overflow-hidden" style={{ borderRadius: '2px' }}>
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${
                            selectedAllocStat.grossEntitled > 0
                              ? Math.min(100, Math.round((selectedAllocStat.issuedSoFar / selectedAllocStat.grossEntitled) * 100))
                              : 0
                          }%`,
                          backgroundColor:
                            selectedAllocStat.remainingBalance <= 0
                              ? 'var(--imd-danger)'
                              : (Number(liters) || 0) > selectedAllocStat.remainingBalance
                              ? 'var(--imd-warn)'
                              : 'var(--imd-accent)',
                        }}
                      />
                    </div>
                    {(Number(liters) || 0) > selectedAllocStat.remainingBalance && (
                      <div className="text-[11px] font-semibold text-[var(--imd-danger)]">
                        تنبيه: الكمية المطلوبة ({fmt(Number(liters) || 0, 0)} لتر) تتجاوز الرصيد المتاح بالتفريدة ({fmt(selectedAllocStat.remainingBalance, 0)} لتر).
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'supply' && (
              <>
                <ImdFld label="المورد" value={supplier} onChange={setSupplier} />
                <ImdFld label="السائق" value={driver} onChange={setDriver} />
                <ImdFld label="ناقلة التوريد" value={vehicleType} onChange={setVehicleType} />
              </>
            )}

            {tab === 'transfer' && (
              <>
                <ImdSelect
                  label="المحطة الوجهة"
                  value={destWarehouse}
                  onChange={setDestWarehouse}
                  options={db.fuel_warehouses.map((w) => ({ value: w.name, label: w.name }))}
                />
                <ImdFld label="السائق" value={driver} onChange={setDriver} />
                <ImdFld label="الصهريج" value={vehicleType} onChange={setVehicleType} />
              </>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            {tab === 'issue' && <ImdButton variant="primary" onClick={handleSaveIssue}>اعتماد الصرف والطباعة</ImdButton>}
            {tab === 'supply' && <ImdButton variant="orange" onClick={handleSaveSupply}>تسجيل التوريد</ImdButton>}
            {tab === 'transfer' && <ImdButton variant="primary" onClick={handleSaveTransfer}>تنفيذ التحويل</ImdButton>}
            {tab === 'opening' && <ImdButton variant="primary" onClick={handleSaveOpening}>حفظ الرصيد الافتتاحي</ImdButton>}
          </div>
        </ImdPanel>
      ) : (
        <div className="space-y-4">
          <ImdTabs
            active={logKind}
            onChange={(v) => setLogKind(v as typeof logKind)}
            tabs={[
              { id: 'issues', label: 'سندات الصرف', count: db.fuel_issues.length },
              { id: 'supplies', label: 'سندات التوريد', count: db.fuel_supplies.length },
              { id: 'transfers', label: 'أذون التحويل', count: db.fuel_transfers.length },
              { id: 'openings', label: 'الأرصدة الافتتاحية', count: db.fuel_openings.length },
            ]}
          />

          {logKind === 'issues' && (
            <ImdPanel title="سجل سندات صرف المحروقات">
              <ImdTable
                columns={[
                  { key: 'ref', header: 'المرجع', render: (r) => <span className="font-mono-num font-semibold">{r.refNo}</span> },
                  { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
                  { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                  { key: 'wh', header: 'المحطة', render: (r) => r.warehouse },
                  { key: 'ben', header: 'المستفيد', render: (r) => r.beneficiaryName || '—' },
                  { key: 'ch', header: 'الشاصي', render: (r) => <span className="font-mono-num text-xs">{r.chassisNo || '—'}</span> },
                  { key: 'q', header: 'الكمية', numeric: true, render: (r) => <strong>{fmt(r.quantityLiters, 0)} لتر</strong> },
                  {
                    key: 'act',
                    header: 'طباعة',
                    render: (r) => (
                      <ImdButton size="sm" variant="ghost" title="طباعة السند" onClick={() => void printFuelIssue(r)}>
                        <Printer className="w-3.5 h-3.5" />
                      </ImdButton>
                    ),
                  },
                ]}
                rows={db.fuel_issues}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}

          {logKind === 'supplies' && (
            <ImdPanel title="سجل سندات توريد المحروقات">
              <ImdTable
                columns={[
                  { key: 'ref', header: 'المرجع', render: (r) => <span className="font-mono-num font-semibold">{r.refNo}</span> },
                  { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
                  { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                  { key: 'wh', header: 'المحطة', render: (r) => r.warehouse },
                  { key: 'sup', header: 'المورد', render: (r) => r.supplierName || '—' },
                  { key: 'q', header: 'الكمية', numeric: true, render: (r) => <strong>{fmt(r.quantityLiters, 0)} لتر</strong> },
                  {
                    key: 'act',
                    header: 'طباعة',
                    render: (r) => (
                      <ImdButton size="sm" variant="ghost" title="طباعة السند" onClick={() => void printFuelSupply(r)}>
                        <Printer className="w-3.5 h-3.5" />
                      </ImdButton>
                    ),
                  },
                ]}
                rows={db.fuel_supplies}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}

          {logKind === 'transfers' && (
            <ImdPanel title="سجل تحويلات المحروقات بين المحطات" subtitle="يمكنك طباعة الإذن أو عكس أي تحويل بقيد معاكس">
              <ImdTable
                columns={[
                  { key: 'ref', header: 'المرجع', render: (r) => <span className="font-mono-num font-semibold">{r.refNo}</span> },
                  { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
                  { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                  { key: 'fr', header: 'من محطة', render: (r) => r.fromWarehouse },
                  { key: 'to', header: 'إلى محطة', render: (r) => r.toWarehouse },
                  { key: 'q', header: 'الكمية', numeric: true, render: (r) => <strong>{fmt(r.quantityLiters, 0)} لتر</strong> },
                  {
                    key: 'act',
                    header: 'الإجراءات',
                    render: (r) => (
                      <div className="flex items-center gap-1">
                        <ImdButton size="sm" variant="ghost" title="طباعة الإذن" onClick={() => void printFuelTransfer(r)}>
                          <Printer className="w-3.5 h-3.5" />
                        </ImdButton>
                        <ImdButton size="sm" variant="ghost" title="عكس التحويل" onClick={() => handleReverseTransfer(r)}>
                          <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--imd-warn)]" />
                        </ImdButton>
                      </div>
                    ),
                  },
                ]}
                rows={db.fuel_transfers}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}

          {logKind === 'openings' && (
            <ImdPanel title="سجل الأرصدة الافتتاحية للمحروقات">
              <ImdTable
                columns={[
                  { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.asOfDate },
                  { key: 'wh', header: 'المحطة / الخزان', render: (r) => <strong>{r.warehouse}</strong> },
                  { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                  { key: 'q', header: 'الكمية (لتر)', numeric: true, render: (r) => <strong>{fmt(r.liters, 0)} لتر</strong> },
                  { key: 'n', header: 'البيان', render: (r) => r.note || '—' },
                  {
                    key: 'act',
                    header: 'حذف',
                    render: (r) => (
                      <ImdButton size="sm" variant="ghost" title="حذف الرصيد الافتتاحي" onClick={() => handleDeleteOpening(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    ),
                  },
                ]}
                rows={db.fuel_openings}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}
        </div>
      )}
    </ImdPage>
  );
};

export const FuelAllocationsScreen: React.FC = () => {
  const { db, currentUser, upsertRow, deleteRow, nextDocRef, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const settings = db.fuel_settings_rows[0];
  const [unitId, setUnitId] = useState(db.fuel_units[0]?.id ?? '');
  const [fuelType, setFuelType] = useState<FuelType>('diesel');
  const [periodType, setPeriodType] = useState<FuelPeriodType>('weekly');
  const [qtyPerPeriod, setQtyPerPeriod] = useState('500');

  // Edit Allocation modal state
  const [editingAlloc, setEditingAlloc] = useState<FuelAllocation | null>(null);
  const [editQty, setEditQty] = useState('500');
  const [editPeriod, setEditPeriod] = useState<FuelPeriodType>('weekly');
  const [editFuel, setEditFuel] = useState<FuelType>('diesel');
  const [editLocation, setEditLocation] = useState('');

  const computed = useMemo(
    () => db.fuel_allocations.map((a) => computeAllocationBalance(a, db.fuel_issues, settings, todayIso())),
    [db.fuel_allocations, db.fuel_issues, settings]
  );

  const handleAddAllocation = () => {
    const unit = db.fuel_units.find((u) => u.id === unitId);
    const qty = Math.max(0, Number(qtyPerPeriod) || 0);
    if (!unit || qty <= 0) return;
    const refNo = nextDocRef('fuelAlloc');
    const now = new Date().toISOString();
    const alloc: FuelAllocation = {
      id: Ids.next('fal'),
      refNo,
      unitId: unit.id,
      unitName: unit.name,
      fuelType,
      periodType,
      quantityPerPeriod: qty,
      totalQuantity: qty * 4,
      weeklyLiters: periodType === 'weekly' ? qty : periodType === 'daily' ? qty * 7 : Math.round(qty / 4),
      monthlyLiters: periodType === 'monthly' ? qty : periodType === 'weekly' ? qty * 4 : qty * 30,
      issueLocation: db.fuel_warehouses[0]?.name ?? '',
      startDate: `${todayIso().slice(0, 7)}-01`,
      endDate: `${todayIso().slice(0, 7)}-28`,
      active: true,
      disbursable: true,
      writtenOffLiters: 0,
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('fuel_allocations', alloc);
    logAudit({
      action: 'CREATE_FUEL_ALLOCATION',
      entityType: 'fuel_allocations',
      summary: `اعتماد تفريدة محروقات ${refNo} لـ ${unit.name} (${qty} لتر/${periodType})`,
      refNo,
      qty,
    });
    notify(`تم اعتماد التفريدة الدورية ${refNo}`, 'success');
  };

  const handleOpenEdit = (a: FuelAllocation) => {
    setEditingAlloc(a);
    setEditQty(String(a.quantityPerPeriod));
    setEditPeriod(a.periodType);
    setEditFuel(a.fuelType);
    setEditLocation(a.issueLocation);
  };

  const handleConfirmEdit = () => {
    if (!editingAlloc) return;
    const qty = Math.max(1, Number(editQty) || 0);
    upsertRow('fuel_allocations', {
      ...editingAlloc,
      fuelType: editFuel,
      periodType: editPeriod,
      quantityPerPeriod: qty,
      totalQuantity: qty * 4,
      weeklyLiters: editPeriod === 'weekly' ? qty : editPeriod === 'daily' ? qty * 7 : Math.round(qty / 4),
      monthlyLiters: editPeriod === 'monthly' ? qty : editPeriod === 'weekly' ? qty * 4 : qty * 30,
      issueLocation: editLocation || editingAlloc.issueLocation,
      updatedAt: new Date().toISOString(),
    });
    logAudit({
      action: 'UPDATE_FUEL_ALLOCATION',
      entityType: 'fuel_allocations',
      summary: `تعديل تفريدة ${editingAlloc.refNo} (${editingAlloc.unitName}) إلى ${qty} لتر/${editPeriod}`,
      refNo: editingAlloc.refNo,
      qty,
    });
    notify(`تم تحديث التفريدة ${editingAlloc.refNo}`, 'success');
    setEditingAlloc(null);
  };

  const handleToggleActive = (a: FuelAllocation) => {
    upsertRow('fuel_allocations', {
      ...a,
      active: !a.active,
      disbursable: !a.active,
      updatedAt: new Date().toISOString(),
    });
    notify(a.active ? `تم إيقاف تفريدة ${a.unitName}` : `تم تفعيل تفريدة ${a.unitName}`, 'info');
  };

  const handleDeleteAllocation = (a: FuelAllocation) => {
    deleteRow('fuel_allocations', a.id);
    logAudit({
      action: 'DELETE_FUEL_ALLOCATION',
      entityType: 'fuel_allocations',
      summary: `حذف تفريدة المحروقات ${a.refNo} (${a.unitName})`,
      risk: 'sensitive',
      refNo: a.refNo,
    });
    notify(`تم حذف تفريدة ${a.unitName}`, 'warn');
  };

  const handleWriteOff = (alloc: FuelAllocation, remaining: number) => {
    if (remaining <= 0) return;
    upsertRow('fuel_allocations', {
      ...alloc,
      writtenOffLiters: alloc.writtenOffLiters + remaining,
      updatedAt: new Date().toISOString(),
    });
    logAudit({
      action: 'FUEL_ALLOCATION_WRITEOFF',
      entityType: 'fuel_allocations',
      summary: `تصفير وإسقاط متبقي (${remaining} لتر) من تفريدة ${alloc.refNo}`,
      refNo: alloc.refNo,
      qty: remaining,
    });
    notify(`تم تصفير وإسقاط المتبقي (${fmt(remaining, 0)} لتر) من تفريدة ${alloc.unitName}`, 'warn');
  };

  const handlePrintPlan = () => {
    openPrintPreview({
      formKey: 'fuel_allocations_plan',
      space: 'fuel',
      title: 'خطة تفريدة ومخصصات المحروقات للوحدات',
      refNo: `FPLN-${todayIso().replace(/-/g, '')}`,
      date: todayIso(),
      warehouse: 'كافة محطات المحروقات',
      partyLabel: 'سقف التراكم',
      partyValue: `${settings?.carryCapPeriods ?? 4} فترات`,
      opType: 'خطة تفريدات المحروقات',
      columns: ['المرجع', 'الوحدة', 'الوقود', 'الدورة', 'المخصص', 'المستحق', 'المصروف', 'المتبقي', 'الحالة'],
      rows: computed.map((r) => [
        r.allocation.refNo,
        r.allocation.unitName,
        r.allocation.fuelType === 'petrol' ? 'بترول' : 'ديزل',
        r.allocation.periodType === 'daily' ? 'يومي' : r.allocation.periodType === 'weekly' ? 'أسبوعي' : 'شهري',
        `${fmt(r.allocation.quantityPerPeriod, 0)} لتر`,
        `${fmt(r.grossEntitled, 0)} لتر`,
        `${fmt(r.issuedSoFar, 0)} لتر`,
        `${fmt(r.remainingBalance, 0)} لتر`,
        r.allocation.active ? 'نشطة' : 'موقوفة',
      ]),
      totalQty: computed.reduce((s, r) => s + r.remainingBalance, 0),
      actorName: currentUser?.name ?? '',
    });
  };

  return (
    <ImdPage
      title="تفريدة المحروقات والمخصصات الدورية"
      subtitle={`سقف التراكم المعتمد: ${settings?.carryCapPeriods ?? 4} فترات`}
      actions={
        <ImdButton variant="secondary" onClick={handlePrintPlan}>
          <Printer className="w-4 h-4" />
          <span>طباعة خطة التفريدات</span>
        </ImdButton>
      }
    >
      <ImdPanel title="إضافة تفريدة دورية جديدة">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <ImdSelect label="الوحدة" value={unitId} onChange={setUnitId} options={db.fuel_units.map((u) => ({ value: u.id, label: u.name }))} />
          <ImdSelect label="نوع الوقود" value={fuelType} onChange={(v) => setFuelType(v as FuelType)} options={[{ value: 'diesel', label: 'ديزل' }, { value: 'petrol', label: 'بترول' }]} />
          <ImdSelect
            label="الدورة"
            value={periodType}
            onChange={(v) => setPeriodType(v as FuelPeriodType)}
            options={[
              { value: 'daily', label: 'يومي' },
              { value: 'weekly', label: 'أسبوعي' },
              { value: 'monthly', label: 'شهري' },
            ]}
          />
          <ImdFld label="المخصص لكل فترة (لتر)" type="number" value={qtyPerPeriod} onChange={setQtyPerPeriod} />
          <ImdButton variant="primary" onClick={handleAddAllocation}>
            <Plus className="w-4 h-4" />
            <span>حفظ التفريدة</span>
          </ImdButton>
        </div>
      </ImdPanel>

      <ImdPanel title="متابعة أرصدة التفريدات">
        <ImdTable
          columns={[
            { key: 'ref', header: 'المرجع', render: (r) => <span className="font-mono-num">{r.allocation.refNo}</span> },
            { key: 'u', header: 'الوحدة', render: (r) => r.allocation.unitName },
            { key: 'f', header: 'الوقود', render: (r) => (r.allocation.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
            { key: 'p', header: 'الدورة', render: (r) => `${fmt(r.allocation.quantityPerPeriod, 0)} / ${r.allocation.periodType}` },
            { key: 'g', header: 'المستحق التراكمي', numeric: true, render: (r) => `${fmt(r.grossEntitled, 0)} لتر` },
            { key: 'i', header: 'المصروف', numeric: true, render: (r) => `${fmt(r.issuedSoFar, 0)} لتر` },
            { key: 'r', header: 'المتبقي المتاح', numeric: true, render: (r) => <strong className="text-[var(--imd-accent)]">{fmt(r.remainingBalance, 0)} لتر</strong> },
            {
              key: 'st',
              header: 'الحالة',
              render: (r) => (
                <ImdStatusText
                  label={r.allocation.active ? 'نشطة' : 'موقوفة'}
                  tone={r.allocation.active ? 'success' : 'warn'}
                />
              ),
            },
            {
              key: 'act',
              header: 'الإجراءات',
              render: (r) => (
                <div className="flex items-center gap-1">
                  <ImdButton size="sm" variant="ghost" title="تعديل التفريدة" onClick={() => handleOpenEdit(r.allocation)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </ImdButton>
                  <ImdButton
                    size="sm"
                    variant="ghost"
                    title={r.allocation.active ? 'إيقاف التفريدة' : 'تفعيل التفريدة'}
                    onClick={() => handleToggleActive(r.allocation)}
                  >
                    <Power className={`w-3.5 h-3.5 ${r.allocation.active ? 'text-[var(--imd-warn)]' : 'text-[var(--imd-success)]'}`} />
                  </ImdButton>
                  {r.remainingBalance > 0 && (
                    <ImdButton size="sm" variant="ghost" title="تصفير المتبقي" onClick={() => handleWriteOff(r.allocation, r.remainingBalance)}>
                      <RotateCcw className="w-3.5 h-3.5" />
                    </ImdButton>
                  )}
                  <ImdButton size="sm" variant="ghost" title="حذف التفريدة" onClick={() => handleDeleteAllocation(r.allocation)}>
                    <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                  </ImdButton>
                </div>
              ),
            },
          ]}
          rows={computed}
          rowKey={(r) => r.allocation.id}
        />
      </ImdPanel>

      <ImdModal
        open={Boolean(editingAlloc)}
        onClose={() => setEditingAlloc(null)}
        title={`تعديل تفريدة المحروقات — ${editingAlloc?.unitName ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditingAlloc(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleConfirmEdit}>حفظ التعديل</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdSelect
            label="نوع الوقود"
            value={editFuel}
            onChange={(v) => setEditFuel(v as FuelType)}
            options={[
              { value: 'diesel', label: 'ديزل' },
              { value: 'petrol', label: 'بترول' },
            ]}
          />
          <ImdSelect
            label="الدورة"
            value={editPeriod}
            onChange={(v) => setEditPeriod(v as FuelPeriodType)}
            options={[
              { value: 'daily', label: 'يومي' },
              { value: 'weekly', label: 'أسبوعي' },
              { value: 'monthly', label: 'شهري' },
            ]}
          />
          <ImdFld label="المخصص لكل فترة (لتر)" type="number" value={editQty} onChange={setEditQty} />
          <ImdSelect
            label="محطة الصرف المعتمدة"
            value={editLocation}
            onChange={setEditLocation}
            options={db.fuel_warehouses.map((w) => ({ value: w.name, label: w.name }))}
          />
        </div>
      </ImdModal>
    </ImdPage>
  );
};

export const FuelStocktakeScreen: React.FC = () => {
  const { db, currentUser, fuelTanks, navIntent, clearNavIntent, mutateDb, upsertRow, deleteRow, nextDocRef, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const [tab, setTab] = useState<'sessions' | 'readings' | 'maintenance'>('sessions');
  const [whName, setWhName] = useState(db.fuel_warehouses[0]?.name ?? '');
  const [selectedId, setSelectedId] = useState(db.fuel_stocktakes[0]?.id ?? '');

  // Dipstick reading form state
  const [rdWh, setRdWh] = useState(db.fuel_warehouses[0]?.name ?? '');
  const [rdFuel, setRdFuel] = useState<FuelType>('diesel');
  const [rdDate, setRdDate] = useState(todayIso());
  const [rdCm, setRdCm] = useState('185.0');
  const [rdMeasured, setRdMeasured] = useState('');
  const [rdTemp, setRdTemp] = useState('30');
  const [rdReader, setRdReader] = useState(currentUser?.name ?? 'الرقيب / علي السعدي');
  const [rdNotes, setRdNotes] = useState('');

  // Maintenance form state
  const [mntWh, setMntWh] = useState(db.fuel_warehouses[0]?.name ?? '');
  const [mntFuel, setMntFuel] = useState<FuelType | 'all'>('diesel');
  const [mntDate, setMntDate] = useState(todayIso());
  const [mntType, setMntType] = useState<FuelMaintenance['maintType']>('filter_replacement');
  const [mntStatus, setMntStatus] = useState<FuelMaintenance['status']>('scheduled');
  const [mntCost, setMntCost] = useState('1500');
  const [mntTech, setMntTech] = useState('');
  const [mntSummary, setMntSummary] = useState('');
  const [mntNextDue, setMntNextDue] = useState(todayIso());

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'fuelStocktake') return;
    if (navIntent.subTab === 'readings' || navIntent.subTab === 'maintenance' || navIntent.subTab === 'sessions') {
      setTab(navIntent.subTab);
    }
    if (navIntent.focusId) {
      setSelectedId(navIntent.focusId);
    } else if (navIntent.prefillWarehouse) {
      const match = db.fuel_stocktakes.find((s) => s.warehouse === navIntent.prefillWarehouse);
      if (match) setSelectedId(match.id);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent, db.fuel_stocktakes]);

  const active = db.fuel_stocktakes.find((s) => s.id === selectedId) ?? db.fuel_stocktakes[0];
  const lines = db.fuel_stocktake_lines.filter((l) => l.stocktakeId === active?.id);

  const summaryTotals = useMemo(() => {
    const bookTotal = lines.reduce((s, l) => s + l.bookLiters, 0);
    const countedTotal = lines.reduce((s, l) => s + (l.counted ? l.countedLiters : 0), 0);
    const varianceTotal = lines.reduce((s, l) => s + (l.counted ? l.countedLiters - l.bookLiters : 0), 0);
    return { bookTotal, countedTotal, varianceTotal };
  }, [lines]);

  const currentTankForReading = fuelTanks.find((t) => t.warehouseName === rdWh);
  const currentBookForReading =
    rdFuel === 'petrol' ? currentTankForReading?.petrol ?? 0 : currentTankForReading?.diesel ?? 0;

  const handleSaveDipstickReading = () => {
    const measured = Number(rdMeasured);
    if (!rdWh || !Number.isFinite(measured) || measured < 0) {
      notify('يرجى إدخال القياس الفعلي باللتر بشكل صحيح', 'warn');
      return;
    }
    const whObj = db.fuel_warehouses.find((w) => w.name === rdWh);
    const now = new Date().toISOString();
    const variance = Math.round((measured - currentBookForReading) * 100) / 100;
    const reading: FuelTankReading = {
      id: Ids.next('ftrd'),
      warehouseId: whObj?.id ?? 'fwh_1',
      warehouse: rdWh,
      fuelType: rdFuel,
      readingDate: rdDate,
      dipstickCm: Number(rdCm) || 0,
      measuredLiters: measured,
      bookLiters: currentBookForReading,
      varianceLiters: variance,
      temperatureC: Number(rdTemp) || 25,
      readerName: rdReader.trim() || (currentUser?.name ?? 'أمين المحطة'),
      notes: rdNotes.trim(),
      createdBy: currentUser?.name ?? 'fuel',
      createdAt: now,
    };
    const fuelLog: FuelAuditLog = {
      id: Ids.next('faud'),
      action: 'TANK_DIPSTICK_READING',
      warehouse: rdWh,
      fuelType: rdFuel,
      refNo: reading.id,
      liters: measured,
      summary: `قراءة المسطرة (${reading.dipstickCm} سم = ${fmt(measured, 0)} لتر | الفارق: ${variance} لتر)`,
      actorName: reading.readerName,
      createdAt: now,
    };
    upsertRow('fuel_tank_readings', reading);
    upsertRow('fuel_audit_logs', fuelLog);
    logAudit({
      action: 'TANK_DIPSTICK_READING',
      entityType: 'fuel_tank_readings',
      summary: fuelLog.summary,
      warehouse: rdWh,
      qty: measured,
    });
    setRdMeasured('');
    setRdNotes('');
    notify('تم حفظ قراءة المسطرة اليومية للخزان بنجاح', 'success');
  };

  const handleSaveMaintenance = () => {
    if (!mntWh || !mntSummary.trim()) {
      notify('يرجى إدخال بيان أعمال الصيانة المنفذة أو المجدولة', 'warn');
      return;
    }
    const whObj = db.fuel_warehouses.find((w) => w.name === mntWh);
    const now = new Date().toISOString();
    const refNo = `صم-${db.config.deviceId.slice(0, 6)}-${String((db.fuel_maintenances?.length ?? 0) + 1).padStart(6, '0')}`;
    const rec: FuelMaintenance = {
      id: Ids.next('fmnt'),
      refNo,
      warehouseId: whObj?.id ?? 'fwh_1',
      warehouse: mntWh,
      fuelType: mntFuel,
      maintDate: mntDate,
      maintType: mntType,
      status: mntStatus,
      costSar: Number(mntCost) || 0,
      technicianName: mntTech.trim() || 'فريق الصيانة الفنية',
      summary: mntSummary.trim(),
      nextDueDate: mntNextDue,
      notes: '',
      createdBy: currentUser?.name ?? 'fuel',
      createdAt: now,
      updatedAt: now,
    };
    const fuelLog: FuelAuditLog = {
      id: Ids.next('faud'),
      action: 'STATION_MAINTENANCE',
      warehouse: mntWh,
      fuelType: mntFuel,
      refNo,
      liters: 0,
      summary: `تسجيل صيانة محروقات (${mntSummary.trim()})`,
      actorName: currentUser?.name ?? 'مسؤول المحروقات',
      createdAt: now,
    };
    upsertRow('fuel_maintenances', rec);
    upsertRow('fuel_audit_logs', fuelLog);
    logAudit({
      action: 'CREATE_FUEL_MAINTENANCE',
      entityType: 'fuel_maintenances',
      summary: fuelLog.summary,
      refNo,
      warehouse: mntWh,
    });
    setMntSummary('');
    notify(`تم حفظ سجل الصيانة ${refNo}`, 'success');
  };

  const handleNewFuelStocktake = () => {
    const refNo = nextDocRef('fuelStocktake');
    const id = Ids.next('fstk');
    const tank = fuelTanks.find((t) => t.warehouseName === whName);
    const now = new Date().toISOString();
    const st: FuelStocktake = {
      id,
      refNo,
      date: todayIso(),
      warehouse: whName,
      kind: 'full',
      fuelFilter: 'all',
      committee: currentUser?.name ?? '',
      status: 'counting',
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    const newLines = [
      { id: Ids.next('fstkl'), stocktakeId: id, fuelType: 'petrol' as FuelType, bookLiters: tank?.petrol ?? 0, counted: false, countedLiters: 0 },
      { id: Ids.next('fstkl'), stocktakeId: id, fuelType: 'diesel' as FuelType, bookLiters: tank?.diesel ?? 0, counted: false, countedLiters: 0 },
    ];
    mutateDb((prev) => ({
      ...prev,
      fuel_stocktakes: [st, ...prev.fuel_stocktakes],
      fuel_stocktake_lines: [...newLines, ...prev.fuel_stocktake_lines],
    }));
    setSelectedId(id);
    logAudit({
      action: 'CREATE_FUEL_STOCKTAKE',
      entityType: 'fuel_stocktakes',
      summary: `فتح جلسة جرد محروقات ${refNo} في ${whName}`,
      refNo,
      warehouse: whName,
    });
    notify(`تم فتح جرد المحروقات ${refNo}`, 'success');
  };

  const advanceStage = () => {
    if (!active) return;
    const nextStatus =
      active.status === 'open'
        ? 'counting'
        : active.status === 'counting'
        ? 'analysis'
        : 'posted';

    if (nextStatus === 'posted') {
      const now = new Date().toISOString();
      const adjSupplies: FuelSupply[] = [];
      const adjIssues: FuelIssue[] = [];

      for (const ln of lines) {
        if (!ln.counted) continue;
        const diff = Math.round((ln.countedLiters - ln.bookLiters) * 100) / 100;
        if (diff > 0) {
          adjSupplies.push({
            id: Ids.next('fsup'),
            refNo: `${active.refNo}-ADJ`,
            date: todayIso(),
            fuelType: ln.fuelType,
            quantityLiters: diff,
            supplierName: `فائض تسوية جرد ${active.refNo}`,
            warehouse: active.warehouse,
            transportVehicleType: '',
            driverName: '',
            notes: `تسوية جرد محروقات #${active.refNo}`,
            createdBy: currentUser?.name ?? '',
            createdAt: now,
          });
        } else if (diff < 0) {
          adjIssues.push({
            id: Ids.next('fiss'),
            refNo: `${active.refNo}-ADJ`,
            date: todayIso(),
            fuelType: ln.fuelType,
            warehouse: active.warehouse,
            source: 'exceptional',
            quantityLiters: Math.abs(diff),
            driverName: '',
            vehicleType: '',
            chassisNo: '',
            allocationId: '',
            beneficiaryUnitId: '',
            beneficiaryName: `عجز تسوية جرد ${active.refNo}`,
            entitledLiters: 0,
            periodType: 'daily',
            customFrom: '',
            customTo: '',
            justification: `عجز جرد فعلي جلسة ${active.refNo}`,
            orderAuthority: '',
            purpose: 'تسوية جرد محروقات',
            notes: `تسوية جرد محروقات #${active.refNo}`,
            createdBy: currentUser?.name ?? '',
            createdAt: now,
          });
        }
      }

      mutateDb((prev) => ({
        ...prev,
        fuel_supplies: [...adjSupplies, ...prev.fuel_supplies],
        fuel_issues: [...adjIssues, ...prev.fuel_issues],
        fuel_stocktakes: prev.fuel_stocktakes.map((s) =>
          s.id === active.id ? { ...s, status: 'posted', updatedAt: now } : s
        ),
      }));
      logAudit({
        action: 'POST_FUEL_STOCKTAKE',
        entityType: 'fuel_stocktakes',
        summary: `إقفال وترحيل جرد المحروقات ${active.refNo} في ${active.warehouse} (فارق: ${summaryTotals.varianceTotal} لتر)`,
        risk: 'high',
        refNo: active.refNo,
        warehouse: active.warehouse,
      });
      notify(`تم إقفال وترحيل جرد المحروقات ${active.refNo} وتحديث الأرصدة`, 'success');
      return;
    }

    mutateDb((prev) => ({
      ...prev,
      fuel_stocktakes: prev.fuel_stocktakes.map((s) =>
        s.id === active.id ? { ...s, status: nextStatus, updatedAt: new Date().toISOString() } : s
      ),
    }));
    notify(`تمت ترقية الجرد إلى مرحلة (${nextStatus})`, 'success');
  };

  const openCount = db.fuel_stocktakes.filter((t) => t.status !== 'posted').length;
  const readings = db.fuel_tank_readings ?? [];
  const maintenances = db.fuel_maintenances ?? [];

  const MAINT_TYPE_LABELS: Record<FuelMaintenance['maintType'], string> = {
    tank_cleaning: 'تنظيف خزان وإزالة رواسب',
    pump_calibration: 'معايرة عدادات وطرمبات الضخ',
    filter_replacement: 'استبدال فلاتر ومصافي الوقود',
    leak_inspection: 'فحص التسربات والأنابيب',
    valve_repair: 'صيانة صمامات الأمان والتهوية',
  };

  return (
    <ImdPage
      title="جرد المحروقات، قراءات المسطرة، وصيانة الخزانات"
      subtitle="جرد فعلي بـ 4 مراحل · سجل قراءات المسطرة اليومية · صيانة الخزانات والطرمبات"
      actions={
        <div className="flex items-center gap-2">
          <ImdSelect value={whName} onChange={setWhName} options={db.fuel_warehouses.map((w) => ({ value: w.name, label: w.name }))} />
          <ImdButton variant="primary" onClick={handleNewFuelStocktake}>فتح جرد محروقات</ImdButton>
        </div>
      }
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as 'sessions' | 'readings' | 'maintenance')}
        tabs={[
          { id: 'sessions', label: 'جلسات الجرد الفعلي (4 مراحل)', count: db.fuel_stocktakes.length },
          { id: 'readings', label: 'قراءات المسطرة اليومية', count: readings.length },
          { id: 'maintenance', label: 'صيانة الخزانات والطرمبات', count: maintenances.length },
        ]}
      />

      {tab === 'sessions' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-[var(--imd-line)] bg-[var(--imd-surface)] p-3" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <div className="text-xs text-[var(--imd-muted)]">إجمالي أوامر الجرد</div>
              <div className="text-lg font-bold mt-0.5 tabular-nums">{fmt(db.fuel_stocktakes.length, 0)}</div>
            </div>
            <div className="border border-[var(--imd-line)] bg-[var(--imd-surface)] p-3" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <div className="text-xs text-[var(--imd-muted)]">قيد التنفيذ</div>
              <div className="text-lg font-bold mt-0.5 tabular-nums text-[var(--imd-warn)]">{fmt(openCount, 0)}</div>
            </div>
            <div className="border border-[var(--imd-line)] bg-[var(--imd-surface)] p-3" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <div className="text-xs text-[var(--imd-muted)]">الجلسات المرحّلة</div>
              <div className="text-lg font-bold mt-0.5 tabular-nums text-[var(--imd-success)]">{fmt(db.fuel_stocktakes.length - openCount, 0)}</div>
            </div>
          </div>

          <ImdPanel title="جلسات جرد المحروقات">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {db.fuel_stocktakes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`px-3 py-1.5 text-xs border cursor-pointer transition-colors ${
                    s.id === active?.id
                      ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-bold'
                      : 'border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-[var(--imd-text2)]'
                  }`}
                  style={{ borderRadius: 'var(--imd-radius-sm)' }}
                >
                  {s.refNo} · {s.warehouse} · {s.date} ·{' '}
                  {s.status === 'posted' ? 'مرحّل' : s.status === 'analysis' ? 'تحليل' : s.status === 'counting' ? 'عدّ فعلي' : 'مفتوح'}
                </button>
              ))}
            </div>

            {active && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--imd-line)] text-xs">
                  <div className="flex flex-wrap items-center gap-4 tabular-nums">
                    <span>الجلسة: <strong className="font-mono-num">{active.refNo}</strong> — <strong>{active.warehouse}</strong></span>
                    <span>الدفتري: <strong>{fmt(summaryTotals.bookTotal, 0)} لتر</strong></span>
                    <span>الفعلي: <strong>{fmt(summaryTotals.countedTotal, 0)} لتر</strong></span>
                    <span>
                      صافي الفارق:{' '}
                      <strong style={{ color: summaryTotals.varianceTotal < 0 ? 'var(--imd-danger)' : 'var(--imd-success)' }}>
                        {summaryTotals.varianceTotal > 0 ? `+${fmt(summaryTotals.varianceTotal, 0)}` : fmt(summaryTotals.varianceTotal, 0)} لتر
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ImdButton
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        openPrintPreview({
                          formKey: 'fuel_stocktake',
                          space: 'fuel',
                          title: 'محضر جرد المحروقات والخزانات',
                          refNo: active.refNo,
                          date: active.date,
                          warehouse: active.warehouse,
                          partyLabel: 'لجنة الجرد',
                          partyValue: active.committee || '—',
                          opType: 'جرد محروقات',
                          columns: ['نوع الوقود', 'الدفتري (لتر)', 'القياس الفعلي (لتر)', 'الفرق (لتر)'],
                          rows: lines.map((l) => [
                            l.fuelType === 'petrol' ? 'بترول' : 'ديزل',
                            fmt(l.bookLiters, 0),
                            l.counted ? fmt(l.countedLiters, 0) : '—',
                            l.counted ? fmt(l.countedLiters - l.bookLiters, 0) : '—',
                          ]),
                          totalQty: summaryTotals.countedTotal,
                          actorName: currentUser?.name ?? '',
                        })
                      }
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة المحضر</span>
                    </ImdButton>
                    {active.status !== 'posted' && (
                      <ImdButton size="sm" variant="primary" onClick={advanceStage}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {active.status === 'analysis' ? 'إقفال وترحيل الفروقات' : `الانتقال للمرحلة التالية (${active.status})`}
                        </span>
                      </ImdButton>
                    )}
                  </div>
                </div>

                <ImdTable
                  columns={[
                    { key: 'ft', header: 'نوع الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                    { key: 'bk', header: 'الرصيد الدفتري (لتر)', numeric: true, render: (r) => fmt(r.bookLiters, 0) },
                    {
                      key: 'cnt',
                      header: 'القياس الفعلي (لتر)',
                      render: (r) =>
                        active.status !== 'posted' ? (
                          <input
                            type="number"
                            value={r.counted ? r.countedLiters : ''}
                            onChange={(e) => {
                              const v = Number(e.target.value) || 0;
                              mutateDb((prev) => ({
                                ...prev,
                                fuel_stocktake_lines: prev.fuel_stocktake_lines.map((l) =>
                                  l.id === r.id ? { ...l, counted: true, countedLiters: v } : l
                                ),
                              }));
                            }}
                            className="w-28 h-8 px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] tabular-nums"
                          />
                        ) : (
                          fmt(r.countedLiters, 0)
                        ),
                    },
                    {
                      key: 'var',
                      header: 'الفرق',
                      numeric: true,
                      render: (r) => {
                        if (!r.counted) return '—';
                        const diff = r.countedLiters - r.bookLiters;
                        return (
                          <strong style={{ color: diff < 0 ? 'var(--imd-danger)' : diff > 0 ? 'var(--imd-info)' : 'var(--imd-success)' }}>
                            {diff > 0 ? `+${fmt(diff, 0)}` : fmt(diff, 0)} لتر
                          </strong>
                        );
                      },
                    },
                  ]}
                  rows={lines}
                  rowKey={(r) => r.id}
                />
              </div>
            )}
          </ImdPanel>
        </>
      )}

      {tab === 'readings' && (
        <div className="space-y-4">
          <ImdPanel
            title="تسجيل قراءة مسطرة الخزان اليومية (Dipstick Reading)"
            subtitle="مقارنة القياس الفعلي بالمسطرة (سم / لتر) مع الرصيد الدفتري الفوري ورصد التبخر أو التسرب"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <ImdSelect
                label="محطة / خزان الوقود"
                value={rdWh}
                onChange={setRdWh}
                options={db.fuel_warehouses.map((w) => ({ value: w.name, label: w.name }))}
              />
              <ImdSelect
                label="نوع الوقود"
                value={rdFuel}
                onChange={(v) => setRdFuel(v as FuelType)}
                options={[
                  { value: 'diesel', label: 'ديزل (Diesel)' },
                  { value: 'petrol', label: 'بترول (Petrol)' },
                ]}
              />
              <ImdFld label="تاريخ القراءة" type="date" value={rdDate} onChange={setRdDate} />
              <ImdFld
                label="ارتفاع مستوى الوقود بالمسطرة (سم)"
                type="number"
                value={rdCm}
                onChange={setRdCm}
                placeholder="مثال: 185.5"
              />
              <ImdFld
                label={`الكمية المقاسة فعلياً (لتر) — الدفتري: ${fmt(currentBookForReading, 0)}`}
                type="number"
                value={rdMeasured}
                onChange={setRdMeasured}
                placeholder={String(currentBookForReading)}
              />
              <ImdFld
                label="درجة حرارة الخزان (°C)"
                type="number"
                value={rdTemp}
                onChange={setRdTemp}
              />
              <ImdFld
                label="القائم بالقياس"
                value={rdReader}
                onChange={setRdReader}
              />
              <ImdFld
                label="ملاحظات الفحص (تبخر / مطابقة)"
                value={rdNotes}
                onChange={setRdNotes}
                placeholder="ملاحظات..."
              />
            </div>
            <div className="mt-3 flex justify-end">
              <ImdButton variant="primary" onClick={handleSaveDipstickReading}>
                <Plus className="w-4 h-4" />
                <span>اعتماد وحفظ قراءة المسطرة</span>
              </ImdButton>
            </div>
          </ImdPanel>

          <ImdPanel title="سجل قراءات المسطرة اليومية للخزانات">
            <ImdTable
              columns={[
                { key: 'date', header: 'التاريخ', render: (r) => r.readingDate },
                { key: 'wh', header: 'الخزان / المحطة', render: (r) => r.warehouse },
                { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                { key: 'cm', header: 'المسطرة (سم)', numeric: true, render: (r) => `${fmt(r.dipstickCm, 1)} سم` },
                { key: 'temp', header: 'الحرارة', numeric: true, render: (r) => `${r.temperatureC}°C` },
                { key: 'book', header: 'الدفتري (لتر)', numeric: true, render: (r) => fmt(r.bookLiters, 0) },
                { key: 'meas', header: 'المقاس (لتر)', numeric: true, render: (r) => <strong>{fmt(r.measuredLiters, 0)}</strong> },
                {
                  key: 'var',
                  header: 'الفرق (لتر)',
                  numeric: true,
                  render: (r) => (
                    <strong
                      style={{
                        color:
                          r.varianceLiters < 0
                            ? 'var(--imd-danger)'
                            : r.varianceLiters > 0
                            ? 'var(--imd-info)'
                            : 'var(--imd-success)',
                      }}
                    >
                      {r.varianceLiters > 0 ? `+${fmt(r.varianceLiters, 0)}` : fmt(r.varianceLiters, 0)}
                    </strong>
                  ),
                },
                { key: 'reader', header: 'القائم بالقياس', render: (r) => r.readerName },
                { key: 'notes', header: 'ملاحظات', render: (r) => r.notes || '—' },
                {
                  key: 'del',
                  header: '',
                  width: '44px',
                  render: (r) => (
                    <button
                      type="button"
                      onClick={() => deleteRow('fuel_tank_readings', r.id)}
                      className="p-1 text-[var(--imd-muted)] hover:text-[var(--imd-danger)]"
                      title="حذف القراءة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ),
                },
              ]}
              rows={readings}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="space-y-4">
          <ImdPanel
            title="تسجيل أمر صيانة خزانات وطرمبات الوقود"
            subtitle="توثيق تنظيف الخزانات، معايرة العدادات، استبدال الفلاتر، وفحوصات التسرب"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <ImdSelect
                label="المحطة / الخزان"
                value={mntWh}
                onChange={setMntWh}
                options={db.fuel_warehouses.map((w) => ({ value: w.name, label: w.name }))}
              />
              <ImdSelect
                label="نوع الصيانة"
                value={mntType}
                onChange={(v) => setMntType(v as FuelMaintenance['maintType'])}
                options={[
                  { value: 'filter_replacement', label: 'استبدال فلاتر ومصافي الوقود' },
                  { value: 'pump_calibration', label: 'معايرة عدادات وطرمبات الضخ' },
                  { value: 'tank_cleaning', label: 'تنظيف خزان وإزالة رواسب' },
                  { value: 'leak_inspection', label: 'فحص التسربات والأنابيب' },
                  { value: 'valve_repair', label: 'صيانة صمامات الأمان والتهوية' },
                ]}
              />
              <ImdSelect
                label="نطاق الوقود"
                value={mntFuel}
                onChange={(v) => setMntFuel(v as FuelType | 'all')}
                options={[
                  { value: 'diesel', label: 'خزان الديزل' },
                  { value: 'petrol', label: 'خزان البترول' },
                  { value: 'all', label: 'شامل المحطة' },
                ]}
              />
              <ImdSelect
                label="حالة الصيانة"
                value={mntStatus}
                onChange={(v) => setMntStatus(v as FuelMaintenance['status'])}
                options={[
                  { value: 'scheduled', label: 'مجدولة' },
                  { value: 'in_progress', label: 'قيد التنفيذ' },
                  { value: 'completed', label: 'منجزة ومعتمدة' },
                ]}
              />
              <ImdFld label="تاريخ التنفيذ" type="date" value={mntDate} onChange={setMntDate} />
              <ImdFld label="تاريخ الصيانة الدورية القادمة" type="date" value={mntNextDue} onChange={setMntNextDue} />
              <ImdFld label="المهندس / الجهة المنفذة" value={mntTech} onChange={setMntTech} placeholder="اسم الفني أو الفريق" />
              <ImdFld label="التكلفة التقديرية/الفعلية (ر.س)" type="number" value={mntCost} onChange={setMntCost} />
              <div className="md:col-span-4">
                <ImdFld
                  label="بيان الأعمال المنفذة والتوصيات الفنية"
                  value={mntSummary}
                  onChange={setMntSummary}
                  placeholder="تفاصيل الفحص أو قطع الغيار المستبدلة..."
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <ImdButton variant="primary" onClick={handleSaveMaintenance}>
                <Plus className="w-4 h-4" />
                <span>حفظ سجل الصيانة</span>
              </ImdButton>
            </div>
          </ImdPanel>

          <ImdPanel title="سجل صيانة الخزانات والطرمبات الدورية">
            <ImdTable
              columns={[
                { key: 'ref', header: 'رقم الأمر', render: (r) => <span className="font-mono-num font-bold">{r.refNo}</span> },
                { key: 'date', header: 'التاريخ', render: (r) => r.maintDate },
                { key: 'wh', header: 'المحطة / الخزان', render: (r) => r.warehouse },
                { key: 'type', header: 'نوع الصيانة', render: (r) => MAINT_TYPE_LABELS[r.maintType] },
                { key: 'summary', header: 'الأعمال المنفذة', render: (r) => r.summary },
                { key: 'tech', header: 'المنفذ', render: (r) => r.technicianName },
                { key: 'cost', header: 'التكلفة (ر.س)', numeric: true, render: (r) => fmt(r.costSar, 0) },
                { key: 'next', header: 'الصيانة القادمة', render: (r) => r.nextDueDate || '—' },
                {
                  key: 'st',
                  header: 'الحالة',
                  render: (r) => (
                    <ImdStatusText
                      tone={r.status === 'completed' ? 'success' : r.status === 'in_progress' ? 'warn' : 'info'}
                      label={r.status === 'completed' ? 'منجزة' : r.status === 'in_progress' ? 'قيد التنفيذ' : 'مجدولة'}
                    />
                  ),
                },
                {
                  key: 'act',
                  header: 'إجراء',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      {r.status !== 'completed' && (
                        <ImdButton
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            upsertRow('fuel_maintenances', {
                              ...r,
                              status: 'completed',
                              updatedAt: new Date().toISOString(),
                            });
                            notify(`تم اعتماد إنجاز الصيانة ${r.refNo}`, 'success');
                          }}
                        >
                          إنجاز
                        </ImdButton>
                      )}
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          openPrintPreview({
                            formKey: 'fuel_maintenance',
                            space: 'fuel',
                            title: 'محضر صيانة خزانات وطرمبات المحروقات',
                            refNo: r.refNo,
                            date: r.maintDate,
                            warehouse: r.warehouse,
                            partyLabel: 'المنفذ الفني',
                            partyValue: r.technicianName,
                            opType: MAINT_TYPE_LABELS[r.maintType],
                            columns: ['البيان', 'التكلفة (ر.س)', 'الصيانة القادمة', 'الحالة'],
                            rows: [[r.summary, fmt(r.costSar, 0), r.nextDueDate, r.status === 'completed' ? 'منجزة' : 'مجدولة']],
                            totalQty: r.costSar,
                            actorName: currentUser?.name ?? '',
                          })
                        }
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={maintenances}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}
    </ImdPage>
  );
};

