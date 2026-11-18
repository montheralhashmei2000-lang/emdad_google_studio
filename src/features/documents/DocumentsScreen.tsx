// Unified Documents Log (DocLogView): Grouped by refNo, Search, Filter by Date Range/Kind/Status, DocumentEdit with multi-line selection & editLog + Balance Diff, Manual Commander ESign, Cancel with Audit, Full Multi-Line Copy/Thermal Printing

import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Edit3, Printer, ReceiptText, ShieldCheck } from 'lucide-react';
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
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { signDocumentPayload } from '../../core/security/crypto';
import { filterAllowedWarehouses } from '../../domain/accessControl';
import type { CollectionKey } from '../../data/db';
import type { EditLogEntry } from '../../domain/types';

interface DocLineItem {
  id: string;
  itemName: string;
  qty: number;
  factor: number;
  baseQty: number;
  unitName: string;
  notes: string;
  status: string;
  editCount: number;
  editLog: EditLogEntry[];
}

interface GroupedVoucherRow {
  groupKey: string;
  collection: CollectionKey;
  kindLabel: string;
  refNo: string;
  date: string;
  warehouse: string;
  party: string;
  receiverName?: string;
  status: string;
  notes: string;
  totalBaseQty: number;
  totalEdits: number;
  lines: DocLineItem[];
}

