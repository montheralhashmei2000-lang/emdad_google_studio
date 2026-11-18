// Fuel Workspace (Doors 5–7): FuelReportsScreen (6 tabs), FuelDataScreen (3 tabs including Vehicles by chassisNo), FuelSettingsScreen

import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Power, Printer, Save, Trash2 } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdFld,
  ImdModal,
  ImdPage,
  ImdPanel,
  ImdStatusText,
  ImdTabs,
} from '../../components/imd/primitives';
import { ImdTable } from '../../components/imd/ImdTable';
import { Ids } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import {
  computeAllocationBalance,
  computeFuelDailyReport,
  computeFuelVehicleReport,
} from '../../domain/fuelEngine';
import type { FuelUnit, FuelWarehouse } from '../../domain/types';

export const FuelReportsScreen: React.FC = () => {
  const { db, currentUser, fuelTanks, navIntent, clearNavIntent, openPrintPreview, fmt } = useEmdad();
  const [tab, setTab] = useState<'daily' | 'official' | 'consumption' | 'vehicles' | 'balances' | 'wh_stmt' | 'ent_vs_iss'>('daily');
  const [reportDate, setReportDate] = useState(todayIso());
  const [allocFuelFilter, setAllocFuelFilter] = useState<'all' | 'petrol' | 'diesel'>('all');
  const settings = db.fuel_settings_rows[0];

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'fuelReports') return;
    if (navIntent.subTab) {
      setTab(navIntent.subTab as typeof tab);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const allocStatus = useMemo(
    () => db.fuel_allocations.map((a) => computeAllocationBalance(a, db.fuel_issues, settings, todayIso())),
    [db.fuel_allocations, db.fuel_issues, settings]
  );

  const visibleAllocStatus = useMemo(
    () =>
      allocFuelFilter === 'all'
        ? allocStatus
        : allocStatus.filter((r) => r.allocation.fuelType === allocFuelFilter),
    [allocStatus, allocFuelFilter]
  );

  const dailySummary = useMemo(
    () =>
      computeFuelDailyReport({
        date: reportDate,
        supplies: db.fuel_supplies,
        issues: db.fuel_issues,
        transfers: db.fuel_transfers,
      }),
    [reportDate, db.fuel_supplies, db.fuel_issues, db.fuel_transfers]
  );

  const vehicleReport = useMemo(() => computeFuelVehicleReport(db.fuel_issues), [db.fuel_issues]);

  const unitConsumption = useMemo(() => {
    const map = new Map<string, { unit: string; petrol: number; diesel: number; count: number }>();
    for (const iss of db.fuel_issues) {
      const cur = map.get(iss.beneficiaryName) ?? { unit: iss.beneficiaryName, petrol: 0, diesel: 0, count: 0 };
      if (iss.fuelType === 'petrol') cur.petrol += iss.quantityLiters;
      else cur.diesel += iss.quantityLiters;
      cur.count += 1;
      map.set(iss.beneficiaryName, cur);
    }
    return Array.from(map.values());
  }, [db.fuel_issues]);

  return (
    <ImdPage
      title="تقارير قسم المحروقات"
      subtitle="الحركة اليومية · التقرير الرسمي · الاستهلاك · تقرير المركبات · أرصدة المحطات · كشف الحركة · الاستحقاق مقابل الصرف"
      actions={
        <ImdButton
          variant="primary"
          onClick={() =>
            openPrintPreview({
              formKey: 'fuel_official_report',
              space: 'fuel',
              title: 'التقرير الرسمي لموقف المحروقات',
              refNo: `FREP-${todayIso().replace(/-/g, '')}`,
              date: todayIso(),
              warehouse: 'كافة محطات المحروقات',
              partyLabel: 'القسم',
              partyValue: settings?.orgName ?? 'قسم المحروقات',
              opType: 'تقرير محروقات رسمي',
              columns: ['المحطة / الخزان', 'بترول (لتر)', 'ديزل (لتر)', 'الإجمالي', 'الإشغال %'],
              rows: fuelTanks.map((t) => [t.warehouseName, fmt(t.petrol, 0), fmt(t.diesel, 0), fmt(t.total, 0), `${fmt(t.occupancyPct, 1)}%`]),
              totalQty: fuelTanks.reduce((s, t) => s + t.total, 0),
              actorName: currentUser?.name ?? '',
            })
          }
        >
          <Printer className="w-4 h-4" />
          <span>طباعة التقرير الرسمي</span>
        </ImdButton>
      }
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as typeof tab)}
        tabs={[
          { id: 'daily', label: 'الحركة اليومية' },
          { id: 'official', label: 'التقرير الرسمي' },
          { id: 'consumption', label: 'الاستهلاك بالوحدات' },
          { id: 'vehicles', label: 'تقرير المركبات', count: vehicleReport.length },
          { id: 'balances', label: 'أرصدة المستودعات' },
          { id: 'wh_stmt', label: 'كشف حركة المستودع' },
          { id: 'ent_vs_iss', label: 'الاستحقاق مقابل الصرف' },
        ]}
      />

      {tab === 'daily' && (
        <div className="space-y-4">
          <ImdPanel
            title="ملخص الحركة اليومية (computeFuelDailyReport)"
            headerRight={
              <ImdFld label="" type="date" value={reportDate} onChange={setReportDate} className="w-40" />
            }
          >
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">توريد بترول</div>
                <div className="text-base font-bold mt-1 tabular-nums">{fmt(dailySummary.suppliedPetrol, 0)} لتر</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">توريد ديزل</div>
                <div className="text-base font-bold mt-1 tabular-nums">{fmt(dailySummary.suppliedDiesel, 0)} لتر</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">صرف بترول</div>
                <div className="text-base font-bold mt-1 tabular-nums">{fmt(dailySummary.issuedPetrol, 0)} لتر</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">صرف ديزل</div>
                <div className="text-base font-bold mt-1 tabular-nums">{fmt(dailySummary.issuedDiesel, 0)} لتر</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">التحويلات / العمليات</div>
                <div className="text-base font-bold mt-1 tabular-nums">
                  {fmt(dailySummary.transferredLiters, 0)} لتر ({fmt(dailySummary.operationsCount, 0)})
                </div>
              </div>
            </div>
          </ImdPanel>

          <ImdPanel title="حركات الصرف اليومية">
            <ImdTable
              columns={[
                { key: 'ref', header: 'السند', render: (r) => <span className="font-mono-num">{r.refNo}</span> },
                { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
                { key: 'ft', header: 'الوقود', render: (r) => (r.fuelType === 'petrol' ? 'بترول' : 'ديزل') },
                { key: 'ben', header: 'المستفيد', render: (r) => r.beneficiaryName },
                { key: 'q', header: 'الكمية (لتر)', numeric: true, render: (r) => fmt(r.quantityLiters, 0) },
              ]}
              rows={db.fuel_issues}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {(tab === 'official' || tab === 'balances') && (
        <ImdPanel title="أرصدة محطات وخزانات المحروقات">
          <ImdTable
            columns={[
              { key: 'wh', header: 'المحطة / الخزان', render: (r) => <strong>{r.warehouseName}</strong> },
              { key: 'p', header: 'بترول (لتر)', numeric: true, render: (r) => fmt(r.petrol, 0) },
              { key: 'd', header: 'ديزل (لتر)', numeric: true, render: (r) => fmt(r.diesel, 0) },
              { key: 'tot', header: 'الإجمالي (لتر)', numeric: true, render: (r) => <strong>{fmt(r.total, 0)}</strong> },
              { key: 'cap', header: 'السعة القصوى', numeric: true, render: (r) => fmt(r.capacityLiters, 0) },
              { key: 'occ', header: 'الإشغال', numeric: true, render: (r) => `${fmt(r.occupancyPct, 1)}%` },
            ]}
            rows={fuelTanks}
            rowKey={(r) => r.warehouseId}
          />
        </ImdPanel>
      )}

      {tab === 'consumption' && (
        <ImdPanel title="تحليل الاستهلاك حسب الوحدة المستفيدة">
          <ImdTable
            columns={[
              { key: 'u', header: 'الوحدة', render: (r) => r.unit },
              { key: 'p', header: 'بترول (لتر)', numeric: true, render: (r) => fmt(r.petrol, 0) },
              { key: 'd', header: 'ديزل (لتر)', numeric: true, render: (r) => fmt(r.diesel, 0) },
              { key: 'c', header: 'عدد السندات', numeric: true, render: (r) => fmt(r.count, 0) },
            ]}
            rows={unitConsumption}
            rowKey={(r) => r.unit}
          />
        </ImdPanel>
      )}

      {tab === 'vehicles' && (
        <ImdPanel title="تحليل استهلاك المركبات والآليات (computeFuelVehicleReport)">
          <ImdTable
            columns={[
              { key: 'ch', header: 'رقم الشاصي / المركبة', render: (r) => <span className="font-mono-num font-bold">{r.plateOrChassis}</span> },
              { key: 'u', header: 'الوحدة المستفيدة', render: (r) => r.unitName },
              { key: 'p', header: 'بترول (لتر)', numeric: true, render: (r) => fmt(r.petrolLiters, 0) },
              { key: 'd', header: 'ديزل (لتر)', numeric: true, render: (r) => fmt(r.dieselLiters, 0) },
              { key: 't', header: 'الإجمالي', numeric: true, render: (r) => <strong>{fmt(r.totalLiters, 0)} لتر</strong> },
              { key: 'c', header: 'التزويدات', numeric: true, render: (r) => fmt(r.issueCount, 0) },
            ]}
            rows={vehicleReport}
            rowKey={(r) => r.vehicleKey}
          />
        </ImdPanel>
      )}

      {tab === 'wh_stmt' && (
        <ImdPanel title="كشف التوريدات والتحويلات">
          <ImdTable
            columns={[
              { key: 'ref', header: 'المرجع', render: (r) => <span className="font-mono-num">{r.refNo}</span> },
              { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
              { key: 'wh', header: 'المحطة', render: (r) => r.warehouse },
              { key: 'sup', header: 'المورد', render: (r) => r.supplierName },
              { key: 'q', header: 'الكمية (لتر)', numeric: true, render: (r) => fmt(r.quantityLiters, 0) },
            ]}
            rows={db.fuel_supplies}
            rowKey={(r) => r.id}
          />
        </ImdPanel>
      )}

      {tab === 'ent_vs_iss' && (() => {
        const totalEnt = visibleAllocStatus.reduce((s, r) => s + r.grossEntitled, 0);
        const totalIss = visibleAllocStatus.reduce((s, r) => s + r.issuedSoFar, 0);
        const drainedCount = visibleAllocStatus.filter((r) => r.grossEntitled > 0 && r.remainingBalance <= 0).length;
        const heldCount = visibleAllocStatus.filter((r) => !r.allocation.disbursable).length;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-surface)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">التفريدات</div>
                <div className="text-lg font-bold mt-1 tabular-nums">{fmt(visibleAllocStatus.length, 0)}</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-surface)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">المستحق المتراكم</div>
                <div className="text-lg font-bold mt-1 tabular-nums">{fmt(totalEnt, 0)} لتر</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-surface)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">المصروف الفعلي</div>
                <div className="text-lg font-bold mt-1 tabular-nums">{fmt(totalIss, 0)} لتر</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-surface)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">استُنفد استحقاقها</div>
                <div className="text-lg font-bold mt-1 tabular-nums text-[var(--imd-danger)]">{fmt(drainedCount, 0)}</div>
              </div>
              <div className="p-3 border border-[var(--imd-line)] bg-[var(--imd-surface)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <div className="text-[var(--imd-muted)]">موقوفة عن الصرف</div>
                <div className="text-lg font-bold mt-1 tabular-nums text-[var(--imd-warn)]">{fmt(heldCount, 0)}</div>
              </div>
            </div>

            <ImdPanel
              title="الاستحقاق مقابل الصرف الفعلي (FuelPlanVsIssued)"
              subtitle="ما تراكم لكل وحدة من حقها وما أخذته منه — ومن استنفد حقه لا يُصرف له"
              headerRight={
                <div className="flex items-center gap-1 p-0.5 border border-[var(--imd-line)] bg-[var(--imd-subtle)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                  {(['all', 'petrol', 'diesel'] as const).map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setAllocFuelFilter(ft)}
                      className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${
                        allocFuelFilter === ft
                          ? 'bg-[var(--imd-surface)] text-[var(--imd-accent)] font-bold'
                          : 'text-[var(--imd-muted)]'
                      }`}
                      style={{ borderRadius: '4px' }}
                    >
                      {ft === 'all' ? 'الكل' : ft === 'petrol' ? 'بترول' : 'ديزل'}
                    </button>
                  ))}
                </div>
              }
            >
              <ImdTable
                columns={[
                  { key: 'ref', header: 'الرمز', render: (r) => <span className="font-mono-num text-[var(--imd-muted)]">{r.allocation.refNo}</span> },
                  { key: 'u', header: 'الوحدة', render: (r) => <strong>{r.allocation.unitName}</strong> },
                  { key: 'ft', header: 'الصنف', render: (r) => <ImdStatusText label={r.allocation.fuelType === 'petrol' ? 'بترول' : 'ديزل'} tone={r.allocation.fuelType === 'diesel' ? 'warn' : 'info'} /> },
                  { key: 'mo', header: 'المخصص الشهري', numeric: true, render: (r) => `${fmt(r.allocation.monthlyLiters || r.allocation.quantityPerPeriod, 0)} لتر` },
                  { key: 'ent', header: 'المستحق المتراكم', numeric: true, render: (r) => `${fmt(r.grossEntitled, 0)} لتر` },
                  { key: 'iss', header: 'المصروف', numeric: true, render: (r) => `${fmt(r.issuedSoFar, 0)} لتر` },
                  {
                    key: 'rem',
                    header: 'المتبقي',
                    numeric: true,
                    render: (r) => (
                      <span className={`font-bold ${r.remainingBalance <= 0 ? 'text-[var(--imd-danger)]' : ''}`}>
                        {fmt(r.remainingBalance, 0)} لتر
                      </span>
                    ),
                  },
                  {
                    key: 'bar',
                    header: 'الاستهلاك',
                    render: (r) => {
                      const ratio = r.grossEntitled > 0 ? Math.min(1, Math.max(0, r.issuedSoFar / r.grossEntitled)) : 0;
                      const pct = Math.round(ratio * 100);
                      const barColor =
                        pct >= 100 ? 'var(--imd-danger)' : pct >= 90 ? 'var(--imd-warn)' : 'var(--imd-success)';
                      return (
                        <div className="flex items-center gap-2 min-w-[130px]">
                          <div className="flex-1 h-2 bg-[var(--imd-subtle)] overflow-hidden" style={{ borderRadius: '999px' }}>
                            <div style={{ width: `${pct}%`, backgroundColor: barColor }} className="h-full" />
                          </div>
                          <span className="text-[11px] font-mono-num text-[var(--imd-muted)] w-9 text-left">{pct}%</span>
                        </div>
                      );
                    },
                  },
                ]}
                rows={visibleAllocStatus}
                rowKey={(r) => r.allocation.id}
                emptyTitle="لا توجد تفريدات مطابقة"
              />
            </ImdPanel>
          </div>
        );
      })()}
    </ImdPage>
  );
};

export const FuelDataScreen: React.FC = () => {
  const { db, navIntent, clearNavIntent, upsertRow, deleteRow, mutateDb, logAudit, notify, fmt } = useEmdad();
  const [tab, setTab] = useState<'warehouses' | 'units' | 'vehicles'>('vehicles');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'fuelData') return;
    if (navIntent.subTab) setTab(navIntent.subTab as 'warehouses' | 'units' | 'vehicles');
    clearNavIntent();
  }, [navIntent, clearNavIntent]);
  const [whName, setWhName] = useState('');
  const [whCap, setWhCap] = useState('50000');
  const [unitName, setUnitName] = useState('');
  const [unitCmd, setUnitCmd] = useState('');

  // Edit Fuel Warehouse Modal
  const [editWh, setEditWh] = useState<FuelWarehouse | null>(null);
  const [ewName, setEwName] = useState('');
  const [ewMgr, setEwMgr] = useState('');
  const [ewLoc, setEwLoc] = useState('');
  const [ewCap, setEwCap] = useState('50000');

  // Edit Fuel Unit Modal
  const [editUnit, setEditUnit] = useState<FuelUnit | null>(null);
  const [euName, setEuName] = useState('');
  const [euCmd, setEuCmd] = useState('');
  const [euPhone, setEuPhone] = useState('');

  // Vehicles grouped by chassisNo
  const vehicles = useMemo(() => {
    const map = new Map<
      string,
      { chassisNo: string; vehicleType: string; driver: string; unit: string; totalLiters: number; fills: number; lastDate: string }
    >();
    for (const iss of db.fuel_issues) {
      if (!iss.chassisNo) continue;
      const cur = map.get(iss.chassisNo) ?? {
        chassisNo: iss.chassisNo,
        vehicleType: iss.vehicleType,
        driver: iss.driverName,
        unit: iss.beneficiaryName,
        totalLiters: 0,
        fills: 0,
        lastDate: iss.date,
      };
      cur.totalLiters += iss.quantityLiters;
      cur.fills += 1;
      if (iss.date > cur.lastDate) cur.lastDate = iss.date;
      map.set(iss.chassisNo, cur);
    }
    return Array.from(map.values());
  }, [db.fuel_issues]);

  const handleSaveEditWh = () => {
    if (!editWh || !ewName.trim()) return;
    const oldName = editWh.name;
    const newName = ewName.trim();
    const renamed = oldName !== newName;
    mutateDb((prev) => ({
      ...prev,
      fuel_warehouses: prev.fuel_warehouses.map((w) =>
        w.id === editWh.id
          ? {
              ...w,
              name: newName,
              manager: ewMgr.trim(),
              location: ewLoc.trim(),
              capacityLiters: Math.max(1000, Number(ewCap) || w.capacityLiters),
            }
          : w
      ),
      ...(renamed
        ? {
            fuel_openings: prev.fuel_openings.map((o) => (o.warehouse === oldName ? { ...o, warehouse: newName } : o)),
            fuel_supplies: prev.fuel_supplies.map((s) => (s.warehouse === oldName ? { ...s, warehouse: newName } : s)),
            fuel_issues: prev.fuel_issues.map((i) => (i.warehouse === oldName ? { ...i, warehouse: newName } : i)),
            fuel_transfers: prev.fuel_transfers.map((t) => ({
              ...t,
              fromWarehouse: t.fromWarehouse === oldName ? newName : t.fromWarehouse,
              toWarehouse: t.toWarehouse === oldName ? newName : t.toWarehouse,
            })),
            fuel_stocktakes: prev.fuel_stocktakes.map((s) => (s.warehouse === oldName ? { ...s, warehouse: newName } : s)),
            fuel_allocations: prev.fuel_allocations.map((a) =>
              a.issueLocation === oldName ? { ...a, issueLocation: newName } : a
            ),
          }
        : {}),
    }));
    logAudit({
      action: 'UPDATE_FUEL_WAREHOUSE',
      entityType: 'fuel_warehouses',
      summary: renamed
        ? `تعديل وإعادة تسمية محطة المحروقات «${oldName}» إلى «${newName}»`
        : `تعديل بيانات محطة المحروقات «${newName}»`,
      warehouse: newName,
    });
    notify(`تم تحديث بيانات محطة "${newName}"`, 'success');
    setEditWh(null);
  };

  const handleDeleteWh = (w: FuelWarehouse) => {
    const hasMoves =
      db.fuel_openings.some((o) => o.warehouse === w.name) ||
      db.fuel_supplies.some((s) => s.warehouse === w.name) ||
      db.fuel_issues.some((i) => i.warehouse === w.name) ||
      db.fuel_transfers.some((t) => t.fromWarehouse === w.name || t.toWarehouse === w.name);
    if (hasMoves) {
      notify(`لا يمكن حذف «${w.name}» لوجود حركات وقود مسجلة — يمكنك إيقافها مؤقتاً`, 'danger');
      return;
    }
    deleteRow('fuel_warehouses', w.id);
    logAudit({
      action: 'DELETE_FUEL_WAREHOUSE',
      entityType: 'fuel_warehouses',
      summary: `حذف محطة المحروقات «${w.name}»`,
      risk: 'sensitive',
    });
    notify(`تم حذف المحطة "${w.name}"`, 'warn');
  };

  const handleSaveEditUnit = () => {
    if (!editUnit || !euName.trim()) return;
    upsertRow('fuel_units', {
      ...editUnit,
      name: euName.trim(),
      commander: euCmd.trim(),
      phone: euPhone.trim(),
    });
    notify(`تم تحديث بيانات الوحدة "${euName.trim()}"`, 'success');
    setEditUnit(null);
  };

  const handleDeleteUnit = (u: FuelUnit) => {
    const used =
      db.fuel_allocations.some((a) => a.unitId === u.id) ||
      db.fuel_issues.some((i) => i.beneficiaryUnitId === u.id);
    if (used) {
      notify(`لا يمكن حذف «${u.name}» لارتباطها بتفريدات أو سندات صرف — يمكنك إيقافها`, 'danger');
      return;
    }
    deleteRow('fuel_units', u.id);
    notify(`تم حذف الوحدة "${u.name}"`, 'warn');
  };

  return (
    <ImdPage title="البيانات الأساسية للمحروقات" subtitle="المستودعات والمحطات · الوحدات المستفيدة · سجل المركبات برقم الشاصي">
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as typeof tab)}
        tabs={[
          { id: 'vehicles', label: 'سجل المركبات (الشاصي)', count: vehicles.length },
          { id: 'warehouses', label: 'المستودعات والمحطات', count: db.fuel_warehouses.length },
          { id: 'units', label: 'الوحدات المستفيدة', count: db.fuel_units.length },
        ]}
      />

      {tab === 'vehicles' && (
        <ImdPanel title="تتبع استهلاك المركبات حسب رقم الشاصي (chassisNo)">
          <ImdTable
            columns={[
              { key: 'ch', header: 'رقم الشاصي', render: (r) => <span className="font-mono-num font-bold">{r.chassisNo}</span> },
              { key: 'vt', header: 'نوع المركبة', render: (r) => r.vehicleType || '—' },
              { key: 'u', header: 'الوحدة', render: (r) => r.unit },
              { key: 'dr', header: 'السائق', render: (r) => r.driver || '—' },
              { key: 'fl', header: 'عدد مرات التزويد', numeric: true, render: (r) => fmt(r.fills, 0) },
              { key: 'tot', header: 'إجمالي الاستهلاك', numeric: true, render: (r) => <strong>{fmt(r.totalLiters, 0)} لتر</strong> },
              { key: 'dt', header: 'آخر تعبئة', numeric: true, render: (r) => r.lastDate },
            ]}
            rows={vehicles}
            rowKey={(r) => r.chassisNo}
          />
        </ImdPanel>
      )}

      {tab === 'warehouses' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة محطة / خزان محروقات">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <ImdFld label="اسم المحطة" value={whName} onChange={setWhName} />
              <ImdFld label="السعة (لتر)" type="number" value={whCap} onChange={setWhCap} />
              <ImdButton
                variant="primary"
                onClick={() => {
                  if (!whName.trim()) return;
                  upsertRow('fuel_warehouses', {
                    id: Ids.next('fwh'),
                    code: `FW-${db.fuel_warehouses.length + 1}`,
                    name: whName.trim(),
                    manager: '',
                    location: '',
                    capacityLiters: Number(whCap) || 40000,
                    active: true,
                    notes: '',
                    createdAt: new Date().toISOString(),
                  });
                  setWhName('');
                  notify('تمت إضافة محطة المحروقات', 'success');
                }}
              >
                إضافة المحطة
              </ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'c', header: 'الكود', render: (r) => <span className="font-mono-num">{r.code}</span> },
                { key: 'n', header: 'اسم المحطة', render: (r) => <strong>{r.name}</strong> },
                { key: 'm', header: 'المسؤول', render: (r) => r.manager || '—' },
                { key: 'cap', header: 'السعة (لتر)', numeric: true, render: (r) => fmt(r.capacityLiters, 0) },
                { key: 'st', header: 'الحالة', render: (r) => <ImdStatusText label={r.active ? 'نشطة' : 'موقوفة'} tone={r.active ? 'success' : 'warn'} /> },
                {
                  key: 'act',
                  header: 'الإجراءات',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        title="تعديل المحطة"
                        onClick={() => {
                          setEditWh(r);
                          setEwName(r.name);
                          setEwMgr(r.manager);
                          setEwLoc(r.location);
                          setEwCap(String(r.capacityLiters));
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        title={r.active ? 'إيقاف المحطة' : 'تفعيل المحطة'}
                        onClick={() => {
                          upsertRow('fuel_warehouses', { ...r, active: !r.active });
                          notify(r.active ? `تم إيقاف "${r.name}"` : `تم تفعيل "${r.name}"`, 'info');
                        }}
                      >
                        <Power className={`w-3.5 h-3.5 ${r.active ? 'text-[var(--imd-warn)]' : 'text-[var(--imd-success)]'}`} />
                      </ImdButton>
                      <ImdButton size="sm" variant="ghost" title="حذف المحطة" onClick={() => handleDeleteWh(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.fuel_warehouses}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'units' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة وحدة مستفيدة من المحروقات">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <ImdFld label="اسم الوحدة" value={unitName} onChange={setUnitName} />
              <ImdFld label="القائد / المسؤول" value={unitCmd} onChange={setUnitCmd} />
              <ImdButton
                variant="primary"
                onClick={() => {
                  if (!unitName.trim()) return;
                  upsertRow('fuel_units', {
                    id: Ids.next('fun'),
                    code: `FU-${db.fuel_units.length + 1}`,
                    name: unitName.trim(),
                    commander: unitCmd,
                    phone: '',
                    active: true,
                    notes: '',
                    createdAt: new Date().toISOString(),
                  });
                  setUnitName('');
                  setUnitCmd('');
                  notify('تمت إضافة وحدة المحروقات', 'success');
                }}
              >
                إضافة وحدة
              </ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'c', header: 'الرمز', render: (r) => <span className="font-mono-num">{r.code}</span> },
                { key: 'n', header: 'الوحدة', render: (r) => <strong>{r.name}</strong> },
                { key: 'cmd', header: 'القائد', render: (r) => r.commander || '—' },
                { key: 'st', header: 'الحالة', render: (r) => <ImdStatusText label={r.active ? 'نشطة' : 'موقوفة'} tone={r.active ? 'success' : 'warn'} /> },
                {
                  key: 'act',
                  header: 'الإجراءات',
                  render: (r) => (
                    <div className="flex items-center gap-1">
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        title="تعديل الوحدة"
                        onClick={() => {
                          setEditUnit(r);
                          setEuName(r.name);
                          setEuCmd(r.commander);
                          setEuPhone(r.phone);
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        title={r.active ? 'إيقاف الوحدة' : 'تفعيل الوحدة'}
                        onClick={() => {
                          upsertRow('fuel_units', { ...r, active: !r.active });
                          notify(r.active ? `تم إيقاف "${r.name}"` : `تم تفعيل "${r.name}"`, 'info');
                        }}
                      >
                        <Power className={`w-3.5 h-3.5 ${r.active ? 'text-[var(--imd-warn)]' : 'text-[var(--imd-success)]'}`} />
                      </ImdButton>
                      <ImdButton size="sm" variant="ghost" title="حذف الوحدة" onClick={() => handleDeleteUnit(r)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  ),
                },
              ]}
              rows={db.fuel_units}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {/* Edit Fuel Warehouse Modal */}
      <ImdModal
        open={Boolean(editWh)}
        onClose={() => setEditWh(null)}
        title={`تعديل محطة المحروقات — ${editWh?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditWh(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleSaveEditWh}>حفظ التعديل</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdFld label="اسم المحطة (يُحدّث تلقائياً في السجلات)" value={ewName} onChange={setEwName} />
          <ImdFld label="المسؤول" value={ewMgr} onChange={setEwMgr} />
          <ImdFld label="الموقع" value={ewLoc} onChange={setEwLoc} />
          <ImdFld label="السعة التخزينية (لتر)" type="number" value={ewCap} onChange={setEwCap} />
        </div>
      </ImdModal>

      {/* Edit Fuel Unit Modal */}
      <ImdModal
        open={Boolean(editUnit)}
        onClose={() => setEditUnit(null)}
        title={`تعديل وحدة المحروقات — ${editUnit?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditUnit(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleSaveEditUnit}>حفظ التعديل</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdFld label="اسم الوحدة" value={euName} onChange={setEuName} />
          <ImdFld label="القائد / المسؤول" value={euCmd} onChange={setEuCmd} />
          <ImdFld label="الهاتف" value={euPhone} onChange={setEuPhone} />
        </div>
      </ImdModal>
    </ImdPage>
  );
};

export const FuelSettingsScreen: React.FC = () => {
  const { db, upsertRow, notify } = useEmdad();
  const row = db.fuel_settings_rows[0];
  const [form, setForm] = useState(row);

  if (!form) return null;

  const handleSave = () => {
    upsertRow('fuel_settings_rows', { ...form, updatedAt: new Date().toISOString() });
    notify('تم حفظ إعدادات قسم المحروقات', 'success');
  };

  return (
    <ImdPage
      title="إعدادات قسم المحروقات"
      subtitle="ترويسة البرقية، حد التنبيه %، سقف التراكم، اشتراط الشاصي، وتواقيع القسم"
      actions={
        <ImdButton variant="primary" onClick={handleSave}>
          <Save className="w-4 h-4" />
          <span>حفظ الإعدادات</span>
        </ImdButton>
      }
    >
      <ImdPanel title="سياسات التشغيل والضبط">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ImdFld label="نسبة تنبيه انخفاض المخزون (%)" type="number" value={form.lowStockPercent} onChange={(v) => setForm({ ...form, lowStockPercent: Number(v) || 20 })} />
          <ImdFld label="سقف فترات التراكم (carryCapPeriods)" type="number" value={form.carryCapPeriods} onChange={(v) => setForm({ ...form, carryCapPeriods: Number(v) || 4 })} />
          <ImdFld label="المخصص اليومي الافتراضي (لتر)" type="number" value={form.defaultDailyLiters} onChange={(v) => setForm({ ...form, defaultDailyLiters: Number(v) || 60 })} />
          <ImdFld label="اسم القسم بالترويسة" value={form.orgName} onChange={(v) => setForm({ ...form, orgName: v })} />
          <ImdFld label="توقيع ركن المحروقات" value={form.signOfficer} onChange={(v) => setForm({ ...form, signOfficer: v })} />
          <ImdFld label="توقيع رئيس الشعبة" value={form.signChief} onChange={(v) => setForm({ ...form, signChief: v })} />
        </div>
        <div className="mt-4 space-y-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.requireChassis} onChange={(e) => setForm({ ...form, requireChassis: e.target.checked })} />
            <span>اشتراط رقم الشاصي (requireChassis) عند صرف أي كمية</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.allowExceptional} onChange={(e) => setForm({ ...form, allowExceptional: e.target.checked })} />
            <span>السماح بالصرف الاستثنائي خارج التفريدة (allowExceptional)</span>
          </label>
        </div>
      </ImdPanel>
    </ImdPage>
  );
};
