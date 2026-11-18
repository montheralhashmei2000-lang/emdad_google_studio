// Camp Accounts & Entitlements Hub (3 Tabs: الاستحقاق الفعلي، سجل حساب المعسكر، تصفية الشهر)

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Calculator, LockKeyhole, PackageCheck, Printer, Scale } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdKpiCard,
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
import { computeCampLedgerRows, type CampLedgerComputedRow, type ScopeKind } from '../../domain/campLedgerCalc';
import type { CampLedger, MonthlySettlement } from '../../domain/types';

export const CampAccountsHub: React.FC = () => {
  const { db, currentUser, navIntent, clearNavIntent, mutateDb, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const [tab, setTab] = useState<'entitlement' | 'ledger' | 'settlement'>('ledger');

  const nowDate = todayIso();
  const [year, setYear] = useState(nowDate.slice(0, 4));
  const [month, setMonth] = useState(String(Number(nowDate.slice(5, 7))));
  const [scopeKind, setScopeKind] = useState<ScopeKind>('all');
  const [scopeId, setScopeId] = useState('');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'campAccounts') return;
    if (navIntent.subTab === 'entitlement' || navIntent.subTab === 'ledger' || navIntent.subTab === 'settlement') {
      setTab(navIntent.subTab);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const camps = db.beneficiary_units.filter((u) => u.isCamp);

  const computedRows = useMemo(
    () =>
      computeCampLedgerRows({
        year: Number(year),
        month: Number(month),
        scopeKind,
        scopeId: scopeId || undefined,
        camps,
        units: db.beneficiary_units,
        warehouses: db.warehouses,
        items: db.items,
        entitlements: db.entitlements,
        strengths: db.strengths,
        transfers: db.transfers,
        issues: db.issues,
        returns: db.returns,
        kitchenLogs: db.kitchen_logs,
        existingLedgers: db.camp_ledgers,
      }),
    [year, month, scopeKind, scopeId, camps, db]
  );

  const scopeKey = `${scopeKind}:${scopeId || 'ALL'}`;
  const isSettled = db.monthly_settlements.some(
    (s) => s.year === Number(year) && s.month === Number(month) && s.scopeKey === scopeKey
  );

  const handleSettleMonth = () => {
    if (isSettled) {
      notify('تمت تصفية هذا النطاق والشهر مسبقاً', 'warn');
      return;
    }
    const now = new Date().toISOString();
    const totalCredit = computedRows.reduce((s, r) => s + Math.max(0, r.entitlementBalance), 0);
    const totalDebit = computedRows.reduce((s, r) => s + Math.max(0, -r.entitlementBalance), 0);

    const closedLedgers: CampLedger[] = computedRows.map((r) => ({
      id: Ids.natural(r.campId, r.itemId, year, month),
      campId: r.campId,
      campName: r.campName,
      itemId: r.itemId,
      itemName: r.itemName,
      unitName: r.unitName,
      year: r.year,
      month: r.month,
      openingEntitled: r.openingEntitled,
      openingStock: r.openingStock,
      entitlementTotal: r.entitlementTotal,
      transferredIn: r.transferredIn,
      issuedDirect: r.issuedDirect,
      returnedQty: r.returnedQty,
      consumedKitchen: r.consumedKitchen,
      strengthSum: r.strengthSum,
      strengthDays: r.strengthDays,
      status: 'CLOSED',
      closedBy: currentUser?.name ?? '',
      closedAt: now,
      updatedAt: now,
    }));

    const settlement: MonthlySettlement = {
      id: Ids.next('stl'),
      year: Number(year),
      month: Number(month),
      scopeKey,
      scopeLabel: scopeKind === 'all' ? 'كافة المعسكرات' : scopeId || scopeKind,
      settledBy: currentUser?.name ?? '',
      notes: 'تصفية شهرية معتمدة وترحيل الأرصدة الدائنة والمدينة',
      campsCount: new Set(computedRows.map((r) => r.campId)).size,
      itemsCount: computedRows.length,
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalDebit: Math.round(totalDebit * 100) / 100,
      settledAt: now,
    };

    mutateDb((prev) => ({
      ...prev,
      camp_ledgers: [...closedLedgers, ...prev.camp_ledgers.filter((l) => l.year !== Number(year) || l.month !== Number(month))],
      monthly_settlements: [settlement, ...prev.monthly_settlements],
    }));

    logAudit({
      action: 'MONTHLY_SETTLEMENT',
      entityType: 'monthly_settlements',
      summary: `تصفية شهر ${year}-${month} (${settlement.scopeLabel})`,
      risk: 'high',
    });
    notify('تمت التصفية الشهرية وحفظ سجل حساب المعسكرات بنجاح', 'success');
  };

  const cols: ImdColumn<CampLedgerComputedRow>[] = [
    { key: 'camp', header: 'المعسكر', render: (r) => r.campName },
    { key: 'item', header: 'الصنف', render: (r) => r.itemName },
    { key: 'str', header: 'مجموع القوة (يوم×فرد)', numeric: true, render: (r) => fmt(r.strengthSum, 0) },
    { key: 'ent', header: 'المستحق للفترة', numeric: true, render: (r) => `${fmt(r.entitlementTotal)} ${r.unitName}` },
    { key: 'del', header: 'المسلّم (تحويل + صرف − مرتجع)', numeric: true, render: (r) => fmt(r.transferredIn + r.issuedDirect - r.returnedQty) },
    {
      key: 'ebal',
      header: 'رصيد الاستحقاق',
      numeric: true,
      render: (r) => (
        <span style={{ color: r.entitlementBalance >= 0 ? 'var(--imd-success)' : 'var(--imd-danger)' }} className="font-bold">
          {fmt(r.entitlementBalance)}
        </span>
      ),
    },
    { key: 'cons', header: 'مستهلك المطبخ', numeric: true, render: (r) => fmt(r.consumedKitchen) },
    { key: 'sbal', header: 'رصيد المخزون الفعلي', numeric: true, render: (r) => <strong>{fmt(r.stockBalance)}</strong> },
  ];

  return (
    <ImdPage
      title="حساب المعسكرات والاستحقاق"
      subtitle="رصيد الاستحقاق ورصيد المخزون المستقلان + نطاقات المنع من الازدواج + تصفية الشهر"
      actions={
        <ImdButton
          variant="secondary"
          onClick={() =>
            openPrintPreview({
              formKey: 'camp_ledger',
              space: 'supply',
              title: `كشف حساب المعسكرات — ${year}/${month}`,
              refNo: `CL-${year}${month}`,
              date: todayIso(),
              warehouse: scopeKind === 'all' ? 'جميع النطاقات' : scopeId || scopeKind,
              partyLabel: 'النطاق المحاسبي',
              partyValue: scopeKey,
              opType: 'كشف حساب معسكر',
              columns: ['المعسكر', 'الصنف', 'المستحق', 'المسلّم', 'رصيد الاستحقاق', 'رصيد المخزون'],
              rows: computedRows.map((r) => [
                r.campName,
                r.itemName,
                fmt(r.entitlementTotal),
                fmt(r.transferredIn + r.issuedDirect - r.returnedQty),
                fmt(r.entitlementBalance),
                fmt(r.stockBalance),
              ]),
              totalQty: computedRows.length,
              actorName: currentUser?.name ?? '',
            })
          }
        >
          <Printer className="w-4 h-4" />
          <span>طباعة الكشف</span>
        </ImdButton>
      }
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as 'entitlement' | 'ledger' | 'settlement')}
        tabs={[
          { id: 'entitlement', label: 'الاستحقاق الفعلي' },
          { id: 'ledger', label: 'سجل حساب المعسكر', count: computedRows.length },
          { id: 'settlement', label: 'تصفية الشهر', count: db.monthly_settlements.length },
        ]}
      />

      {(() => {
        const totalEnt = computedRows.reduce((s, r) => s + r.entitlementTotal, 0);
        const totalDel = computedRows.reduce((s, r) => s + (r.transferredIn + r.issuedDirect - r.returnedQty), 0);
        const netEntBal = computedRows.reduce((s, r) => s + r.entitlementBalance, 0);
        const totalStockBal = computedRows.reduce((s, r) => s + r.stockBalance, 0);
        const topVariances = computedRows
          .slice()
          .sort((a, b) => Math.abs(b.entitlementBalance) - Math.abs(a.entitlementBalance))
          .slice(0, 6);
        const maxVarVal = Math.max(1, ...topVariances.flatMap((x) => [x.entitlementTotal, x.transferredIn + x.issuedDirect - x.returnedQty]));

        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ImdKpiCard
                label="إجمالي الاستحقاق المقدر"
                value={fmt(totalEnt)}
                tone="accent"
                icon={<Calculator className="w-4 h-4" />}
                meta={`للفترة ${year}-${String(month).padStart(2, '0')} · ${camps.length} معسكرات`}
                onClick={() => setTab('entitlement')}
              />
              <ImdKpiCard
                label="إجمالي المسلّم الفعلي"
                value={fmt(totalDel)}
                tone="info"
                icon={<PackageCheck className="w-4 h-4" />}
                meta="تحويلات + صرف مباشر − مرتجعات"
                onClick={() => setTab('ledger')}
              />
              <ImdKpiCard
                label="صافي رصيد الاستحقاق"
                value={fmt(netEntBal)}
                tone={netEntBal >= 0 ? 'success' : 'danger'}
                icon={<Scale className="w-4 h-4" />}
                meta={netEntBal >= 0 ? 'رصيد متاح مستحق للمعسكرات' : 'تجاوز صرف عن المقرر'}
                onClick={() => setTab('settlement')}
              />
              <ImdKpiCard
                label="رصيد مخزون المعسكرات"
                value={fmt(totalStockBal)}
                tone={isSettled ? 'success' : 'warn'}
                icon={<LockKeyhole className="w-4 h-4" />}
                meta={isSettled ? 'الفترة مقفلة ومصفاة' : 'الفترة مفتوحة للتدقيق والإقفال'}
                onClick={() => setTab('settlement')}
              />
            </div>

            {topVariances.length > 0 && (
              <ImdPanel
                title="مقارنة الاستحقاق مقابل المسلّم الفعلي (أعلى الفروقات)"
                icon={<BarChart3 className="w-4 h-4" />}
                subtitle="توزيع مقارن يوضح كفاية التسليم قبل تنفيذ تصفية الشهر"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {topVariances.map((row) => {
                    const del = Math.max(0, row.transferredIn + row.issuedDirect - row.returnedQty);
                    const entPct = Math.min(100, Math.round((row.entitlementTotal / maxVarVal) * 100));
                    const delPct = Math.min(100, Math.round((del / maxVarVal) * 100));
                    return (
                      <div
                        key={`cmp-${row.campId}-${row.itemId}`}
                        className="p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] space-y-1.5"
                        style={{ borderRadius: 'var(--imd-radius-sm)' }}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold truncate text-[var(--imd-text)]">{row.itemName}</span>
                          <span className="text-[11px] text-[var(--imd-muted)] truncate">{row.campName}</span>
                        </div>
                        <div className="space-y-1 text-[11px] font-mono-num">
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-[var(--imd-muted)]">المستحق</span>
                            <div className="flex-1 h-1.5 bg-[var(--imd-subtle)] overflow-hidden" style={{ borderRadius: '2px' }}>
                              <div className="h-full bg-[var(--imd-accent)]" style={{ width: `${entPct}%` }} />
                            </div>
                            <span className="w-12 text-left">{fmt(row.entitlementTotal, 0)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-[var(--imd-muted)]">المسلّم</span>
                            <div className="flex-1 h-1.5 bg-[var(--imd-subtle)] overflow-hidden" style={{ borderRadius: '2px' }}>
                              <div
                                className="h-full"
                                style={{
                                  width: `${delPct}%`,
                                  backgroundColor: del > row.entitlementTotal ? 'var(--imd-danger)' : 'var(--imd-info)',
                                }}
                              />
                            </div>
                            <span className="w-12 text-left">{fmt(del, 0)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ImdPanel>
            )}
          </>
        );
      })()}

      <ImdPanel>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <ImdSelect
            label="السنة"
            value={year}
            onChange={setYear}
            options={['2025', '2026', '2027'].map((y) => ({ value: y, label: y }))}
          />
          <ImdSelect
            label="الشهر"
            value={month}
            onChange={setMonth}
            options={Array.from({ length: 12 }, (_, i) => ({
              value: String(i + 1),
              label: `شهر ${i + 1}`,
            }))}
          />
          <ImdSelect
            label="نطاق الحساب (منع الازدواج)"
            value={scopeKind}
            onChange={(v) => {
              setScopeKind(v as ScopeKind);
              setScopeId('');
            }}
            options={[
              { value: 'all', label: 'النطاق الشامل (all)' },
              { value: 'camp', label: 'معسكر محدد (camp)' },
              { value: 'unit', label: 'وحدة محددة (unit)' },
              { value: 'warehouse', label: 'مستودع محدد (warehouse)' },
            ]}
          />
          {scopeKind !== 'all' && (
            <ImdSelect
              label="تحديد الجهة"
              value={scopeId}
              onChange={setScopeId}
              options={[
                { value: '', label: 'اختر...' },
                ...(scopeKind === 'camp'
                  ? camps.map((c) => ({ value: c.id, label: c.name }))
                  : scopeKind === 'unit'
                  ? db.beneficiary_units.map((u) => ({ value: u.id, label: u.name }))
                  : db.warehouses.map((w) => ({ value: w.name, label: w.name }))),
              ]}
            />
          )}
        </div>

        {tab === 'entitlement' && (
          <ImdTable
            columns={cols.slice(0, 6)}
            rows={computedRows}
            rowKey={(r) => `${r.campId}-${r.itemId}`}
          />
        )}

        {tab === 'ledger' && (
          <ImdTable
            columns={cols}
            rows={computedRows}
            rowKey={(r) => `${r.campId}-${r.itemId}`}
          />
        )}

        {tab === 'settlement' && (
          <div className="space-y-4">
            <ImdNote tone={isSettled ? 'success' : 'info'}>
              {isSettled
                ? `الشهر ${year}-${month} للنطاق (${scopeKey}) تمت تصفيته وإقفاله مسبقاً.`
                : `الشهر ${year}-${month} مفتوح حالياً — يمكنك مراجعة الأرصدة وتنفيذ الإقفال الشهري.`}
            </ImdNote>
            {!isSettled && (
              <div className="flex justify-end">
                <ImdButton variant="primary" onClick={handleSettleMonth}>
                  <LockKeyhole className="w-4 h-4" />
                  <span>اعتماد تصفية الشهر وإقفال الدفتر</span>
                </ImdButton>
              </div>
            )}
            <ImdTable
              columns={[
                { key: 'ym', header: 'الشهر', numeric: true, render: (r) => `${r.year}-${String(r.month).padStart(2, '0')}` },
                { key: 'sc', header: 'النطاق', render: (r) => r.scopeLabel },
                { key: 'cc', header: 'المعسكرات', numeric: true, render: (r) => fmt(r.campsCount, 0) },
                { key: 'cr', header: 'إجمالي الدائن', numeric: true, render: (r) => fmt(r.totalCredit) },
                { key: 'db', header: 'إجمالي المدين', numeric: true, render: (r) => fmt(r.totalDebit) },
                { key: 'by', header: 'المُصفّي', render: (r) => r.settledBy },
                { key: 'st', header: 'الحالة', render: () => <ImdStatusText label="مقفل ومُعتمد" tone="success" /> },
              ]}
              rows={db.monthly_settlements}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </ImdPanel>
    </ImdPage>
  );
};