export const DocumentsScreen: React.FC = () => {
  const { db, currentUser, navIntent, clearNavIntent, mutateDb, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'documents') return;
    if (navIntent.searchQuery !== undefined) {
      setSearch(navIntent.searchQuery);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const [cancelTarget, setCancelTarget] = useState<GroupedVoucherRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // DocumentEdit Modal (supports editing any line inside grouped voucher)
  const [editGroup, setEditGroup] = useState<GroupedVoucherRow | null>(null);
  const [editLineId, setEditLineId] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSummary, setEditSummary] = useState('');

  // Manual ESign Modal
  const [esignPreview, setEsignPreview] = useState<{ refNo: string; sig: string } | null>(null);

  const allowedWhNames = useMemo(
    () => filterAllowedWarehouses(currentUser, db.warehouses).map((w) => w.name),
    [currentUser, db.warehouses]
  );

  const docs = useMemo<GroupedVoucherRow[]>(() => {
    interface RawDocRow extends DocLineItem {
      collection: CollectionKey;
      kindLabel: string;
      refNo: string;
      date: string;
      warehouse: string;
      party: string;
      receiverName?: string;
    }

    const raw: RawDocRow[] = [
      ...db.receipts.map((r) => ({
        id: r.id,
        collection: 'receipts' as CollectionKey,
        kindLabel: 'سند استلام',
        refNo: r.refNo,
        date: r.date,
        warehouse: r.warehouse,
        itemName: r.itemName,
        qty: r.qty,
        factor: r.factor,
        baseQty: r.baseQty,
        unitName: r.unitName,
        party: r.supplier,
        status: r.status,
        notes: r.notes,
        editCount: r.editCount,
        editLog: r.editLog ?? [],
      })),
      ...db.issues.map((i) => ({
        id: i.id,
        collection: 'issues' as CollectionKey,
        kindLabel: 'سند صرف',
        refNo: i.refNo,
        date: i.date,
        warehouse: i.warehouse,
        itemName: i.itemName,
        qty: i.qty,
        factor: i.factor,
        baseQty: i.baseQty,
        unitName: i.unitName,
        party: i.recipientDisplay,
        receiverName: i.receiverName,
        status: i.status,
        notes: i.notes,
        editCount: i.editCount,
        editLog: i.editLog ?? [],
      })),
      ...db.transfers.map((t) => ({
        id: t.id,
        collection: 'transfers' as CollectionKey,
        kindLabel: 'سند تحويل',
        refNo: t.refNo,
        date: t.date,
        warehouse: t.warehouse,
        itemName: t.itemName,
        qty: t.qty,
        factor: t.factor,
        baseQty: t.baseQty,
        unitName: t.unitName,
        party: t.destWarehouse,
        status: t.status,
        notes: t.notes,
        editCount: t.editCount,
        editLog: t.editLog ?? [],
      })),
      ...db.returns.map((r) => ({
        id: r.id,
        collection: 'returns' as CollectionKey,
        kindLabel: 'سند مرتجع',
        refNo: r.refNo,
        date: r.date,
        warehouse: r.warehouse,
        itemName: r.itemName,
        qty: r.qty,
        factor: r.factor,
        baseQty: r.baseQty,
        unitName: r.unitName,
        party: r.party,
        status: r.status,
        notes: r.notes,
        editCount: r.editCount,
        editLog: r.editLog ?? [],
      })),
    ];

    const grouped = new Map<string, GroupedVoucherRow>();
    for (const r of raw) {
      if (!allowedWhNames.includes(r.warehouse)) continue;
      const key = `${r.collection}|${r.refNo}`;
      const existing = grouped.get(key);
      const line: DocLineItem = {
        id: r.id,
        itemName: r.itemName,
        qty: r.qty,
        factor: r.factor,
        baseQty: r.baseQty,
        unitName: r.unitName,
        notes: r.notes,
        status: r.status,
        editCount: r.editCount,
        editLog: r.editLog,
      };
      if (existing) {
        existing.lines.push(line);
        existing.totalBaseQty += r.baseQty;
        existing.totalEdits += r.editCount;
      } else {
        grouped.set(key, {
          groupKey: key,
          collection: r.collection,
          kindLabel: r.kindLabel,
          refNo: r.refNo,
          date: r.date,
          warehouse: r.warehouse,
          party: r.party,
          receiverName: r.receiverName,
          status: r.status,
          notes: r.notes,
          totalBaseQty: r.baseQty,
          totalEdits: r.editCount,
          lines: [line],
        });
      }
    }

    return Array.from(grouped.values())
      .filter((d) => (kindFilter === 'ALL' ? true : d.collection === kindFilter))
      .filter((d) => (statusFilter === 'ALL' ? true : d.status === statusFilter))
      .filter((d) => (!dateFrom || d.date >= dateFrom) && (!dateTo || d.date <= dateTo))
      .filter((d) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          d.refNo.toLowerCase().includes(q) ||
          d.party.toLowerCase().includes(q) ||
          d.lines.some((l) => l.itemName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    db.receipts,
    db.issues,
    db.transfers,
    db.returns,
    allowedWhNames,
    kindFilter,
    statusFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const activeEditLine =
    editGroup?.lines.find((l) => l.id === editLineId) ?? editGroup?.lines[0] ?? null;

  const openEditModal = (group: GroupedVoucherRow) => {
    const first = group.lines[0];
    setEditGroup(group);
    setEditLineId(first?.id ?? '');
    setEditQty(first ? String(first.qty) : '');
    setEditNotes(first?.notes ?? group.notes);
    setEditSummary('');
  };

  const handleSelectEditLine = (lineId: string) => {
    setEditLineId(lineId);
    const ln = editGroup?.lines.find((l) => l.id === lineId);
    if (ln) {
      setEditQty(String(ln.qty));
      setEditNotes(ln.notes);
    }
  };

  const handleConfirmEdit = () => {
    if (!editGroup || !activeEditLine) return;
    const nextQty = Math.max(0.01, Number(editQty) || 0);
    const nextBase = nextQty * activeEditLine.factor;
    const diffBase = nextBase - activeEditLine.baseQty;
    const summary =
      editSummary.trim() ||
      `تعديل بند ${activeEditLine.itemName} من ${activeEditLine.qty} إلى ${nextQty} ${activeEditLine.unitName} (فرق ${diffBase > 0 ? '+' : ''}${diffBase})`;

    const logEntry: EditLogEntry = {
      at: new Date().toISOString(),
      by: currentUser?.name ?? '',
      summary,
    };

    mutateDb((prev) => {
      const arr = prev[editGroup.collection] as unknown as Array<Record<string, unknown>>;
      return {
        ...prev,
        [editGroup.collection]: arr.map((row) =>
          row.id === activeEditLine.id
            ? {
                ...row,
                qty: nextQty,
                baseQty: nextBase,
                notes: editNotes,
                editedBy: currentUser?.name ?? '',
                editCount: Number(row.editCount || 0) + 1,
                editLog: [...((row.editLog as EditLogEntry[]) ?? []), logEntry],
              }
            : row
        ),
      };
    });

    logAudit({
      action: 'EDIT_VOUCHER',
      entityType: editGroup.collection,
      summary: `تعديل السند ${editGroup.refNo}: ${summary}`,
      risk: 'sensitive',
      refNo: editGroup.refNo,
      warehouse: editGroup.warehouse,
      qty: diffBase,
    });
    notify(`تم حفظ تعديل السند ${editGroup.refNo} وتحديث الرصيد`, 'success');
    setEditGroup(null);
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget || !cancelReason.trim()) {
      notify('يجب كتابة سبب الإلغاء', 'danger');
      return;
    }
    mutateDb((prev) => {
      const arr = prev[cancelTarget.collection] as unknown as Array<Record<string, unknown>>;
      return {
        ...prev,
        [cancelTarget.collection]: arr.map((row) =>
          row.refNo === cancelTarget.refNo
            ? {
                ...row,
                prevStatus: row.status,
                status: 'CANCELLED',
                cancelReason: cancelReason.trim(),
                cancelledBy: currentUser?.name ?? '',
              }
            : row
        ),
      };
    });
    logAudit({
      action: 'CANCEL_VOUCHER',
      entityType: cancelTarget.collection,
      summary: `إلغاء السند ${cancelTarget.refNo} (${cancelTarget.lines.length} بنود) — ${cancelReason.trim()}`,
      risk: 'high',
      refNo: cancelTarget.refNo,
      warehouse: cancelTarget.warehouse,
      itemCount: cancelTarget.lines.length,
    });
    notify(`تم إلغاء السند ${cancelTarget.refNo} وتحديث دفتر الأرصدة تلقائياً`, 'warn');
    setCancelTarget(null);
    setCancelReason('');
  };

  const handleManualESign = async (doc: GroupedVoucherRow) => {
    const sig = await signDocumentPayload({
      refNo: doc.refNo,
      date: doc.date,
      warehouse: doc.warehouse,
      totalQty: doc.totalBaseQty,
      signer: currentUser?.name ?? 'القائد',
    });
    logAudit({
      action: 'MANUAL_ESIGN',
      entityType: doc.collection,
      summary: `توقيع إلكتروني يدوي للقائد على السند ${doc.refNo} (${doc.lines.length} بنود)`,
      risk: 'sensitive',
      refNo: doc.refNo,
      warehouse: doc.warehouse,
      itemCount: doc.lines.length,
    });
    setEsignPreview({ refNo: doc.refNo, sig });
  };

  const cols: ImdColumn<GroupedVoucherRow>[] = [
    {
      key: 'ref',
      header: 'رقم السند',
      sortValue: (r) => r.refNo,
      render: (r) => <span className="font-mono-num font-semibold">{r.refNo}</span>,
    },
    { key: 'kind', header: 'النوع', sortValue: (r) => r.kindLabel, render: (r) => r.kindLabel },
    { key: 'date', header: 'التاريخ', numeric: true, sortValue: (r) => r.date, render: (r) => r.date },
    { key: 'wh', header: 'المستودع', sortValue: (r) => r.warehouse, render: (r) => r.warehouse },
    {
      key: 'items',
      header: 'الأصناف والمحتوى',
      render: (r) =>
        r.lines.length === 1 ? (
          <span>
            {r.lines[0].itemName} ({fmt(r.lines[0].qty)} {r.lines[0].unitName})
          </span>
        ) : (
          <div>
            <strong>{fmt(r.lines.length, 0)} أصناف: </strong>
            <span className="text-[var(--imd-muted)]">
              {r.lines
                .slice(0, 2)
                .map((l) => l.itemName)
                .join('، ')}
              {r.lines.length > 2 ? ` (+${r.lines.length - 2})` : ''}
            </span>
          </div>
        ),
    },
    {
      key: 'qty',
      header: 'إجمالي الأساس',
      numeric: true,
      render: (r) => (
        <span>
          {fmt(r.totalBaseQty)}
          {r.totalEdits > 0 && (
            <span className="mr-1 text-[10px] text-[var(--imd-warn)]">(معدّل ×{r.totalEdits})</span>
          )}
        </span>
      ),
    },
    { key: 'party', header: 'الطرف المقابل', render: (r) => r.party },
    {
      key: 'status',
      header: 'الحالة',
      render: (r) => (
        <ImdStatusText
          label={
            r.status === 'CANCELLED'
              ? 'ملغي'
              : r.status === 'PENDING'
              ? 'قيد التسليم'
              : r.status === 'REJECTED'
              ? 'مرفوض'
              : r.status === 'DRAFT'
              ? 'مسودة'
              : 'معتمد'
          }
          tone={
            r.status === 'CANCELLED' || r.status === 'REJECTED'
              ? 'danger'
              : r.status === 'PENDING' || r.status === 'DRAFT'
              ? 'warn'
              : 'success'
          }
        />
      ),
    },
    {
      key: 'act',
      header: 'إجراءات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <ImdButton
            size="sm"
            variant="ghost"
            title="طباعة وتبديل النسخ والمقاس"
            onClick={() =>
              openPrintPreview({
                formKey: r.collection,
                space: 'supply',
                title: r.kindLabel,
                refNo: r.refNo,
                date: r.date,
                warehouse: r.warehouse,
                partyLabel: 'الطرف المقابل',
                partyValue: r.party,
                receiverName: r.receiverName,
                notes: r.notes,
                opType: r.kindLabel,
                columns: ['الصنف', 'الوحدة', 'الكمية', 'الأساس'],
                rows: r.lines.map((l) => [l.itemName, l.unitName, fmt(l.qty), fmt(l.baseQty)]),
                totalQty: r.totalBaseQty,
                actorName: currentUser?.name ?? '',
              })
            }
          >
            <Printer className="w-3.5 h-3.5" />
          </ImdButton>
          <ImdButton
            size="sm"
            variant="ghost"
            title="إيصال حراري"
            onClick={() =>
              openPrintPreview({
                formKey: r.collection,
                space: 'supply',
                title: r.kindLabel,
                refNo: r.refNo,
                date: r.date,
                warehouse: r.warehouse,
                partyLabel: 'الطرف',
                partyValue: r.party,
                receiverName: r.receiverName,
                opType: r.kindLabel,
                columns: ['الصنف', 'الكمية', 'الوحدة'],
                rows: r.lines.map((l) => [l.itemName, fmt(l.qty), l.unitName]),
                totalQty: r.totalBaseQty,
                actorName: currentUser?.name ?? '',
                paperSize: 'THERMAL_80',
              })
            }
          >
            <ReceiptText className="w-3.5 h-3.5" />
          </ImdButton>
          {r.status !== 'CANCELLED' && (
            <>
              <ImdButton
                size="sm"
                variant="ghost"
                title="تعديل السند المحفوظ (DocumentEdit)"
                onClick={() => openEditModal(r)}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </ImdButton>
              <ImdButton
                size="sm"
                variant="ghost"
                title="توقيع إلكتروني يدوي (ESign)"
                onClick={() => handleManualESign(r)}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--imd-accent)]" />
              </ImdButton>
              <ImdButton
                size="sm"
                variant="ghost"
                title="إلغاء السند"
                onClick={() => {
                  setCancelReason('');
                  setCancelTarget(r);
                }}
              >
                <Ban className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
              </ImdButton>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <ImdPage
      title="سجل المستندات والسندات"
      subtitle="سندات مجمّعة برقم المرجع (refNo) · تعديل مع سجل فروق (DocumentEdit) · توقيع إلكتروني يدوي · إلغاء وطباعة كاملة"
    >
      <ImdPanel>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <ImdFld label="بحث سريع" value={search} onChange={setSearch} placeholder="رقم السند، الصنف، الطرف..." />
          <ImdSelect
            label="نوع السند"
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: 'ALL', label: 'جميع السندات' },
              { value: 'receipts', label: 'سندات الاستلام' },
              { value: 'issues', label: 'سندات الصرف' },
              { value: 'transfers', label: 'سندات التحويل' },
              { value: 'returns', label: 'سندات المرتجع' },
            ]}
          />
          <ImdSelect
            label="الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'الكل' },
              { value: 'COMPLETED', label: 'معتمد' },
              { value: 'DRAFT', label: 'مسودة' },
              { value: 'PENDING', label: 'قيد التسليم' },
              { value: 'RECEIVED', label: 'مستلم' },
              { value: 'REJECTED', label: 'مرفوض' },
              { value: 'CANCELLED', label: 'ملغي' },
            ]}
          />
          <ImdFld label="من تاريخ" type="date" value={dateFrom} onChange={setDateFrom} />
          <ImdFld label="إلى تاريخ" type="date" value={dateTo} onChange={setDateTo} />
        </div>
        <ImdTable columns={cols} rows={docs} rowKey={(r) => r.groupKey} enableColumnFilter />
      </ImdPanel>

      {/* DocumentEdit Modal */}
      <ImdModal
        open={Boolean(editGroup)}
        onClose={() => setEditGroup(null)}
        title={`تعديل السند المحفوظ — ${editGroup?.refNo ?? ''}`}
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditGroup(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleConfirmEdit}>اعتماد التعديل وتطبيق الفرق على الرصيد</ImdButton>
          </>
        }
      >
        {editGroup && activeEditLine && (
          <div className="space-y-3">
            {editGroup.lines.length > 1 && (
              <ImdSelect
                label="اختر البند المراد تعديله داخل السند"
                value={activeEditLine.id}
                onChange={handleSelectEditLine}
                options={editGroup.lines.map((l) => ({
                  value: l.id,
                  label: `${l.itemName} (${fmt(l.qty)} ${l.unitName})`,
                }))}
              />
            )}
            <ImdNote tone="info">
              الصنف: <strong>{activeEditLine.itemName}</strong> · الكمية الحالية:{' '}
              <strong>{fmt(activeEditLine.qty)} {activeEditLine.unitName}</strong> ({fmt(activeEditLine.baseQty)} أساس)
            </ImdNote>
            <ImdFld label={`الكمية الجديدة (${activeEditLine.unitName})`} type="number" value={editQty} onChange={setEditQty} />
            <ImdFld label="الملاحظات" value={editNotes} onChange={setEditNotes} />
            <ImdFld label="سبب التعديل (يُسجّل في editLog)" value={editSummary} onChange={setEditSummary} placeholder="مثال: تصحيح خطأ إدخال..." />
            {activeEditLine.editLog.length > 0 && (
              <div className="border-t border-[var(--imd-line)] pt-2 text-xs space-y-1">
                <div className="font-bold">سجل التعديلات السابقة لهذا البند:</div>
                {activeEditLine.editLog.map((el, i) => (
                  <div key={i} className="text-[var(--imd-muted)]">
                    • {el.at.slice(0, 16)} — {el.by}: {el.summary}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ImdModal>

      {/* Manual ESign Modal */}
      <ImdModal
        open={Boolean(esignPreview)}
        onClose={() => setEsignPreview(null)}
        title={`التوقيع الإلكتروني الرسمي — ${esignPreview?.refNo ?? ''}`}
        widthClass="max-w-lg"
        footer={<ImdButton variant="primary" onClick={() => setEsignPreview(null)}>تم</ImdButton>}
      >
        {esignPreview && (
          <div className="space-y-2">
            <ImdNote tone="success" title="تم ختم السند بتوقيع ECDSA P-256 المعتمد">
              <div className="font-mono text-xs break-all mt-1">{esignPreview.sig}</div>
            </ImdNote>
          </div>
        )}
      </ImdModal>

      {/* Cancel Modal */}
      <ImdModal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`إلغاء السند ${cancelTarget?.refNo ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setCancelTarget(null)}>تراجع</ImdButton>
            <ImdButton variant="danger" onClick={handleConfirmCancel}>تأكيد الإلغاء وعكس الرصيد</ImdButton>
          </>
        }
      >
        <div className="space-y-2">
          {cancelTarget && cancelTarget.lines.length > 1 && (
            <ImdNote tone="note">
              سيتم إلغاء كافة بنود السند ({fmt(cancelTarget.lines.length, 0)} أصناف) وعكسها في دفتر الأرصدة.
            </ImdNote>
          )}
          <ImdFld
            label="سبب الإلغاء الإلزامي"
            value={cancelReason}
            onChange={setCancelReason}
            placeholder="اكتب سبب الإلزام للتدقيق..."
          />
        </div>
      </ImdModal>
    </ImdPage>
  );
};
