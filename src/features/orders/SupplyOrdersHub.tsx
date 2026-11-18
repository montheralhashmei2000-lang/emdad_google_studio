// Supply Orders Hub (Part 2: MAIN vs BRANCH RationKind + Editable ApprovedQty Modal + Fulfill via Receipt or Transfer)

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Plus, Printer, Trash2, XCircle } from 'lucide-react';
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
import { Ids } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import { validateMakerChecker } from '../../domain/accessControl';
import { getWarehouseItemStock } from '../../domain/stockLedger';
import type { Issue, RationOrder, RationOrderLine, Receipt, Transfer } from '../../domain/types';

interface DraftOrderLine {
  id: string;
  itemId: string;
  unitName: string;
  factor: number;
  qty: number;
}

export const SupplyOrdersHub: React.FC = () => {
  const { db, currentUser, ledger, navIntent, clearNavIntent, upsertRow, mutateDb, nextDocRef, logAudit, notify, openPrintPreview, fmt } =
    useEmdad();
  const [tab, setTab] = useState<'orders' | 'pending'>('orders');
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectIssueGroup, setRejectIssueGroup] = useState<{ refNo: string; lines: Issue[] } | null>(null);
  const [rejectIssueReason, setRejectIssueReason] = useState('');

  // Reject Ration Order modal
  const [rejectOrderTarget, setRejectOrderTarget] = useState<RationOrder | null>(null);
  const [rejectOrderReason, setRejectOrderReason] = useState('');

  // Order details modal
  const [detailOrder, setDetailOrder] = useState<RationOrder | null>(null);

  const [orderKind, setOrderKind] = useState<'BRANCH' | 'MAIN'>('BRANCH');
  const [reqWh, setReqWh] = useState(db.warehouses[1]?.name ?? db.warehouses[0]?.name ?? '');
  const [supWh, setSupWh] = useState(db.warehouses[0]?.name ?? '');
  const [priority, setPriority] = useState<'عادي' | 'عاجل' | 'فوري'>('عادي');
  const [authId, setAuthId] = useState(db.supply_authorities[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  const makeInitialLine = (): DraftOrderLine => {
    const first = db.items[0];
    const u = first?.units[0];
    return {
      id: Ids.next('drl'),
      itemId: first?.id ?? '',
      unitName: u?.name ?? first?.baseUnit ?? '',
      factor: u?.factor ?? 1,
      qty: 10,
    };
  };
  const [draftLines, setDraftLines] = useState<DraftOrderLine[]>(() => [makeInitialLine()]);

  // Approve modal with editable approvedQty
  const [approveTarget, setApproveTarget] = useState<RationOrder | null>(null);
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'supplyOrders') return;
    if (navIntent.subTab === 'orders' || navIntent.subTab === 'pending') {
      setTab(navIntent.subTab);
    }
    if (navIntent.focusId) {
      const target = db.ration_orders.find((o) => o.id === navIntent.focusId);
      if (target) setDetailOrder(target);
    }
    if (navIntent.prefillItemId) {
      const it = db.items.find((i) => i.id === navIntent.prefillItemId);
      if (it) {
        const u = it.units[0];
        setDraftLines([
          {
            id: Ids.next('drl'),
            itemId: it.id,
            unitName: u?.name ?? it.baseUnit,
            factor: u?.factor ?? 1,
            qty: Math.max(1, Math.round(it.minQty / Math.max(1, u?.factor ?? 1))),
          },
        ]);
        if (navIntent.prefillWarehouse) setReqWh(navIntent.prefillWarehouse);
        setPriority('عاجل');
        setNotes(`طلب تعزيز فوري بناءً على تنبيه كفاية المخزون لصنف «${it.name}»`);
        setModalOpen(true);
      }
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent, db.items, db.ration_orders]);

  const handleOpenCreateModal = () => {
    setDraftLines([makeInitialLine()]);
    setNotes('');
    setModalOpen(true);
  };

  const handleCreateOrder = () => {
    const validLines = draftLines.filter((dl) => {
      const it = db.items.find((i) => i.id === dl.itemId);
      return Boolean(it && dl.qty > 0);
    });
    if (validLines.length === 0) {
      notify('أضف صنفاً واحداً على الأقل بكمية صحيحة', 'danger');
      return;
    }
    const refNo = nextDocRef('rationOrder');
    const auth = db.supply_authorities.find((a) => a.id === authId);
    const now = new Date().toISOString();
    const orderId = Ids.next('ro');
    const order: RationOrder = {
      id: orderId,
      refNo,
      requestingWarehouse: reqWh,
      supplyingWarehouse: orderKind === 'MAIN' ? auth?.name ?? 'التموين المركزي' : supWh,
      date: todayIso(),
      requiredDate: todayIso(),
      status: 'PENDING',
      priority,
      orderKind,
      authorityId: authId,
      authorityName: auth?.name ?? '',
      receiptRef: '',
      fulfillRef: '',
      fulfillKind: '',
      fulfillDate: '',
      notes,
      rejectReason: '',
      createdBy: currentUser?.name ?? '',
      approvedBy: '',
      receivedBy: '',
      createdAt: now,
      updatedAt: now,
    };
    const lines: RationOrderLine[] = validLines.map((dl) => {
      const it = db.items.find((i) => i.id === dl.itemId)!;
      const u = it.units.find((x) => x.name === dl.unitName) ?? it.units[0];
      const factor = u?.factor ?? dl.factor ?? 1;
      return {
        id: Ids.next('rol'),
        orderId,
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        unitName: u?.name ?? dl.unitName ?? it.baseUnit,
        factor,
        requestedQty: dl.qty,
        approvedQty: 0,
        receivedQty: 0,
        notes: '',
      };
    });
    const totalBase = lines.reduce((s, l) => s + l.requestedQty * l.factor, 0);
    mutateDb((prev) => ({
      ...prev,
      ration_orders: [order, ...prev.ration_orders],
      ration_order_lines: [...lines, ...prev.ration_order_lines],
    }));
    logAudit({
      action: 'CREATE_RATION_ORDER',
      entityType: 'ration_orders',
      summary: `إنشاء طلبية ${orderKind === 'MAIN' ? 'رئيسية (MAIN)' : 'فرع (BRANCH)'} ${refNo} (${lines.length} أصناف)`,
      refNo,
      warehouse: reqWh,
      qty: totalBase,
      itemCount: lines.length,
    });
    notify(`تم إرسال طلبية الإعاشة ${refNo} (${lines.length} أصناف)`, 'success');
    setModalOpen(false);
  };

  const openApproveModal = (order: RationOrder) => {
    const mc = validateMakerChecker({
      createdBy: order.createdBy,
      actorName: currentUser?.name ?? '',
      actorRole: currentUser?.role ?? 'user',
      allowOwnerSelfApprove: true,
    });
    if (!mc.allowed) {
      notify(mc.reason, 'danger');
      return;
    }
    const ls = db.ration_order_lines.filter((l) => l.orderId === order.id);
    const map: Record<string, number> = {};
    ls.forEach((l) => {
      map[l.id] = l.approvedQty || l.requestedQty;
    });
    setApprovedQtys(map);
    setApproveTarget(order);
  };

  const handleConfirmApprove = () => {
    if (!approveTarget) return;
    const now = new Date().toISOString();
    mutateDb((prev) => ({
      ...prev,
      ration_orders: prev.ration_orders.map((o) =>
        o.id === approveTarget.id
          ? { ...o, status: 'APPROVED', approvedBy: currentUser?.name ?? '', updatedAt: now }
          : o
      ),
      ration_order_lines: prev.ration_order_lines.map((l) =>
        l.orderId === approveTarget.id
          ? { ...l, approvedQty: Math.max(0, approvedQtys[l.id] ?? l.requestedQty) }
          : l
      ),
    }));
    logAudit({
      action: 'APPROVE_RATION_ORDER',
      entityType: 'ration_orders',
      summary: `اعتماد طلبية الإعاشة ${approveTarget.refNo} بالكميات المعدّلة`,
      refNo: approveTarget.refNo,
      warehouse: approveTarget.supplyingWarehouse,
    });
    notify(`تم اعتماد الطلبية ${approveTarget.refNo}`, 'success');
    setApproveTarget(null);
  };

  const fulfillOrder = (order: RationOrder) => {
    const lines = db.ration_order_lines.filter((l) => l.orderId === order.id);
    const now = new Date().toISOString();

    if (order.orderKind === 'MAIN') {
      const recRef = nextDocRef('receipt');
      const newReceipts: Receipt[] = lines.map((l) => ({
        id: Ids.next('rec'),
        refNo: recRef,
        date: todayIso(),
        warehouse: order.requestingWarehouse,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        unitName: l.unitName,
        factor: l.factor,
        qty: l.approvedQty || l.requestedQty,
        baseQty: (l.approvedQty || l.requestedQty) * l.factor,
        status: 'COMPLETED',
        notes: `مطابقة طلبية رئيسية ${order.refNo}`,
        createdBy: currentUser?.name ?? '',
        createdAt: now,
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
        supplier: order.authorityName || order.supplyingWarehouse,
        invoiceNo: order.refNo,
        committee: 'لجنة الاستلام',
        supervision: '',
        audit: '',
        expiryDate: '',
        cylinderAction: '',
      }));
      mutateDb((prev) => ({
        ...prev,
        receipts: [...newReceipts, ...prev.receipts],
        ration_order_lines: prev.ration_order_lines.map((l) =>
          l.orderId === order.id ? { ...l, receivedQty: l.approvedQty || l.requestedQty } : l
        ),
        ration_orders: prev.ration_orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: 'RECEIVED',
                receiptRef: recRef,
                fulfillRef: recRef,
                fulfillKind: 'RECEIPT',
                fulfillDate: todayIso(),
                receivedBy: currentUser?.name ?? '',
                updatedAt: now,
              }
            : o
        ),
      }));
      logAudit({
        action: 'FULFILL_RATION_ORDER',
        entityType: 'ration_orders',
        summary: `تنفيذ الطلبية الرئيسية ${order.refNo} بسند توريد ${recRef}`,
        refNo: recRef,
        warehouse: order.requestingWarehouse,
      });
      notify(`تم تنفيذ الطلبية الرئيسية ${order.refNo} بسند استلام ${recRef}`, 'success');
    } else {
      const trRef = nextDocRef('transfer');
      const newTransfers: Transfer[] = lines.map((l) => ({
        id: Ids.next('tr'),
        refNo: trRef,
        date: todayIso(),
        warehouse: order.supplyingWarehouse,
        destWarehouse: order.requestingWarehouse,
        campId: '',
        campName: '',
        strength: 0,
        durationDays: 15,
        rejectReason: '',
        cylinderAction: '',
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        unitName: l.unitName,
        factor: l.factor,
        qty: l.approvedQty || l.requestedQty,
        baseQty: (l.approvedQty || l.requestedQty) * l.factor,
        status: 'PENDING',
        notes: `تنفيذ طلبية فرع ${order.refNo}`,
        createdBy: currentUser?.name ?? '',
        createdAt: now,
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
      }));
      mutateDb((prev) => ({
        ...prev,
        transfers: [...newTransfers, ...prev.transfers],
        ration_order_lines: prev.ration_order_lines.map((l) =>
          l.orderId === order.id ? { ...l, receivedQty: l.approvedQty || l.requestedQty } : l
        ),
        ration_orders: prev.ration_orders.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: 'RECEIVED',
                fulfillRef: trRef,
                fulfillKind: 'TRANSFER',
                fulfillDate: todayIso(),
                receivedBy: currentUser?.name ?? '',
                updatedAt: now,
              }
            : o
        ),
      }));
      logAudit({
        action: 'FULFILL_RATION_ORDER',
        entityType: 'ration_orders',
        summary: `تنفيذ طلبية الفرع ${order.refNo} بإذن تحويل ${trRef}`,
        refNo: trRef,
        warehouse: order.supplyingWarehouse,
      });
      notify(`تم تنفيذ طلبية الفرع ${order.refNo} بإذن تحويل ${trRef} (قيد التسليم)`, 'success');
    }
  };

  const handleConfirmRejectOrder = () => {
    if (!rejectOrderTarget || !rejectOrderReason.trim()) {
      notify('يرجى إدخال سبب رفض الطلبية', 'danger');
      return;
    }
    const reason = rejectOrderReason.trim();
    upsertRow('ration_orders', {
      ...rejectOrderTarget,
      status: 'REJECTED',
      rejectReason: reason,
      updatedAt: new Date().toISOString(),
    });
    logAudit({
      action: 'REJECT_RATION_ORDER',
      entityType: 'ration_orders',
      summary: `رفض طلبية الإعاشة ${rejectOrderTarget.refNo}: ${reason}`,
      risk: 'sensitive',
      refNo: rejectOrderTarget.refNo,
      warehouse: rejectOrderTarget.supplyingWarehouse,
    });
    notify(`تم رفض الطلبية ${rejectOrderTarget.refNo}`, 'warn');
    setRejectOrderTarget(null);
    setRejectOrderReason('');
  };

  const rows = useMemo(() => {
    if (tab === 'pending') {
      return db.ration_orders.filter((o) => o.status === 'PENDING' || o.status === 'APPROVED');
    }
    return db.ration_orders;
  }, [tab, db.ration_orders]);

  const cols: ImdColumn<RationOrder>[] = [
    {
      key: 'ref',
      header: 'رقم الطلبية',
      render: (r) => (
        <button
          type="button"
          onClick={() => setDetailOrder(r)}
          className="font-mono-num font-semibold text-[var(--imd-accent)] hover:underline cursor-pointer"
        >
          {r.refNo}
        </button>
      ),
    },
    { key: 'kind', header: 'النوع', render: (r) => (r.orderKind === 'MAIN' ? 'رئيسية (MAIN -> توريد)' : 'فرع (BRANCH -> تحويل)') },
    { key: 'date', header: 'التاريخ', numeric: true, render: (r) => r.date },
    { key: 'req', header: 'المستودع الطالب', render: (r) => r.requestingWarehouse },
    { key: 'sup', header: 'جهة التموين', render: (r) => r.supplyingWarehouse },
    {
      key: 'lines',
      header: 'الأصناف',
      render: (r) => {
        const ls = db.ration_order_lines.filter((l) => l.orderId === r.id);
        return ls
          .map((l) => `${l.itemName} (طلب:${fmt(l.requestedQty)}${l.approvedQty ? `/معتمد:${fmt(l.approvedQty)}` : ''})`)
          .join('، ');
      },
    },
    {
      key: 'st',
      header: 'الحالة',
      render: (r) => (
        <ImdStatusText
          label={
            r.status === 'PENDING'
              ? 'معلّقة'
              : r.status === 'APPROVED'
              ? 'معتمدة'
              : r.status === 'RECEIVED'
              ? 'منفّذة'
              : r.status === 'REJECTED'
              ? 'مرفوضة'
              : 'مسودة'
          }
          tone={
            r.status === 'RECEIVED'
              ? 'success'
              : r.status === 'REJECTED'
              ? 'danger'
              : r.status === 'APPROVED'
              ? 'info'
              : 'warn'
          }
        />
      ),
    },
    {
      key: 'act',
      header: 'الإجراءات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <ImdButton size="sm" variant="ghost" title="عرض تفاصيل الطلبية" onClick={() => setDetailOrder(r)}>
            <Eye className="w-3.5 h-3.5" />
          </ImdButton>
          {r.status === 'PENDING' && (
            <>
              <ImdButton size="sm" variant="primary" onClick={() => openApproveModal(r)}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>مراجعة واعتماد</span>
              </ImdButton>
              <ImdButton
                size="sm"
                variant="ghost"
                title="رفض الطلبية"
                onClick={() => {
                  setRejectOrderTarget(r);
                  setRejectOrderReason('');
                }}
              >
                <XCircle className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
              </ImdButton>
            </>
          )}
          {r.status === 'APPROVED' && (
            <ImdButton size="sm" variant="orange" onClick={() => fulfillOrder(r)}>
              <span>{r.orderKind === 'MAIN' ? 'مطابقة بسند توريد' : 'توليد إذن تحويل'}</span>
            </ImdButton>
          )}
          <ImdButton
            size="sm"
            variant="ghost"
            title="طباعة الطلبية"
            onClick={() => {
              const ls = db.ration_order_lines.filter((l) => l.orderId === r.id);
              openPrintPreview({
                formKey: 'ration_order',
                space: 'supply',
                title: 'طلبية إعاشة وتموين',
                refNo: r.refNo,
                date: r.date,
                warehouse: r.requestingWarehouse,
                partyLabel: 'جهة التموين',
                partyValue: r.supplyingWarehouse,
                notes: r.notes,
                opType: 'طلبية إعاشة',
                columns: ['الصنف', 'الوحدة', 'المطلوب', 'المعتمد'],
                rows: ls.map((l) => [l.itemName, l.unitName, fmt(l.requestedQty), fmt(l.approvedQty || l.requestedQty)]),
                totalQty: ls.reduce((s, l) => s + l.requestedQty * l.factor, 0),
                actorName: currentUser?.name ?? '',
              });
            }}
          >
            <Printer className="w-3.5 h-3.5" />
          </ImdButton>
        </div>
      ),
    },
  ];

  const approveLines = approveTarget
    ? db.ration_order_lines.filter((l) => l.orderId === approveTarget.id)
    : [];

  const detailLines = detailOrder
    ? db.ration_order_lines.filter((l) => l.orderId === detailOrder.id)
    : [];

  const orderIssueGroups = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of db.issues) {
      if (i.status !== 'ORDER') continue;
      const key = i.refNo || i.id;
      const list = map.get(key) ?? [];
      list.push(i);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [db.issues]);

  const handleApproveDirectedIssue = (refNo: string, group: Issue[]) => {
    const first = group[0];
    if (!first) return;
    if (db.stocktakes.some((s) => s.status === 'COUNTING' && s.freeze && s.warehouse === first.warehouse)) {
      notify(`المستودع «${first.warehouse}» مجمّد بأمر جرد نشط`, 'danger');
      return;
    }
    for (const ln of group) {
      const avail = getWarehouseItemStock(ledger, first.warehouse, ln.itemId);
      if (avail < ln.baseQty) {
        notify(`رصيد «${ln.itemName}» في ${first.warehouse} غير كافٍ (${fmt(avail)} من أصل ${fmt(ln.baseQty)})`, 'danger');
        return;
      }
    }
    const ids = new Set(group.map((g) => g.id));
    mutateDb((prev) => ({
      ...prev,
      issues: prev.issues.map((i) =>
        ids.has(i.id)
          ? { ...i, status: 'COMPLETED', prevStatus: 'ORDER', approvedBy: currentUser?.name ?? i.approvedBy }
          : i
      ),
    }));
    logAudit({
      action: 'ISSUE_DRAFT_APPROVED',
      entityType: 'issues',
      summary: `اعتماد أمر صرف معلّق ${refNo} وخصم الرصيد من ${first.warehouse}`,
      refNo,
      warehouse: first.warehouse,
      target: first.recipientDisplay,
      itemCount: group.length,
    });
    notify(`تم اعتماد أمر الصرف ${refNo} وخصم الرصيد`, 'success');
  };

  const handleConfirmRejectDirectedIssue = () => {
    if (!rejectIssueGroup || !rejectIssueReason.trim()) {
      notify('يرجى كتابة سبب رفض الأمر', 'danger');
      return;
    }
    const { refNo, lines } = rejectIssueGroup;
    const ids = new Set(lines.map((g) => g.id));
    mutateDb((prev) => ({
      ...prev,
      issues: prev.issues.map((i) =>
        ids.has(i.id)
          ? {
              ...i,
              status: 'REJECTED',
              prevStatus: 'ORDER',
              rejectReason: rejectIssueReason.trim(),
              rejectedBy: currentUser?.name ?? '',
            }
          : i
      ),
    }));
    logAudit({
      action: 'ISSUE_ORDER_REJECTED',
      entityType: 'issues',
      summary: `رفض أمر الصرف الموجه ${refNo}: ${rejectIssueReason.trim()}`,
      risk: 'sensitive',
      refNo,
      warehouse: lines[0]?.warehouse ?? '',
    });
    notify(`تم رفض أمر الصرف ${refNo}`, 'warn');
    setRejectIssueGroup(null);
    setRejectIssueReason('');
  };

  return (
    <ImdPage
      title="الطلبيات وأوامر التوريد"
      subtitle="طلبيات الفروع (BRANCH -> تحويل) والطلبيات الرئيسية (MAIN -> مطابقة توريد) مع تعديل الكميات المعتمدة"
      actions={
        <ImdButton variant="primary" onClick={handleOpenCreateModal}>
          <Plus className="w-4 h-4" />
          <span>طلبية إعاشة جديدة</span>
        </ImdButton>
      }
    >
      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as 'orders' | 'pending')}
        tabs={[
          { id: 'orders', label: 'طلبيات الإعاشة', count: db.ration_orders.length },
          {
            id: 'pending',
            label: 'أوامر التوريد المعلقة',
            count:
              db.ration_orders.filter((o) => o.status === 'PENDING' || o.status === 'APPROVED').length +
              orderIssueGroups.length,
          },
        ]}
      />

      <ImdPanel>
        <ImdTable columns={cols} rows={rows} rowKey={(r) => r.id} />
      </ImdPanel>

      {tab === 'pending' && (
        <ImdPanel
          title="أوامر الصرف الموجّهة المعلقة (PendingScreen)"
          subtitle="أوامر الصرف الموجّهة من الإدارة بانتظار اعتماد أمين المستودع أو رفضها مع كتابة المبررات"
        >
          {orderIssueGroups.length === 0 ? (
            <div className="text-xs text-[var(--imd-muted)] py-4 text-center">
              لا توجد أوامر صرف موجّهة معلقة حالياً
            </div>
          ) : (
            <div className="space-y-3">
              {orderIssueGroups.map(([refNo, grp]) => {
                const f = grp[0];
                return (
                  <div
                    key={refNo}
                    className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] space-y-2"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono-num font-bold">{refNo}</span>
                        <span className="font-bold">{f.recipientDisplay || '—'}</span>
                        <span className="text-[var(--imd-muted)]">· {f.date} · {f.warehouse} · {grp.length} صنف</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ImdButton size="sm" variant="primary" onClick={() => handleApproveDirectedIssue(refNo, grp)}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اعتماد الصرف وخصم الرصيد</span>
                        </ImdButton>
                        <ImdButton
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setRejectIssueGroup({ refNo, lines: grp });
                            setRejectIssueReason('');
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>رفض الأمر</span>
                        </ImdButton>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--imd-text2)] leading-relaxed">
                      {grp.map((g, idx) => (
                        <span key={g.id}>
                          {idx > 0 ? ' · ' : ''}
                          {g.itemName} <strong>{fmt(g.qty)}</strong> {g.unitName}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ImdPanel>
      )}

      {/* Multi-line Create Ration Order Modal */}
      <ImdModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="إنشاء طلبية إعاشة جديدة (متعددة الأصناف)"
        widthClass="max-w-3xl"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleCreateOrder}>إرسال الطلبية ({draftLines.length} أصناف)</ImdButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ImdSelect
              label="نوع الطلبية (RationKind)"
              value={orderKind}
              onChange={(v) => setOrderKind(v as 'BRANCH' | 'MAIN')}
              options={[
                { value: 'BRANCH', label: 'BRANCH (طلبية فرع من المخزن الرئيسي -> تحويل)' },
                { value: 'MAIN', label: 'MAIN (طلبية الرئيسي من القيادة -> توريد)' },
              ]}
            />
            <ImdSelect
              label="المستودع الطالب"
              value={reqWh}
              onChange={setReqWh}
              options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
            />
            {orderKind === 'BRANCH' ? (
              <ImdSelect
                label="المستودع المموّن"
                value={supWh}
                onChange={setSupWh}
                options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
              />
            ) : (
              <ImdSelect
                label="جهة الاعتماد العليا (SupplyAuthorities)"
                value={authId}
                onChange={setAuthId}
                options={db.supply_authorities.map((a) => ({ value: a.id, label: a.name }))}
              />
            )}
            <ImdSelect
              label="الأولوية"
              value={priority}
              onChange={(v) => setPriority(v as 'عادي' | 'عاجل' | 'فوري')}
              options={[
                { value: 'عادي', label: 'عادي' },
                { value: 'عاجل', label: 'عاجل' },
                { value: 'فوري', label: 'فوري' },
              ]}
            />
            <ImdFld label="ملاحظات" value={notes} onChange={setNotes} className="md:col-span-2" />
          </div>

          <div className="pt-3 border-t border-[var(--imd-line)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--imd-text2)]">بنود الأصناف المطلوبة</span>
              <ImdButton
                size="sm"
                variant="secondary"
                onClick={() => setDraftLines((prev) => [...prev, makeInitialLine()])}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف آخر</span>
              </ImdButton>
            </div>
            <div className="space-y-2">
              {draftLines.map((ln, idx) => {
                const it = db.items.find((i) => i.id === ln.itemId) ?? db.items[0];
                const units = it?.units ?? [{ name: it?.baseUnit ?? 'كجم', factor: 1, isBase: true }];
                return (
                  <div
                    key={ln.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-2 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div className="md:col-span-5">
                      <ImdSelect
                        label={`الصنف #${idx + 1}`}
                        value={ln.itemId}
                        onChange={(newItemId) => {
                          const targetIt = db.items.find((i) => i.id === newItemId);
                          const u0 = targetIt?.units[0];
                          setDraftLines((prev) =>
                            prev.map((x) =>
                              x.id === ln.id
                                ? {
                                    ...x,
                                    itemId: newItemId,
                                    unitName: u0?.name ?? targetIt?.baseUnit ?? '',
                                    factor: u0?.factor ?? 1,
                                  }
                                : x
                            )
                          );
                        }}
                        options={db.items.map((i) => ({ value: i.id, label: `${i.code} — ${i.name}` }))}
                        searchable
                      />
                    </div>
                    <div className="md:col-span-3">
                      <ImdSelect
                        label="الوحدة"
                        value={ln.unitName}
                        onChange={(uName) => {
                          const matched = units.find((u) => u.name === uName);
                          setDraftLines((prev) =>
                            prev.map((x) =>
                              x.id === ln.id
                                ? { ...x, unitName: uName, factor: matched?.factor ?? 1 }
                                : x
                            )
                          );
                        }}
                        options={units.map((u) => ({
                          value: u.name,
                          label: u.factor > 1 ? `${u.name} (×${u.factor})` : u.name,
                        }))}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <ImdFld
                        label="الكمية"
                        type="number"
                        value={ln.qty}
                        onChange={(v) =>
                          setDraftLines((prev) =>
                            prev.map((x) =>
                              x.id === ln.id ? { ...x, qty: Math.max(0, Number(v) || 0) } : x
                            )
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        disabled={draftLines.length <= 1}
                        title="حذف السطر"
                        onClick={() =>
                          setDraftLines((prev) =>
                            prev.length > 1 ? prev.filter((x) => x.id !== ln.id) : prev
                          )
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ImdModal>

      {/* Order Details Modal */}
      <ImdModal
        open={Boolean(detailOrder)}
        onClose={() => setDetailOrder(null)}
        title={`تفاصيل طلبية الإعاشة — ${detailOrder?.refNo ?? ''}`}
        widthClass="max-w-3xl"
        footer={<ImdButton variant="primary" onClick={() => setDetailOrder(null)}>إغلاق</ImdButton>}
      >
        {detailOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <div>
                <div className="text-[var(--imd-muted)]">نوع الطلبية</div>
                <div className="font-bold mt-0.5">{detailOrder.orderKind === 'MAIN' ? 'رئيسية (MAIN)' : 'فرع (BRANCH)'}</div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">التاريخ والأولوية</div>
                <div className="font-bold mt-0.5 tabular-nums">{detailOrder.date} · {detailOrder.priority}</div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">المستودع الطالب</div>
                <div className="font-bold mt-0.5">{detailOrder.requestingWarehouse}</div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">جهة التموين</div>
                <div className="font-bold mt-0.5">{detailOrder.supplyingWarehouse}</div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">مُنشئ الطلبية</div>
                <div className="font-semibold mt-0.5">{detailOrder.createdBy || '—'}</div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">المعتمد</div>
                <div className="font-semibold mt-0.5">{detailOrder.approvedBy || '—'}</div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">مرجع التنفيذ</div>
                <div className="font-mono-num font-semibold mt-0.5">
                  {detailOrder.fulfillRef ? `${detailOrder.fulfillRef} (${detailOrder.fulfillKind})` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[var(--imd-muted)]">الحالة</div>
                <div className="font-bold mt-0.5">{detailOrder.status}</div>
              </div>
              {detailOrder.rejectReason && (
                <div className="col-span-2 md:col-span-4 text-[var(--imd-danger)] font-semibold">
                  سبب الرفض: {detailOrder.rejectReason}
                </div>
              )}
              {detailOrder.notes && (
                <div className="col-span-2 md:col-span-4 text-[var(--imd-text2)]">
                  ملاحظات: {detailOrder.notes}
                </div>
              )}
            </div>
            <ImdTable
              columns={[
                { key: 'c', header: 'الكود', render: (l) => <span className="font-mono-num">{l.itemCode}</span> },
                { key: 'n', header: 'الصنف', render: (l) => <strong>{l.itemName}</strong> },
                { key: 'u', header: 'الوحدة', render: (l) => l.unitName },
                { key: 'req', header: 'الكمية المطلوبة', numeric: true, render: (l) => fmt(l.requestedQty) },
                { key: 'app', header: 'الكمية المعتمدة', numeric: true, render: (l) => (l.approvedQty ? fmt(l.approvedQty) : '—') },
                { key: 'rec', header: 'المستلم / المنفذ', numeric: true, render: (l) => (l.receivedQty ? fmt(l.receivedQty) : '—') },
              ]}
              rows={detailLines}
              rowKey={(l) => l.id}
              reportCountToStatusBar={false}
            />
          </div>
        )}
      </ImdModal>

      {/* Editable ApprovedQty Modal */}
      <ImdModal
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        title={`اعتماد وتعديل كميات الطلبية — ${approveTarget?.refNo ?? ''}`}
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setApproveTarget(null)}>تراجع</ImdButton>
            <ImdButton variant="primary" onClick={handleConfirmApprove}>اعتماد الكميات المعدّلة</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          {approveLines.map((ln) => (
            <div key={ln.id} className="grid grid-cols-3 gap-3 items-center p-2 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]">
              <div className="text-xs font-semibold">
                {ln.itemName} ({ln.unitName})
              </div>
              <div className="text-xs text-[var(--imd-muted)] tabular-nums">
                المطلوب: {fmt(ln.requestedQty)}
              </div>
              <ImdFld
                label="الكمية المعتمدة"
                type="number"
                value={approvedQtys[ln.id] ?? ln.requestedQty}
                onChange={(v) =>
                  setApprovedQtys((p) => ({ ...p, [ln.id]: Math.max(0, Number(v) || 0) }))
                }
              />
            </div>
          ))}
        </div>
      </ImdModal>

      {/* Reject Ration Order Modal (requires reason) */}
      <ImdModal
        open={Boolean(rejectOrderTarget)}
        onClose={() => setRejectOrderTarget(null)}
        title={`رفض طلبية الإعاشة — ${rejectOrderTarget?.refNo ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setRejectOrderTarget(null)}>تراجع</ImdButton>
            <ImdButton variant="danger" onClick={handleConfirmRejectOrder}>تأكيد الرفض</ImdButton>
          </>
        }
      >
        <ImdFld
          label="سبب رفض الطلبية (إلزامي)"
          value={rejectOrderReason}
          onChange={setRejectOrderReason}
          placeholder="مثال: عدم توفر الصنف أو مخالفة المخصص..."
        />
      </ImdModal>

      <ImdModal
        open={Boolean(rejectIssueGroup)}
        onClose={() => setRejectIssueGroup(null)}
        title={`رفض أمر الصرف الموجه — ${rejectIssueGroup?.refNo ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setRejectIssueGroup(null)}>تراجع</ImdButton>
            <ImdButton variant="danger" onClick={handleConfirmRejectDirectedIssue}>تأكيد الرفض</ImdButton>
          </>
        }
      >
        <ImdFld
          label="سبب رفض الأمر"
          value={rejectIssueReason}
          onChange={setRejectIssueReason}
          placeholder="مثال: عدم تطابق الصرف أو نقص المستندات..."
        />
      </ImdModal>
    </ImdPage>
  );
};

