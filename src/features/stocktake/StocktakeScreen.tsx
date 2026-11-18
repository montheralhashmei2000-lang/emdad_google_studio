// 5-Stage Inventory Stocktake Screen (FULL/PARTIAL/SURPRISE/CYCLE, Freeze, Multi-unit JSON Counts, Discovered Items, Per-line Variance Reasons -> POSTED)

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, Plus, Printer, XCircle } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdBarcodeInput,
  ImdButton,
  ImdFld,
  ImdModal,
  ImdNote,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { Ids } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import { getWarehouseItemStock } from '../../domain/stockLedger';
import type { Adjustment, Stocktake, StocktakeLine } from '../../domain/types';

export const StocktakeScreen: React.FC = () => {
  const { db, currentUser, ledger, navIntent, clearNavIntent, mutateDb, nextDocRef, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const [selectedSessionId, setSelectedSessionId] = useState(db.stocktakes[0]?.id ?? '');
  const [newOpen, setNewOpen] = useState(false);
  const [onlyVar, setOnlyVar] = useState(false);

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'stocktake') return;
    if (navIntent.focusId) {
      setSelectedSessionId(navIntent.focusId);
    } else if (navIntent.prefillWarehouse) {
      const match =
        db.stocktakes.find((s) => s.warehouse === navIntent.prefillWarehouse && s.status === 'COUNTING') ??
        db.stocktakes.find((s) => s.warehouse === navIntent.prefillWarehouse);
      if (match) setSelectedSessionId(match.id);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent, db.stocktakes]);

  const [whName, setWhName] = useState(db.warehouses[0]?.name ?? '');
  const [kind, setKind] = useState<Stocktake['type']>('FULL');
  const [committee, setCommittee] = useState('لجنة الجرد الدورية');
  const [freeze, setFreeze] = useState(true);

  // Discovered item modal
  const [discOpen, setDiscOpen] = useState(false);
  const [discItemId, setDiscItemId] = useState(db.items[0]?.id ?? '');
  const [discQty, setDiscQty] = useState('1');
  const [discReason, setDiscReason] = useState('فائض جردي غير مقيد بالدفتر');

  // Multi-unit JSON counts modal
  const [unitModalLine, setUnitModalLine] = useState<StocktakeLine | null>(null);
  const [unitCountsDraft, setUnitCountsDraft] = useState<Record<string, number>>({});

  const activeSession = db.stocktakes.find((s) => s.id === selectedSessionId) ?? db.stocktakes[0];
  const sessionLines = useMemo(
    () => db.stocktake_lines.filter((l) => l.sessionId === activeSession?.id),
    [db.stocktake_lines, activeSession?.id]
  );

  const handleCreateSession = () => {
    const orderNo = nextDocRef('stocktake');
    const sessionId = Ids.next('stk');
    const itemsToInclude =
      kind === 'PARTIAL'
        ? db.items.slice(0, 5)
        : kind === 'SURPRISE'
        ? db.items.filter((i) => i.minQty > 0).slice(0, 6)
        : db.items;

    const lines: StocktakeLine[] = itemsToInclude.map((item) => ({
      id: Ids.next('stkl'),
      sessionId,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      unitName: item.baseUnit,
      systemQty: getWarehouseItemStock(ledger, whName, item.id),
      countedQty: null,
      counts: {},
      variance: null,
      reason: '',
      decision: 'IGNORE',
      status: 'PENDING',
      discovered: false,
    }));

    const sess: Stocktake = {
      id: sessionId,
      orderNo,
      type: kind,
      date: todayIso(),
      warehouse: whName,
      categoryId: '',
      categoryName: 'الكل',
      committee,
      freeze,
      status: 'COUNTING',
      itemsCount: lines.length,
      countedCount: 0,
      varianceCount: 0,
      adjustedCount: 0,
      notes: '',
      closedDate: '',
      closedBy: '',
      cancelReason: '',
      cancelledBy: '',
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };

    mutateDb((prev) => ({
      ...prev,
      stocktakes: [sess, ...prev.stocktakes],
      stocktake_lines: [...lines, ...prev.stocktake_lines],
    }));
    setSelectedSessionId(sessionId);
    setNewOpen(false);
    logAudit({
      action: 'CREATE_STOCKTAKE',
      entityType: 'stocktakes',
      summary: `فتح جلسة جرد (${kind}) ${orderNo} في ${whName} ${freeze ? '(مع تجميد الحركات)' : ''}`,
      risk: 'sensitive',
      refNo: orderNo,
      warehouse: whName,
    });
    notify(`تم فتح جلسة الجرد ${orderNo}`, 'success');
  };

  const updateLine = (lineId: string, patch: Partial<StocktakeLine>) => {
    mutateDb((prev) => ({
      ...prev,
      stocktake_lines: prev.stocktake_lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }));
  };

  const updateLineCount = (line: StocktakeLine, countedStr: string) => {
    const counted = countedStr === '' ? null : Math.max(0, Number(countedStr) || 0);
    const variance = counted === null ? null : Math.round((counted - line.systemQty) * 1000) / 1000;
    const decision = variance !== null && Math.abs(variance) > 0.0001 ? 'ADJUST' : 'IGNORE';
    updateLine(line.id, {
      countedQty: counted,
      variance,
      decision,
      status: counted === null ? 'PENDING' : 'COUNTED',
    });
  };

  const handleBarcodeCount = (rawCode: string) => {
    if (!activeSession || activeSession.status !== 'COUNTING') return;
    const code = rawCode.trim().toLowerCase();
    const item = db.items.find(
      (i) => i.barcode.toLowerCase() === code || i.code.toLowerCase() === code || i.id.toLowerCase() === code
    );
    if (!item) {
      notify(`لم يتم العثور على صنف بالباركود أو الكود: ${rawCode}`, 'warn');
      return;
    }
    const line = sessionLines.find((l) => l.itemId === item.id);
    if (!line) {
      setDiscItemId(item.id);
      setDiscQty('1');
      setDiscOpen(true);
      notify(`الصنف "${item.name}" غير مدرج بالجلسة — يمكنك إضافته كصنف مكتشف`, 'info');
      return;
    }
    const nextQty = Math.round(((line.countedQty ?? 0) + 1) * 1000) / 1000;
    const variance = Math.round((nextQty - line.systemQty) * 1000) / 1000;
    const decision = Math.abs(variance) > 0.0001 ? 'ADJUST' : 'IGNORE';
    updateLine(line.id, {
      countedQty: nextQty,
      variance,
      decision,
      status: 'COUNTED',
    });
    notify(`تم احتساب +1 من "${item.name}" (الفعلي: ${fmt(nextQty)} ${line.unitName})`, 'success');
  };

  const openUnitBreakdown = (line: StocktakeLine) => {
    setUnitCountsDraft(line.counts ?? {});
    setUnitModalLine(line);
  };

  const saveUnitBreakdown = () => {
    if (!unitModalLine) return;
    const item = db.items.find((i) => i.id === unitModalLine.itemId);
    let totalBase = 0;
    for (const u of item?.units ?? []) {
      totalBase += (Number(unitCountsDraft[u.name]) || 0) * u.factor;
    }
    const variance = Math.round((totalBase - unitModalLine.systemQty) * 1000) / 1000;
    updateLine(unitModalLine.id, {
      counts: unitCountsDraft,
      countedQty: totalBase,
      variance,
      decision: Math.abs(variance) > 0.0001 ? 'ADJUST' : 'IGNORE',
      status: 'COUNTED',
    });
    setUnitModalLine(null);
    notify(`تم احتساب مجموع الوحدات (${fmt(totalBase)} ${unitModalLine.unitName})`, 'info');
  };

  const handleAddDiscoveredItem = () => {
    if (!activeSession) return;
    const it = db.items.find((i) => i.id === discItemId);
    const qty = Math.max(0.01, Number(discQty) || 0);
    if (!it) return;
    const line: StocktakeLine = {
      id: Ids.next('stkl'),
      sessionId: activeSession.id,
      itemId: it.id,
      itemCode: it.code,
      itemName: `${it.name} (صنف مكتشف)`,
      unitName: it.baseUnit,
      systemQty: getWarehouseItemStock(ledger, activeSession.warehouse, it.id),
      countedQty: qty,
      counts: { [it.baseUnit]: qty },
      variance: qty - getWarehouseItemStock(ledger, activeSession.warehouse, it.id),
      reason: discReason,
      decision: 'ADJUST',
      status: 'COUNTED',
      discovered: true,
    };
    mutateDb((prev) => ({
      ...prev,
      stocktake_lines: [line, ...prev.stocktake_lines],
    }));
    setDiscOpen(false);
    notify(`تمت إضافة الصنف المكتشف "${it.name}" لقائمة الجرد`, 'success');
  };

  const handlePostStocktake = () => {
    if (!activeSession || activeSession.status !== 'COUNTING') return;
    const now = new Date().toISOString();
    const adjRows: Adjustment[] = [];

    for (const l of sessionLines) {
      if (l.decision === 'ADJUST' && l.variance !== null && Math.abs(l.variance) > 0.0001) {
        adjRows.push({
          id: Ids.next('adj'),
          refNo: activeSession.orderNo,
          date: todayIso(),
          warehouse: activeSession.warehouse,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          unitName: l.unitName,
          factor: 1,
          qty: Math.abs(l.variance),
          baseQty: l.variance,
          status: 'COMPLETED',
          notes: `تسوية جرد #${activeSession.orderNo}: ${l.reason || 'فرق جرد فعلي'}`,
          createdBy: currentUser?.name ?? '',
          createdAt: now,
          editCount: 0,
          editLog: [],
          editedBy: '',
          cancelReason: '',
          cancelledBy: '',
          prevStatus: '',
          sessionId: activeSession.id,
          reason: l.reason || 'تسوية جرد',
          approvedBy: currentUser?.name ?? '',
        });
      }
    }

    mutateDb((prev) => ({
      ...prev,
      adjustments: [...adjRows, ...prev.adjustments],
      stocktakes: prev.stocktakes.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              status: 'POSTED',
              freeze: false,
              countedCount: sessionLines.filter((l) => l.countedQty !== null).length,
              varianceCount: sessionLines.filter((l) => l.variance !== null && l.variance !== 0).length,
              adjustedCount: adjRows.length,
              closedDate: todayIso(),
              closedBy: currentUser?.name ?? '',
            }
          : s
      ),
    }));
    logAudit({
      action: 'POST_STOCKTAKE',
      entityType: 'stocktakes',
      summary: `ترحيل جلسة الجرد ${activeSession.orderNo} واعتماد ${adjRows.length} تسوية`,
      risk: 'high',
      refNo: activeSession.orderNo,
      warehouse: activeSession.warehouse,
    });
    notify(`تم ترحيل الجرد واعتماد ${adjRows.length} قيود تسوية في دفتر الأرصدة`, 'success');
  };

  const handleCancelStocktake = () => {
    if (!activeSession || activeSession.status !== 'COUNTING') return;
    mutateDb((prev) => ({
      ...prev,
      stocktakes: prev.stocktakes.map((s) =>
        s.id === activeSession.id
          ? { ...s, status: 'CANCELLED', freeze: false, cancelledBy: currentUser?.name ?? '' }
          : s
      ),
    }));
    notify(`تم إلغاء جلسة الجرد ${activeSession.orderNo} وفك التجميد`, 'warn');
  };

  const lineCols: ImdColumn<StocktakeLine>[] = [
    { key: 'code', header: 'الكود', render: (r) => <span className="font-mono-num">{r.itemCode}</span> },
    {
      key: 'name',
      header: 'الصنف',
      render: (r) => (
        <div>
          <span className="font-medium">{r.itemName}</span>
          {r.discovered && <span className="mr-1 text-[10px] text-[var(--imd-info)] font-bold">[مكتشف]</span>}
        </div>
      ),
    },
    { key: 'sys', header: 'الدفتر', numeric: true, render: (r) => `${fmt(r.systemQty)} ${r.unitName}` },
    {
      key: 'cnt',
      header: 'العد الفعلي (أو متعدد الوحدات)',
      render: (r) =>
        activeSession?.status === 'COUNTING' ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={r.countedQty ?? ''}
              onChange={(e) => updateLineCount(r, e.target.value)}
              placeholder="العدد"
              className="w-24 h-8 px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] tabular-nums"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            />
            <ImdButton size="sm" variant="secondary" onClick={() => openUnitBreakdown(r)}>
              عدّ بالوحدات
            </ImdButton>
          </div>
        ) : (
          <span className="tabular-nums">{r.countedQty !== null ? fmt(r.countedQty) : '—'}</span>
        ),
    },
    {
      key: 'var',
      header: 'الفرق',
      numeric: true,
      render: (r) =>
        r.variance === null ? (
          '—'
        ) : (
          <span
            className="font-bold"
            style={{
              color:
                r.variance === 0
                  ? 'var(--imd-success)'
                  : r.variance < 0
                  ? 'var(--imd-danger)'
                  : 'var(--imd-info)',
            }}
          >
            {r.variance > 0 ? `+${fmt(r.variance)}` : fmt(r.variance)}
          </span>
        ),
    },
    {
      key: 'rsn',
      header: 'سبب الفرق',
      render: (r) =>
        activeSession?.status === 'COUNTING' ? (
          <input
            type="text"
            value={r.reason}
            onChange={(e) => updateLine(r.id, { reason: e.target.value })}
            placeholder="توضيح سبب الفرق..."
            className="w-full min-w-[140px] h-8 px-2 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
          />
        ) : (
          r.reason || '—'
        ),
    },
    {
      key: 'dec',
      header: 'القرار',
      render: (r) =>
        activeSession?.status === 'COUNTING' ? (
          <select
            value={r.decision}
            onChange={(e) => updateLine(r.id, { decision: e.target.value as 'ADJUST' | 'IGNORE' })}
            className="h-8 px-1.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
          >
            <option value="ADJUST">اعتماد تسوية</option>
            <option value="IGNORE">تجاهل</option>
          </select>
        ) : (
          <ImdStatusText
            label={r.decision === 'ADJUST' ? 'تسوية' : 'تجاهل / مطابق'}
            tone={r.decision === 'ADJUST' ? 'warn' : 'muted'}
          />
        ),
    },
  ];

  const unitModalItem = unitModalLine ? db.items.find((i) => i.id === unitModalLine.itemId) : undefined;

  return (
    <ImdPage
      title="الجرد المخزني والتسويات"
      subtitle="4 أنواع (كامل، جزئي، مفاجئ، دوري) · التجميد · العدّ بالوحدات (JSON counts) · الأصناف المكتشفة · الترحيل"
      actions={
        <ImdButton variant="primary" onClick={() => setNewOpen(true)}>
          <Plus className="w-4 h-4" />
          <span>فتح جلسة جرد جديدة</span>
        </ImdButton>
      }
    >
      <ImdPanel title="جلسات الجرد">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {db.stocktakes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSessionId(s.id)}
              className={`px-3 py-1.5 text-xs border cursor-pointer transition-colors ${
                s.id === activeSession?.id
                  ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-bold'
                  : 'border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-[var(--imd-text2)]'
              }`}
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              {s.orderNo} · {s.warehouse} ({s.type}) ·{' '}
              {s.status === 'COUNTING' ? 'قيد العد' : s.status === 'POSTED' ? 'مرحّل' : 'ملغي'}
            </button>
          ))}
        </div>

        {activeSession && (
          <div className="space-y-3">
            {activeSession.freeze && activeSession.status === 'COUNTING' && (
              <ImdNote tone="note" title="المستودع مجمّد حالياً">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>يمنع محرك القواعد صرف أي كميات من "{activeSession.warehouse}" حتى انتهاء وترحيل جلسة الجرد.</span>
                </div>
              </ImdNote>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--imd-muted)] pb-2 border-b border-[var(--imd-line)]">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  اللجنة: <strong>{activeSession.committee}</strong> · النوع: <strong>{activeSession.type}</strong> · التاريخ: {activeSession.date}
                </span>
                <span className="tabular-nums text-[var(--imd-text2)]">
                  المعدود: <strong>{fmt(sessionLines.filter((l) => l.countedQty !== null).length, 0)} / {fmt(sessionLines.length, 0)}</strong> ·
                  بها فروقات: <strong className="text-[var(--imd-danger)]">{fmt(sessionLines.filter((l) => l.variance !== null && l.variance !== 0).length, 0)}</strong> ·
                  لم تُعد: <strong>{fmt(sessionLines.filter((l) => l.countedQty === null).length, 0)}</strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--imd-text)] cursor-pointer select-none">
                  <input type="checkbox" checked={onlyVar} onChange={(e) => setOnlyVar(e.target.checked)} />
                  <span>الأصناف التي بها فروقات فقط</span>
                </label>
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    openPrintPreview({
                      formKey: 'stocktake',
                      space: 'supply',
                      title: 'محضر الجرد المخزني',
                      refNo: activeSession.orderNo,
                      date: activeSession.date,
                      warehouse: activeSession.warehouse,
                      partyLabel: 'لجنة الجرد',
                      partyValue: activeSession.committee,
                      opType: 'محضر جرد',
                      columns: ['الكود', 'الصنف', 'الدفتري', 'الفعلي', 'الفرق', 'السبب', 'القرار'],
                      rows: sessionLines.map((l) => [
                        l.itemCode,
                        l.itemName,
                        fmt(l.systemQty),
                        l.countedQty !== null ? fmt(l.countedQty) : '—',
                        l.variance !== null ? fmt(l.variance) : '—',
                        l.reason || '—',
                        l.decision === 'ADJUST' ? 'تسوية' : 'تجاهل',
                      ]),
                      totalQty: sessionLines.length,
                      actorName: currentUser?.name ?? '',
                    })
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>محضر الجرد</span>
                </ImdButton>
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const vLines = sessionLines.filter((l) => l.variance !== null && l.variance !== 0);
                    openPrintPreview({
                      formKey: 'stocktake_variance',
                      space: 'supply',
                      title: 'تقرير فروقات الجرد المخزني',
                      refNo: `${activeSession.orderNo}-VAR`,
                      date: activeSession.date,
                      warehouse: activeSession.warehouse,
                      partyLabel: 'لجنة الجرد',
                      partyValue: activeSession.committee,
                      opType: 'تقرير فروقات جرد',
                      columns: ['الكود', 'الصنف', 'الدفتري', 'الفعلي', 'الفرق', 'السبب', 'القرار'],
                      rows: vLines.map((l) => [
                        l.itemCode,
                        l.itemName,
                        fmt(l.systemQty),
                        l.countedQty !== null ? fmt(l.countedQty) : '—',
                        l.variance !== null ? fmt(l.variance) : '—',
                        l.reason || '—',
                        l.decision === 'ADJUST' ? 'تسوية' : 'تجاهل',
                      ]),
                      totalQty: vLines.length,
                      actorName: currentUser?.name ?? '',
                    });
                  }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>تقرير الفروقات</span>
                </ImdButton>
                {activeSession.status === 'COUNTING' && (
                  <>
                    <ImdButton size="sm" variant="secondary" onClick={() => setDiscOpen(true)}>
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة صنف مكتشف</span>
                    </ImdButton>
                    <ImdButton size="sm" variant="danger" onClick={handleCancelStocktake}>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>إلغاء الجلسة</span>
                    </ImdButton>
                    <ImdButton size="sm" variant="primary" onClick={handlePostStocktake}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد الفروقات وترحيل التسويات</span>
                    </ImdButton>
                  </>
                )}
              </div>
            </div>

            {activeSession.status === 'COUNTING' && (
              <div className="flex flex-wrap items-end justify-between gap-2 p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <ImdBarcodeInput
                  label="العدّ الفوري بالباركود / الكود (+1 بالوحدة الأساسية عند كل مسح)"
                  onScan={handleBarcodeCount}
                  className="w-full md:w-96"
                />
                <span className="text-[11px] text-[var(--imd-muted)]">
                  المسح المتكرر يزيد العدّ الفعلي تلقائياً ويحتسب الفرق مباشرة
                </span>
              </div>
            )}

            <ImdTable
              columns={lineCols}
              rows={onlyVar ? sessionLines.filter((l) => l.countedQty !== null && l.variance !== 0) : sessionLines}
              rowKey={(r) => r.id}
            />
          </div>
        )}
      </ImdPanel>

      {/* New Stocktake Session Modal */}
      <ImdModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="فتح أمر جرد مخزني جديد"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setNewOpen(false)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleCreateSession}>بدء الجرد</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdSelect
            label="المستودع"
            value={whName}
            onChange={setWhName}
            options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
          />
          <ImdSelect
            label="نوع الجرد"
            value={kind}
            onChange={(v) => setKind(v as Stocktake['type'])}
            options={[
              { value: 'FULL', label: 'جرد كامل لكافة الأصناف (FULL)' },
              { value: 'PARTIAL', label: 'جرد جزئي بتصنيف (PARTIAL)' },
              { value: 'SURPRISE', label: 'جرد مفاجئ للأصناف الحرجة (SURPRISE)' },
              { value: 'CYCLE', label: 'جرد دوري مجدول (CYCLE)' },
            ]}
          />
          <ImdFld label="أعضاء اللجنة" value={committee} onChange={setCommittee} />
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />
            <span>تجميد حركات الصرف من المستودع أثناء الجرد</span>
          </label>
        </div>
      </ImdModal>

      {/* Multi-unit JSON Counts Breakdown Modal */}
      <ImdModal
        open={Boolean(unitModalLine)}
        onClose={() => setUnitModalLine(null)}
        title={`العدّ التفصيلي بالوحدات — ${unitModalLine?.itemName ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setUnitModalLine(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={saveUnitBreakdown}>اعتماد مجموع العدّ</ImdButton>
          </>
        }
      >
        {unitModalItem && (
          <div className="space-y-3">
            {unitModalItem.units.map((u) => (
              <ImdFld
                key={u.name}
                label={`${u.name} (المعامل ×${u.factor})`}
                type="number"
                value={unitCountsDraft[u.name] ?? 0}
                onChange={(v) =>
                  setUnitCountsDraft((p) => ({ ...p, [u.name]: Math.max(0, Number(v) || 0) }))
                }
              />
            ))}
          </div>
        )}
      </ImdModal>

      {/* Add Discovered Item Modal */}
      <ImdModal
        open={discOpen}
        onClose={() => setDiscOpen(false)}
        title="إضافة صنف مكتشف أثناء الجرد (discovered)"
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setDiscOpen(false)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleAddDiscoveredItem}>إضافة للقائمة</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdSelect
            label="الصنف المكتشف"
            value={discItemId}
            onChange={setDiscItemId}
            options={db.items.map((i) => ({ value: i.id, label: `${i.code} — ${i.name}` }))}
            searchable
          />
          <ImdFld label="الكمية الفعلية المكتشفة" type="number" value={discQty} onChange={setDiscQty} />
          <ImdFld label="البيان / سبب الاكتشاف" value={discReason} onChange={setDiscReason} />
        </div>
      </ImdModal>
    </ImdPage>
  );
};
