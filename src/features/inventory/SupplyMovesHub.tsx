// Supply Inventory Moves Hub (Part 2 Complete: Multi-line Entry, Receive Drafts/Quick Supplier/Excel, Issue AutoSave Recovery + Entitlement Calc, Transfer PENDING->RECEIVED/REJECTED + Pull RationOrder, Multi-Member Destruction)

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Plus,
  Printer,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdBarcodeInput,
  ImdButton,
  ImdFld,
  ImdItemPicker,
  ImdModal,
  ImdNote,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
  ImdStickyActions,
  ImdTabs,
  ImdUnitPicker,
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { todayIso } from '../../core/ui/imdTokens';
import { Ids } from '../../core/security/crypto';
import { importXlsxFile } from '../../core/export/excelEngine';
import { filterAllowedWarehouses } from '../../domain/accessControl';
import { getWarehouseItemStock, isMovementActive } from '../../domain/stockLedger';
import { computeCampStrengthForDate } from '../../domain/strengthEngine';
import { dailyRatePerPerson, distributeGroupRequirement } from '../../domain/entitlements';
import { evaluateIssueRules, type RuleDecisionResult } from '../../domain/ruleEngine';
import { computeFifoExpiryAlerts } from '../../domain/stockAlerts';
import type {
  CylIssueAction,
  CylReceiveAction,
  CylReturnAction,
  CylTransferAction,
  Destruction,
  DestructionCommitteeMember,
  Issue,
  OpeningBalance,
  Receipt,
  ReturnRecord,
  Supplier,
  Transfer,
} from '../../domain/types';

type MoveTab = 'receive' | 'issue' | 'transfer' | 'returns' | 'opening' | 'destruction';

interface VoucherLineDraft {
  id: string;
  itemId: string;
  unitName: string;
  factor: number;
  qty: number;
  expiryDate: string;
  cylinderAction: string;
}

const ISSUE_RECOVERY_KEY = 'emdad_issue_recovery_v1';

export const SupplyMovesHub: React.FC = () => {
  const {
    db,
    currentUser,
    ledger,
    navIntent,
    clearNavIntent,
    upsertRow,
    mutateDb,
    nextDocRef,
    logAudit,
    notify,
    openPrintPreview,
    fmt,
  } = useEmdad();

  const [tab, setTab] = useState<MoveTab>('receive');
  const [receiveSubTab, setReceiveSubTab] = useState<'new' | 'drafts' | 'log'>('new');
  const [issueSubTab, setIssueSubTab] = useState<'new' | 'drafts' | 'log'>('new');

  const allowedWarehouses = useMemo(
    () => filterAllowedWarehouses(currentUser, db.warehouses),
    [currentUser, db.warehouses]
  );

  const defaultWh = allowedWarehouses[0]?.name ?? db.warehouses[0]?.name ?? '';
  const defaultItem = db.items[0];

  const makeDefaultLine = (): VoucherLineDraft => ({
    id: Ids.next('ln'),
    itemId: defaultItem?.id ?? '',
    unitName: defaultItem?.units[0]?.name ?? defaultItem?.baseUnit ?? '',
    factor: defaultItem?.units[0]?.factor ?? 1,
    qty: 1,
    expiryDate: '',
    cylinderAction: '',
  });

  // Shared header state
  const [date, setDate] = useState(todayIso());
  const [warehouse, setWarehouse] = useState(defaultWh);
  const [notes, setNotes] = useState('');

  // Multi-line entries for Receive / Issue / Transfer / Destruction
  const [lines, setLines] = useState<VoucherLineDraft[]>(() => [makeDefaultLine()]);

  // Single-item fields (for Opening / Returns quick mode)
  const [singleItemId, setSingleItemId] = useState(defaultItem?.id ?? '');
  const [singleUnitName, setSingleUnitName] = useState(defaultItem?.units[0]?.name ?? defaultItem?.baseUnit ?? '');
  const [singleQtyStr, setSingleQtyStr] = useState('1');

  // Receive specific
  const [supplier, setSupplier] = useState(db.suppliers[0]?.name ?? '');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [entryNo, setEntryNo] = useState('');
  const [committee, setCommittee] = useState('لجنة الاستلام');
  const [supervision, setSupervision] = useState('الرقابة والتفتيش');
  const [auditCol, setAuditCol] = useState('المراجعة والتدقيق');
  const [quickSupOpen, setQuickSupOpen] = useState(false);
  const [quickSupName, setQuickSupName] = useState('');
  const [quickSupPhone, setQuickSupPhone] = useState('');
  const [quickSupCity, setQuickSupCity] = useState('');

  // Issue specific + Auto-save recovery
  const [targetType, setTargetType] = useState<'0' | '1' | '2'>('0');
  const [unitId, setUnitId] = useState(db.beneficiary_units[0]?.id ?? '');
  const [facilityId, setFacilityId] = useState(db.facilities[0]?.id ?? '');
  const [customRecipient, setCustomRecipient] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [receiverName, setReceiverName] = useState('');
  const [recoveryRestored, setRecoveryRestored] = useState(false);

  // Restore issueRecovery on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ISSUE_RECOVERY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.lines) && parsed.lines.length > 0) {
          setWarehouse(parsed.warehouse || defaultWh);
          setTargetType(parsed.targetType || '0');
          if (parsed.unitId) setUnitId(parsed.unitId);
          if (parsed.facilityId) setFacilityId(parsed.facilityId);
          if (parsed.customRecipient) setCustomRecipient(parsed.customRecipient);
          if (parsed.durationDays) setDurationDays(parsed.durationDays);
          if (parsed.receiverName) setReceiverName(parsed.receiverName);
          if (parsed.notes) setNotes(parsed.notes);
          setLines(parsed.lines);
          setRecoveryRestored(true);
        }
      }
    } catch {
      // ignore invalid recovery
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save issueRecovery when on issue tab
  useEffect(() => {
    if (tab !== 'issue') return;
    try {
      localStorage.setItem(
        ISSUE_RECOVERY_KEY,
        JSON.stringify({
          warehouse,
          targetType,
          unitId,
          facilityId,
          customRecipient,
          durationDays,
          receiverName,
          notes,
          lines,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore storage quota
    }
  }, [tab, warehouse, targetType, unitId, facilityId, customRecipient, durationDays, receiverName, notes, lines]);

  // Deep-link navIntent receiver
  useEffect(() => {
    if (!navIntent || navIntent.door !== 'supplyMoves') return;
    if (navIntent.subTab) {
      setTab(navIntent.subTab as MoveTab);
      if (navIntent.subTab === 'receive') setReceiveSubTab('new');
      if (navIntent.subTab === 'issue') setIssueSubTab('new');
    }
    if (navIntent.prefillWarehouse) {
      setWarehouse(navIntent.prefillWarehouse);
    }
    if (navIntent.prefillItemId) {
      const it = db.items.find((x) => x.id === navIntent.prefillItemId);
      if (it) {
        const defUnit = it.units[0];
        setSingleItemId(it.id);
        setSingleUnitName(defUnit?.name ?? it.baseUnit);
        setLines((prev) => {
          const first = prev[0] ?? makeDefaultLine();
          return [
            {
              ...first,
              itemId: it.id,
              unitName: defUnit?.name ?? it.baseUnit,
              factor: defUnit?.factor ?? 1,
              qty: 1,
            },
          ];
        });
      }
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent, db.items]);

  // Transfer specific
  const [destWarehouse, setDestWarehouse] = useState(
    db.warehouses[1]?.name ?? db.warehouses[0]?.name ?? ''
  );
  const [rejectModal, setRejectModal] = useState<Transfer | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Return specific
  const [returnType, setReturnType] = useState<'FROM_UNIT' | 'TO_SUPPLIER'>('FROM_UNIT');
  const [returnCondition, setReturnCondition] = useState<'صالحة' | 'تالفة'>('صالحة');
  const [returnParty, setReturnParty] = useState(db.beneficiary_units[0]?.name ?? '');
  const [origRef, setOrigRef] = useState('');
  const [cylReturn, setCylReturn] = useState<CylReturnAction>('RETURN_FULL');

  // Opening specific
  const [cylFull, setCylFull] = useState('0');
  const [cylEmpty, setCylEmpty] = useState('0');

  // Destruction specific (multi-member committee)
  const [destReason, setDestReason] = useState('انتهاء الصلاحية / تلف مخزني');
  const [destMethod, setDestMethod] = useState('حرق / إتلاف ميداني');
  const [destPlace, setDestPlace] = useState('ساحة الإتلاف المعتمدة');
  const [destOrderRef, setDestOrderRef] = useState('');
  const [destCommittee, setDestCommittee] = useState<DestructionCommitteeMember[]>([
    { name: currentUser?.name ?? 'رئيس اللجنة', rank: 'رائد', role: 'رئيس لجنة الإتلاف' },
    { name: 'مندوب الرقابة والتفتيش', rank: 'نقيب', role: 'عضو رقابي' },
    { name: 'أمين المستودع', rank: 'رقيب أول', role: 'عضو فني' },
  ]);

  // Rule Engine Override Modal
  const [ruleModal, setRuleModal] = useState<{
    result: RuleDecisionResult;
    pendingIssues: Array<Omit<Issue, 'id' | 'refNo'>>;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Helper line updaters
  const updateLine = (id: string, patch: Partial<VoucherLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const changeLineItem = (lineId: string, itemId: string) => {
    const it = db.items.find((x) => x.id === itemId);
    if (!it) return;
    const defUnit = it.units[0];
    updateLine(lineId, {
      itemId: it.id,
      unitName: defUnit?.name ?? it.baseUnit,
      factor: defUnit?.factor ?? 1,
      cylinderAction: it.isRefillable
        ? tab === 'receive'
          ? 'RECEIVE_FULL'
          : tab === 'issue'
          ? 'EXCHANGE'
          : 'TRANSFER_FULL'
        : '',
    });
  };

  const duplicateLine = (line: VoucherLineDraft) => {
    setLines((prev) => [...prev, { ...line, id: Ids.next('ln') }]);
  };

  const addScannedItem = (code: string) => {
    const it = db.items.find((i) => i.barcode === code || i.code === code);
    if (!it) {
      notify(`لم يتم العثور على صنف بالباركود (${code})`, 'warn');
      return;
    }
    const existing = lines.find((l) => l.itemId === it.id);
    if (existing) {
      updateLine(existing.id, { qty: existing.qty + 1 });
      notify(`تمت زيادة كمية ${it.name}`, 'info');
    } else {
      const defU = it.units[0];
      setLines((prev) => [
        ...prev,
        {
          id: Ids.next('ln'),
          itemId: it.id,
          unitName: defU?.name ?? it.baseUnit,
          factor: defU?.factor ?? 1,
          qty: 1,
          expiryDate: '',
          cylinderAction: '',
        },
      ]);
    }
  };

  // --- Receive Handlers ---
  const handleQuickAddSupplier = () => {
    if (!quickSupName.trim()) return;
    const s: Supplier = {
      id: Ids.next('sup'),
      name: quickSupName.trim(),
      phone: quickSupPhone,
      contact: '',
      city: quickSupCity,
      notes: 'إضافة سريعة من شاشة الاستلام',
    };
    upsertRow('suppliers', s);
    setSupplier(s.name);
    setQuickSupName('');
    setQuickSupPhone('');
    setQuickSupCity('');
    setQuickSupOpen(false);
    notify(`تمت إضافة المورد "${s.name}" وتحديده`, 'success');
  };

  const handleImportReceiveExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = await importXlsxFile(file);
    const imported: VoucherLineDraft[] = [];
    for (const r of rows) {
      const nameOrCode = (r['الصنف'] || r['الكود'] || r['item'] || '').trim();
      const it = db.items.find((i) => i.name === nameOrCode || i.code === nameOrCode);
      if (!it) continue;
      const qty = Math.max(0.01, Number(r['الكمية'] || r['qty']) || 1);
      const u = it.units.find((x) => x.name === (r['الوحدة'] || '')) ?? it.units[0];
      imported.push({
        id: Ids.next('ln'),
        itemId: it.id,
        unitName: u?.name ?? it.baseUnit,
        factor: u?.factor ?? 1,
        qty,
        expiryDate: r['تاريخ الانتهاء'] || '',
        cylinderAction: '',
      });
    }
    if (imported.length > 0) {
      setLines(imported);
      notify(`تم استيراد ${imported.length} أسطر من ملف Excel`, 'success');
    } else {
      notify('لم تطابق أي أسطر في الملف أصناف القاعدة', 'warn');
    }
    e.target.value = '';
  };

  const handleSaveReceive = async (asDraft = false) => {
    const validLines = lines.filter((l) => l.itemId && l.qty > 0);
    if (validLines.length === 0) {
      notify('أضف سطراً واحداً على الأقل بكمية صحيحة', 'danger');
      return;
    }
    const refNo = nextDocRef('receipt');
    const now = new Date().toISOString();
    const newRecs: Receipt[] = [];
    const printRows: Array<Array<string | number>> = [];
    let totalBase = 0;

    for (const ln of validLines) {
      const it = db.items.find((i) => i.id === ln.itemId);
      if (!it) continue;
      const baseQty = ln.qty * ln.factor;
      totalBase += baseQty;
      newRecs.push({
        id: Ids.next('rec'),
        refNo,
        date,
        warehouse,
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        unitName: ln.unitName || it.baseUnit,
        factor: ln.factor,
        qty: ln.qty,
        baseQty,
        status: asDraft ? 'DRAFT' : 'COMPLETED',
        notes,
        createdBy: currentUser?.name ?? 'مستخدم',
        createdAt: now,
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
        supplier,
        invoiceNo,
        entryNo,
        committee,
        supervision,
        audit: auditCol,
        expiryDate: ln.expiryDate,
        cylinderAction: it.isRefillable ? ((ln.cylinderAction as CylReceiveAction) || 'RECEIVE_FULL') : '',
      });
      printRows.push([it.name, ln.unitName, fmt(ln.qty), `${fmt(baseQty)} ${it.baseUnit}`]);
    }

    mutateDb((prev) => ({
      ...prev,
      receipts: [...newRecs, ...prev.receipts],
    }));

    logAudit({
      action: asDraft ? 'DRAFT_RECEIPT' : 'CREATE_RECEIPT',
      entityType: 'receipts',
      summary: `${asDraft ? 'مسودة توريد' : 'اعتماد توريد'} ${refNo} (${newRecs.length} صنف) في ${warehouse}`,
      refNo,
      warehouse,
      target: supplier,
      itemCount: newRecs.length,
      qty: totalBase,
    });
    notify(asDraft ? `تم حفظ المسودة ${refNo}` : `تم اعتماد سند الاستلام ${refNo}`, 'success');

    if (!asDraft) {
      await openPrintPreview({
        formKey: 'receipt',
        space: 'supply',
        title: 'سند استلام مخزني',
        refNo,
        date,
        warehouse,
        partyLabel: 'المورد',
        partyValue: `${supplier}${invoiceNo ? ` (فاتورة: ${invoiceNo})` : ''}`,
        notes,
        opType: 'سند استلام',
        columns: ['الصنف', 'الوحدة', 'الكمية', 'المكافئ بالأساس'],
        rows: printRows,
        totalQty: totalBase,
        actorName: currentUser?.name ?? '',
      });
    }
  };

  const approveDraftReceipt = (draftRef: string) => {
    mutateDb((prev) => ({
      ...prev,
      receipts: prev.receipts.map((r) => (r.refNo === draftRef ? { ...r, status: 'COMPLETED' } : r)),
    }));
    logAudit({ action: 'APPROVE_DRAFT_RECEIPT', entityType: 'receipts', summary: `اعتماد المسودة ${draftRef}`, refNo: draftRef });
    notify(`تم اعتماد التوريد ${draftRef} وإضافته للرصيد`, 'success');
  };

  // --- Issue Handlers (Entitlement Calculator + Rule Engine + AutoSave clear) ---
  const computeTargetStrength = (): number => {
    if (targetType === '0') {
      const unit = db.beneficiary_units.find((u) => u.id === unitId);
      if (unit?.isCamp) {
        return computeCampStrengthForDate(unit.id, date, db.strengths, db.beneficiary_units).total;
      }
      return db.strengths
        .filter((s) => s.strengthDate === date && s.unitId === unitId)
        .reduce((a, s) => a + s.total, 0);
    }
    if (targetType === '1') {
      const fac = db.facilities.find((f) => f.id === facilityId);
      const camps = db.beneficiary_units.filter((u) => u.isCamp && u.facilityIds.includes(fac?.id ?? ''));
      return camps.reduce((a, c) => a + computeCampStrengthForDate(c.id, date, db.strengths, db.beneficiary_units).total, 0);
    }
    return 0;
  };

  const handleCalculateFromEntitlement = () => {
    const strTotal = computeTargetStrength();
    const days = Math.max(1, Number(durationDays) || 1);
    if (strTotal <= 0) {
      notify('لا توجد تفريدة مسجلة لهذه الجهة في التاريخ المختار — يمكنك إدخال الكميات يدوياً', 'warn');
      return;
    }

    const calculated: VoucherLineDraft[] = [];
    for (const ent of db.entitlements) {
      const rate = dailyRatePerPerson(ent);
      const reqBase = Math.round(rate * strTotal * days * 100) / 100;
      if (reqBase <= 0) continue;

      if (ent.itemId.startsWith('grp:')) {
        const grpId = ent.itemId.slice(4);
        const grp = db.entitlement_groups.find((g) => g.id === grpId);
        if (grp) {
          const dist = distributeGroupRequirement(grp, reqBase, warehouse, ledger, db.items);
          for (const d of dist.lines) {
            if (d.allocatedBase <= 0) continue;
            const it = db.items.find((x) => x.id === d.itemId);
            if (!it) continue;
            const pack = it.units[it.units.length - 1] ?? it.units[0];
            calculated.push({
              id: Ids.next('ln'),
              itemId: it.id,
              unitName: pack.name,
              factor: pack.factor,
              qty: Math.round((d.allocatedBase / pack.factor) * 100) / 100,
              expiryDate: '',
              cylinderAction: '',
            });
          }
        }
      } else {
        const it = db.items.find((x) => x.id === ent.itemId);
        if (!it) continue;
        const pack = it.units[it.units.length - 1] ?? it.units[0];
        calculated.push({
          id: Ids.next('ln'),
          itemId: it.id,
          unitName: pack.name,
          factor: pack.factor,
          qty: Math.round((reqBase / pack.factor) * 100) / 100,
          expiryDate: '',
          cylinderAction: it.isRefillable ? 'EXCHANGE' : '',
        });
      }
    }

    if (calculated.length > 0) {
      setLines(calculated);
      notify(`تم احتساب ${calculated.length} أصناف لاستحقاق (${strTotal} فرد × ${days} يوم)`, 'success');
    }
  };

  const finalizeIssues = async (pendingList: Array<Omit<Issue, 'id' | 'refNo'>>, sensitiveReason?: string) => {
    const refNo = nextDocRef('issue');
    const saved: Issue[] = pendingList.map((p) => ({
      ...p,
      id: Ids.next('iss'),
      refNo,
      notes: sensitiveReason ? `${p.notes} [مبرر التجاوز: ${sensitiveReason}]`.trim() : p.notes,
    }));
    const totalBase = saved.reduce((a, x) => a + x.baseQty, 0);

    mutateDb((prev) => ({
      ...prev,
      issues: [...saved, ...prev.issues],
    }));
    localStorage.removeItem(ISSUE_RECOVERY_KEY);
    setRecoveryRestored(false);

    logAudit({
      action: sensitiveReason ? 'ISSUE_RULE_OVERRIDE' : 'CREATE_ISSUE',
      entityType: 'issues',
      summary: `صرف ${saved.length} صنف (${refNo}) إلى ${saved[0]?.recipientDisplay}`,
      risk: sensitiveReason ? 'sensitive' : 'normal',
      refNo,
      warehouse,
      target: saved[0]?.recipientDisplay ?? '',
      itemCount: saved.length,
      qty: totalBase,
      details: sensitiveReason ? { overrideReason: sensitiveReason } : {},
    });
    notify(`تم اعتماد سند الصرف ${refNo}`, 'success');

    await openPrintPreview({
      formKey: 'issue',
      space: 'supply',
      title: 'سند صرف مخزني',
      refNo,
      date,
      warehouse,
      partyLabel: 'الجهة المستفيدة',
      partyValue: saved[0]?.recipientDisplay ?? '',
      receiverName,
      notes: saved[0]?.notes,
      opType: 'سند صرف',
      columns: ['الصنف', 'الوحدة', 'الكمية', 'المدة (أيام)'],
      rows: saved.map((iss) => [iss.itemName, iss.unitName, fmt(iss.qty), iss.durationDays]),
      totalQty: totalBase,
      actorName: currentUser?.name ?? '',
      copyType: 'issue_order',
    });
  };

  const handleSaveIssue = async (saveStatus: 'COMPLETED' | 'DRAFT' | 'ORDER' = 'COMPLETED') => {
    const validLines = lines.filter((l) => l.itemId && l.qty > 0);
    if (validLines.length === 0) {
      notify('أضف صنفاً واحداً على الأقل بكمية صحيحة', 'danger');
      return;
    }

    const targetUnit = db.beneficiary_units.find((u) => u.id === unitId);
    const targetFac = db.facilities.find((f) => f.id === facilityId);
    const recipientDisplay =
      targetType === '0'
        ? targetUnit?.name ?? ''
        : targetType === '1'
        ? targetFac?.name ?? ''
        : customRecipient || 'صرف مخصص';

    const dayStr = computeTargetStrength();

    if (saveStatus === 'DRAFT' || saveStatus === 'ORDER') {
      const refNo = nextDocRef('issue');
      const now = new Date().toISOString();
      const draftRows: Issue[] = validLines
        .map((ln): Issue | null => {
          const it = db.items.find((i) => i.id === ln.itemId);
          if (!it) return null;
          const cylAct = it.isRefillable ? ((ln.cylinderAction as CylIssueAction) || 'EXCHANGE') : '';
          return {
            id: Ids.next('iss'),
            refNo,
            date,
            warehouse,
            itemId: it.id,
            itemCode: it.code,
            itemName: it.name,
            unitName: ln.unitName || it.baseUnit,
            factor: ln.factor,
            qty: ln.qty,
            baseQty: ln.qty * ln.factor,
            status: saveStatus,
            notes,
            createdBy: currentUser?.name ?? 'مستخدم',
            createdAt: now,
            editCount: 0,
            editLog: [],
            editedBy: '',
            cancelReason: '',
            cancelledBy: '',
            prevStatus: '',
            targetType: Number(targetType) as 0 | 1 | 2,
            recipientDisplay,
            unitId: targetType === '0' ? unitId : '',
            facilityId: targetType === '1' ? facilityId : '',
            beneficiaryUnitId: targetUnit?.id ?? '',
            beneficiaryUnitName: targetUnit?.name ?? recipientDisplay,
            soldierCount: dayStr,
            officerCount: 0,
            durationDays: Number(durationDays) || 1,
            approvedBy: '',
            rejectReason: '',
            rejectedBy: '',
            cylinderAction: cylAct,
            receiverName,
          } satisfies Issue;
        })
        .filter((x): x is Issue => x !== null);

      mutateDb((prev) => ({
        ...prev,
        issues: [...draftRows, ...prev.issues],
      }));
      localStorage.removeItem(ISSUE_RECOVERY_KEY);
      setRecoveryRestored(false);
      logAudit({
        action: saveStatus === 'ORDER' ? 'ISSUE_ORDER_CREATED' : 'ISSUE_DRAFT_CREATED',
        entityType: 'issues',
        summary: `${saveStatus === 'ORDER' ? 'إرسال أمر توجيه صرف' : 'حفظ مسودة صرف'} (${refNo}) لعدد ${draftRows.length} صنف`,
        refNo,
        warehouse,
        target: recipientDisplay,
        itemCount: draftRows.length,
      });
      notify(
        saveStatus === 'ORDER'
          ? `تم توجيه أمر الصرف ${refNo} لباب الاعتماد`
          : `تم حفظ مسودة الصرف ${refNo} في «المسودات والأوامر»`,
        'success'
      );
      setIssueSubTab('drafts');
      return;
    }

    const pendingList: Array<Omit<Issue, 'id' | 'refNo'>> = [];
    let worstRule: RuleDecisionResult = { decision: 'pass', reasons: [], variancePct: 0, entitledQty: 0 };

    for (const ln of validLines) {
      const it = db.items.find((i) => i.id === ln.itemId);
      if (!it) continue;
      const baseQty = ln.qty * ln.factor;
      const whStock = getWarehouseItemStock(ledger, warehouse, it.id);
      const cylAct = it.isRefillable ? ((ln.cylinderAction as CylIssueAction) || 'EXCHANGE') : '';

      pendingList.push({
        date,
        warehouse,
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        unitName: ln.unitName || it.baseUnit,
        factor: ln.factor,
        qty: ln.qty,
        baseQty,
        status: 'COMPLETED',
        notes,
        createdBy: currentUser?.name ?? 'مستخدم',
        createdAt: new Date().toISOString(),
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
        targetType: Number(targetType) as 0 | 1 | 2,
        recipientDisplay,
        unitId: targetType === '0' ? unitId : '',
        facilityId: targetType === '1' ? facilityId : '',
        beneficiaryUnitId: targetUnit?.id ?? '',
        beneficiaryUnitName: targetUnit?.name ?? recipientDisplay,
        soldierCount: dayStr,
        officerCount: 0,
        durationDays: Number(durationDays) || 1,
        approvedBy: currentUser?.name ?? '',
        rejectReason: '',
        rejectedBy: '',
        cylinderAction: cylAct,
        receiverName,
      });

      const ent = db.entitlements.find((e) => e.itemId === it.id);
      const effNeeded = it.isRefillable && (cylAct === 'EXCHANGE' || cylAct === 'CONSUME') ? 0 : baseQty;
      const res = evaluateIssueRules({
        warehouse,
        availableBalance: whStock,
        requestedBaseQty: effNeeded,
        strengthTotal: dayStr,
        durationDays: Number(durationDays) || 1,
        entitlement: ent,
        item: it,
        activeFrozenStocktakes: db.stocktakes,
        softWarningThresholdPct: db.config.ruleSoftWarningThresholdPct,
        hardLockThresholdPct: db.config.ruleHardLockThresholdPct,
      });

      if (res.decision === 'hardLockRequiresOwnerSign') {
        worstRule = {
          ...res,
          reasons: [...worstRule.reasons, `${it.name}: ${res.reasons.join('؛ ')}`],
        };
      } else if (res.decision === 'softWarningRequiresReason' && worstRule.decision !== 'hardLockRequiresOwnerSign') {
        worstRule = {
          ...res,
          reasons: [...worstRule.reasons, `${it.name}: ${res.reasons.join('؛ ')}`],
        };
      }
    }

    if (worstRule.decision === 'pass') {
      await finalizeIssues(pendingList);
    } else {
      setOverrideReason('');
      setRuleModal({ result: worstRule, pendingIssues: pendingList });
    }
  };

  const approveIssueDraftGroup = async (refNo: string, group: Issue[]) => {
    const first = group[0];
    if (!first) return;
    const isFrozen = db.stocktakes.some(
      (s) => s.status === 'COUNTING' && s.freeze && s.warehouse === first.warehouse
    );
    if (isFrozen) {
      notify(`المستودع «${first.warehouse}» مجمّد بأمر جرد نشط`, 'danger');
      return;
    }
    for (const line of group) {
      const avail = getWarehouseItemStock(ledger, first.warehouse, line.itemId);
      if (avail < line.baseQty) {
        notify(
          `رصيد «${line.itemName}» في ${first.warehouse} غير كافٍ (${fmt(avail)} من أصل ${fmt(line.baseQty)})`,
          'danger'
        );
        return;
      }
    }
    const ids = new Set(group.map((g) => g.id));
    mutateDb((prev) => ({
      ...prev,
      issues: prev.issues.map((i) =>
        ids.has(i.id)
          ? { ...i, status: 'COMPLETED', prevStatus: i.status, approvedBy: currentUser?.name ?? i.approvedBy }
          : i
      ),
    }));
    logAudit({
      action: 'ISSUE_DRAFT_APPROVED',
      entityType: 'issues',
      summary: `اعتماد المسودة/الأمر ${refNo} وخصم الرصيد من ${first.warehouse}`,
      refNo,
      warehouse: first.warehouse,
      target: first.recipientDisplay,
      itemCount: group.length,
    });
    notify(`تم اعتماد السند ${refNo} وخصم الرصيد بنجاح`, 'success');
  };

  const deleteIssueDraftGroup = (refNo: string, group: Issue[]) => {
    const first = group[0];
    if (!first) return;
    const ids = new Set(group.map((g) => g.id));
    mutateDb((prev) => ({
      ...prev,
      issues: prev.issues.filter((i) => !ids.has(i.id)),
    }));
    logAudit({
      action: 'ISSUE_DRAFT_DELETED',
      entityType: 'issues',
      summary: `حذف مسودة صرف ${refNo}`,
      risk: 'sensitive',
      refNo,
      warehouse: first.warehouse,
      target: first.recipientDisplay,
      itemCount: group.length,
    });
    notify(`تم حذف المسودة ${refNo}`, 'info');
  };

  // --- Transfer Handlers (Auto-camp detection, Pull approved order, PENDING -> RECEIVED / REJECTED) ---
  const destWhObj = db.warehouses.find((w) => w.name === destWarehouse);
  const linkedCamp = db.beneficiary_units.find((u) => u.id === destWhObj?.campIds[0]);
  const linkedCampStrength = linkedCamp
    ? computeCampStrengthForDate(linkedCamp.id, date, db.strengths, db.beneficiary_units).total
    : 0;

  const handlePullFromApprovedOrder = () => {
    const approved = db.ration_orders.find(
      (o) =>
        o.status === 'APPROVED' &&
        o.orderKind === 'BRANCH' &&
        (o.supplyingWarehouse === warehouse || o.requestingWarehouse === destWarehouse)
    ) ?? db.ration_orders.find((o) => o.status === 'APPROVED');

    if (!approved) {
      notify('لا توجد طلبية معتمدة متاحة للسحب حالياً', 'warn');
      return;
    }
    const oLines = db.ration_order_lines.filter((l) => l.orderId === approved.id);
    if (oLines.length === 0) return;

    setWarehouse(approved.supplyingWarehouse);
    setDestWarehouse(approved.requestingWarehouse);
    setNotes(`تنفيذ طلبية الإعاشة المعتمدة ${approved.refNo}`);
    setLines(
      oLines.map((l) => ({
        id: Ids.next('ln'),
        itemId: l.itemId,
        unitName: l.unitName,
        factor: l.factor,
        qty: l.approvedQty || l.requestedQty,
        expiryDate: '',
        cylinderAction: '',
      }))
    );
    notify(`تم سحب ${oLines.length} أصناف من الطلبية ${approved.refNo}`, 'success');
  };

  const handleSaveTransfer = async () => {
    const validLines = lines.filter((l) => l.itemId && l.qty > 0);
    if (validLines.length === 0) {
      notify('أضف صنفاً واحداً على الأقل للتحويل', 'danger');
      return;
    }
    if (warehouse === destWarehouse) {
      notify('يجب أن يختلف المستودع المحوّل إليه عن المصدر', 'danger');
      return;
    }

    for (const ln of validLines) {
      const avail = getWarehouseItemStock(ledger, warehouse, ln.itemId);
      if (ln.qty * ln.factor > avail) {
        const it = db.items.find((x) => x.id === ln.itemId);
        notify(`الرصيد المتاح لـ "${it?.name}" في ${warehouse} (${fmt(avail)}) غير كافٍ`, 'danger');
        return;
      }
    }

    const refNo = nextDocRef('transfer');
    const now = new Date().toISOString();
    const newTransfers: Transfer[] = [];
    const printRows: Array<Array<string | number>> = [];
    let totalBase = 0;

    for (const ln of validLines) {
      const it = db.items.find((i) => i.id === ln.itemId);
      if (!it) continue;
      const baseQty = ln.qty * ln.factor;
      totalBase += baseQty;
      newTransfers.push({
        id: Ids.next('tr'),
        refNo,
        date,
        warehouse,
        destWarehouse,
        campId: linkedCamp?.id ?? '',
        campName: linkedCamp?.name ?? '',
        strength: linkedCampStrength,
        durationDays: Number(durationDays) || 15,
        rejectReason: '',
        cylinderAction: it.isRefillable ? ((ln.cylinderAction as CylTransferAction) || 'TRANSFER_FULL') : '',
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        unitName: ln.unitName || it.baseUnit,
        factor: ln.factor,
        qty: ln.qty,
        baseQty,
        status: 'PENDING',
        notes,
        createdBy: currentUser?.name ?? '',
        createdAt: now,
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
      });
      printRows.push([it.name, ln.unitName, fmt(ln.qty), `${fmt(baseQty)} ${it.baseUnit}`]);
    }

    mutateDb((prev) => ({
      ...prev,
      transfers: [...newTransfers, ...prev.transfers],
    }));

    logAudit({
      action: 'CREATE_TRANSFER_PENDING',
      entityType: 'transfers',
      summary: `إنشاء إذن تحويل قيد التسليم (${refNo}) من ${warehouse} إلى ${destWarehouse}`,
      refNo,
      warehouse,
      target: destWarehouse,
      qty: totalBase,
    });
    notify(`تم إصدار إذن التحويل ${refNo} بحالة (قيد التسليم — مخصوم من المصدر حتى تأكيد الاستلام)`, 'success');

    await openPrintPreview({
      formKey: 'transfer',
      space: 'supply',
      title: 'إذن تحويل مخزني',
      refNo,
      date,
      warehouse,
      partyLabel: 'المستودع المستلم',
      partyValue: destWarehouse,
      notes,
      opType: 'تحويل مخزني',
      columns: ['الصنف', 'الوحدة', 'الكمية', 'المكافئ بالأساس'],
      rows: printRows,
      totalQty: totalBase,
      actorName: currentUser?.name ?? '',
      copyType: 'transfer_source',
    });
  };

  const confirmTransferReceived = (tr: Transfer) => {
    mutateDb((prev) => ({
      ...prev,
      transfers: prev.transfers.map((t) =>
        t.refNo === tr.refNo ? { ...t, status: 'RECEIVED' } : t
      ),
    }));
    logAudit({
      action: 'CONFIRM_TRANSFER_RECEIVED',
      entityType: 'transfers',
      summary: `تأكيد استلام التحويل ${tr.refNo} في ${tr.destWarehouse}`,
      refNo: tr.refNo,
      warehouse: tr.destWarehouse,
    });
    notify(`تم تأكيد استلام التحويل ${tr.refNo} وإضافته لرصيد ${tr.destWarehouse}`, 'success');
  };

  const handleConfirmRejectTransfer = () => {
    if (!rejectModal || !rejectReason.trim()) {
      notify('يجب كتابة سبب الرفض', 'danger');
      return;
    }
    mutateDb((prev) => ({
      ...prev,
      transfers: prev.transfers.map((t) =>
        t.refNo === rejectModal.refNo
          ? { ...t, status: 'REJECTED', rejectReason: rejectReason.trim() }
          : t
      ),
    }));
    logAudit({
      action: 'REJECT_TRANSFER',
      entityType: 'transfers',
      summary: `رفض التحويل ${rejectModal.refNo} (${rejectReason.trim()}) وعكس الرصيد للمصدر`,
      risk: 'sensitive',
      refNo: rejectModal.refNo,
      warehouse: rejectModal.warehouse,
    });
    notify(`تم رفض التحويل ${rejectModal.refNo} وإعادة الكمية لرصيد المصدر`, 'warn');
    setRejectModal(null);
    setRejectReason('');
  };

  // --- Return / Opening / Destruction ---
  const singleItem = db.items.find((i) => i.id === singleItemId);
  const singleUnitObj = singleItem?.units.find((u) => u.name === singleUnitName) ?? singleItem?.units[0];
  const singleFactor = singleUnitObj?.factor ?? 1;
  const singleQty = Math.max(0, Number(singleQtyStr) || 0);
  const singleBaseQty = singleQty * singleFactor;
  const singleWhStock = getWarehouseItemStock(ledger, warehouse, singleItemId);

  const handleSaveReturn = () => {
    if (!singleItem || singleQty <= 0) {
      notify('أدخل كمية صحيحة', 'danger');
      return;
    }
    const refNo = nextDocRef('return');
    const ret: ReturnRecord = {
      id: Ids.next('ret'),
      refNo,
      date,
      warehouse,
      itemId: singleItem.id,
      itemCode: singleItem.code,
      itemName: singleItem.name,
      unitName: singleUnitObj?.name ?? singleItem.baseUnit,
      factor: singleFactor,
      qty: singleQty,
      baseQty: singleBaseQty,
      status: 'COMPLETED',
      notes,
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
      editCount: 0,
      editLog: [],
      editedBy: '',
      cancelReason: '',
      cancelledBy: '',
      prevStatus: '',
      party: returnParty,
      beneficiaryUnitId: db.beneficiary_units.find((u) => u.name === returnParty)?.id ?? '',
      beneficiaryUnitName: returnParty,
      type: returnType,
      condition: returnCondition,
      origRef,
      cylinderAction: singleItem.isRefillable ? cylReturn : '',
    };
    upsertRow('returns', ret);
    logAudit({
      action: 'CREATE_RETURN',
      entityType: 'returns',
      summary: `مرتجع (${returnCondition}) ${singleQty} ${ret.unitName} (${ret.itemName})`,
      refNo,
      warehouse,
      target: returnParty,
      qty: singleBaseQty,
    });
    notify(`تم حفظ سند المرتجع ${refNo}`, 'success');
  };

  const handleSaveOpening = () => {
    if (!singleItem || singleQty < 0) return;
    const op: OpeningBalance = {
      id: Ids.next('op'),
      itemId: singleItem.id,
      itemCode: singleItem.code,
      itemName: singleItem.name,
      warehouse,
      qty: singleBaseQty,
      date,
      setBy: currentUser?.name ?? '',
      breakdown: singleItem.isRefillable
        ? { full: Number(cylFull) || singleBaseQty, empty: Number(cylEmpty) || 0 }
        : { units: { [singleUnitName]: singleQty } },
      createdAt: new Date().toISOString(),
    };
    upsertRow('opening_balances', op);
    logAudit({
      action: 'SET_OPENING',
      entityType: 'opening_balances',
      summary: `رصيد افتتاحي ${singleBaseQty} ${singleItem.baseUnit} (${singleItem.name}) في ${warehouse}`,
      risk: 'sensitive',
      warehouse,
      qty: singleBaseQty,
    });
    notify('تم تسجيل الرصيد الافتتاحي وتحديث دفتر الأرصدة', 'success');
  };

  const handleSaveDestruction = () => {
    const validLines = lines.filter((l) => l.itemId && l.qty > 0);
    if (validLines.length === 0) return;

    for (const ln of validLines) {
      const avail = getWarehouseItemStock(ledger, warehouse, ln.itemId);
      if (ln.qty * ln.factor > avail) {
        notify('الكمية المطلوب إتلافها تتجاوز رصيد المستودع', 'danger');
        return;
      }
    }

    const refNo = nextDocRef('destruction');
    const now = new Date().toISOString();
    const des: Destruction = {
      id: Ids.next('des'),
      refNo,
      date,
      warehouse,
      reason: destReason,
      method: destMethod,
      place: destPlace,
      committee: destCommittee,
      orderRef: destOrderRef,
      status: 'COMPLETED',
      notes,
      approvedBy: currentUser?.name ?? '',
      cancelReason: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
    };

    const adjs = validLines.map((ln) => {
      const it = db.items.find((x) => x.id === ln.itemId)!;
      const base = ln.qty * ln.factor;
      return {
        id: Ids.next('adj'),
        refNo,
        date,
        warehouse,
        itemId: it.id,
        itemCode: it.code,
        itemName: it.name,
        unitName: ln.unitName || it.baseUnit,
        factor: ln.factor,
        qty: ln.qty,
        baseQty: -base,
        status: 'COMPLETED' as const,
        notes: `إتلاف: ${destReason}`,
        createdBy: currentUser?.name ?? '',
        createdAt: now,
        editCount: 0,
        editLog: [],
        editedBy: '',
        cancelReason: '',
        cancelledBy: '',
        prevStatus: '',
        sessionId: des.id,
        reason: destReason,
        approvedBy: currentUser?.name ?? '',
      };
    });

    mutateDb((prev) => ({
      ...prev,
      destructions: [des, ...prev.destructions],
      adjustments: [...adjs, ...prev.adjustments],
    }));

    logAudit({
      action: 'CREATE_DESTRUCTION',
      entityType: 'destructions',
      summary: `محضر إتلاف ${refNo} (${validLines.length} أصناف) — ${destReason}`,
      risk: 'high',
      refNo,
      warehouse,
      qty: adjs.reduce((s, a) => s + Math.abs(a.baseQty), 0),
    });
    notify(`تم اعتماد محضر الإتلاف ${refNo}`, 'warn');
  };

  // Ctrl+S shortcut listener (dispatched globally from HomeShell)
  useEffect(() => {
    const onGlobalSave = () => {
      if (tab === 'receive' && receiveSubTab === 'new') void handleSaveReceive(false);
      else if (tab === 'issue' && issueSubTab === 'new') void handleSaveIssue('COMPLETED');
      else if (tab === 'transfer') void handleSaveTransfer();
      else if (tab === 'returns') handleSaveReturn();
      else if (tab === 'opening') handleSaveOpening();
      else if (tab === 'destruction') handleSaveDestruction();
    };
    window.addEventListener('imd:save', onGlobalSave);
    return () => window.removeEventListener('imd:save', onGlobalSave);
  });

  // Multi-line table UI shared across Receive, Issue, Transfer, Destruction
  const isMultiLineTab = tab === 'receive' || tab === 'issue' || tab === 'transfer' || tab === 'destruction';

  const issueDraftGroups = useMemo(() => {
    const allowedSet = new Set(allowedWarehouses.map((w) => w.name));
    const map = new Map<string, Issue[]>();
    for (const iss of db.issues) {
      if ((iss.status === 'DRAFT' || iss.status === 'ORDER') && allowedSet.has(iss.warehouse)) {
        const key = iss.refNo || iss.id;
        const list = map.get(key) ?? [];
        list.push(iss);
        map.set(key, list);
      }
    }
    return Array.from(map.entries());
  }, [db.issues, allowedWarehouses]);

  const activeRows = useMemo(() => {
    if (tab === 'receive') {
      if (receiveSubTab === 'drafts') return db.receipts.filter((r) => r.status === 'DRAFT');
      return db.receipts;
    }
    if (tab === 'issue') {
      if (issueSubTab === 'drafts') return db.issues.filter((i) => i.status === 'DRAFT' || i.status === 'ORDER');
      return db.issues;
    }
    if (tab === 'transfer') return db.transfers;
    if (tab === 'returns') return db.returns;
    if (tab === 'opening') return db.opening_balances;
    return db.destructions;
  }, [tab, receiveSubTab, issueSubTab, db.receipts, db.issues, db.transfers, db.returns, db.opening_balances, db.destructions]);

  const totalDraftBase = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.factor, 0),
    [lines]
  );

  const commonCols: ImdColumn<Record<string, unknown>>[] = [
    { key: 'ref', header: 'المرجع', sortValue: (r) => String(r.refNo ?? r.id), render: (r) => <span className="font-mono-num font-semibold">{String(r.refNo ?? r.id)}</span> },
    { key: 'date', header: 'التاريخ', numeric: true, sortValue: (r) => String(r.date ?? ''), render: (r) => String(r.date ?? '') },
    { key: 'wh', header: 'المستودع', sortValue: (r) => String(r.warehouse ?? ''), render: (r) => String(r.warehouse ?? '') },
    { key: 'item', header: 'الصنف / البيان', render: (r) => String(r.itemName ?? r.reason ?? '') },
    { key: 'qty', header: 'الكمية', numeric: true, render: (r) => (r.qty !== undefined ? `${fmt(Number(r.qty))} ${String(r.unitName ?? '')}` : '—') },
    {
      key: 'st',
      header: 'الحالة',
      render: (r) => {
        const st = String(r.status ?? 'COMPLETED');
        const label =
          st === 'CANCELLED'
            ? 'ملغي'
            : st === 'DRAFT'
            ? 'مسودة'
            : st === 'PENDING'
            ? 'قيد التسليم'
            : st === 'REJECTED'
            ? 'مرفوض'
            : st === 'RECEIVED'
            ? 'مستلم'
            : 'معتمد';
        const tone =
          st === 'CANCELLED' || st === 'REJECTED'
            ? 'danger'
            : st === 'DRAFT' || st === 'PENDING'
            ? 'warn'
            : 'success';
        return <ImdStatusText label={label} tone={tone} />;
      },
    },
    {
      key: 'act',
      header: 'الإجراءات',
      render: (r) => (
        <div className="flex items-center gap-1">
          {tab === 'receive' && r.status === 'DRAFT' && (
            <ImdButton size="sm" variant="primary" onClick={() => approveDraftReceipt(String(r.refNo))}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>اعتماد</span>
            </ImdButton>
          )}
          {tab === 'transfer' && r.status === 'PENDING' && (
            <>
              <ImdButton size="sm" variant="primary" onClick={() => confirmTransferReceived(r as unknown as Transfer)}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تأكيد الاستلام</span>
              </ImdButton>
              <ImdButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRejectReason('');
                  setRejectModal(r as unknown as Transfer);
                }}
              >
                <XCircle className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
              </ImdButton>
            </>
          )}
          {Boolean(r.refNo) && (
            <ImdButton
              size="sm"
              variant="ghost"
              onClick={() =>
                openPrintPreview({
                  formKey: tab,
                  space: 'supply',
                  title: `نسخة سند — ${String(r.refNo)}`,
                  refNo: String(r.refNo),
                  date: String(r.date ?? ''),
                  warehouse: String(r.warehouse ?? ''),
                  partyLabel: 'الطرف',
                  partyValue: String(r.supplier ?? r.recipientDisplay ?? r.destWarehouse ?? r.party ?? '—'),
                  receiverName: r.receiverName ? String(r.receiverName) : undefined,
                  opType: tab,
                  columns: ['الصنف', 'الوحدة', 'الكمية', 'الأساس'],
                  rows: [[String(r.itemName ?? '—'), String(r.unitName ?? '—'), fmt(Number(r.qty ?? 0)), fmt(Number(r.baseQty ?? 0))]],
                  totalQty: Number(r.baseQty ?? 0),
                  actorName: currentUser?.name ?? '',
                })
              }
            >
              <Printer className="w-3.5 h-3.5" />
            </ImdButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <ImdPage
      title="حركة المخزون والعمليات"
      subtitle="الاستلام · الصرف · التحويل (PENDING -> RECEIVED/REJECTED) · المرتجعات · الأرصدة الافتتاحية · محاضر الإتلاف"
    >
      <ImdTabs
        active={tab}
        onChange={(id) => {
          setTab(id as MoveTab);
          if (id !== 'issue') setRecoveryRestored(false);
        }}
        tabs={[
          { id: 'receive', label: 'الاستلام', count: db.receipts.length },
          { id: 'issue', label: 'الصرف', count: db.issues.length },
          { id: 'transfer', label: 'التحويل', count: db.transfers.length },
          { id: 'returns', label: 'المرتجعات', count: db.returns.length },
          { id: 'opening', label: 'الأرصدة الافتتاحية', count: db.opening_balances.length },
          { id: 'destruction', label: 'الإتلاف', count: db.destructions.length },
        ]}
      />

      {tab === 'receive' && (
        <ImdTabs
          active={receiveSubTab}
          onChange={(v) => setReceiveSubTab(v as 'new' | 'drafts' | 'log')}
          tabs={[
            { id: 'new', label: 'سند توريد جديد' },
            { id: 'drafts', label: 'المسودات', count: db.receipts.filter((r) => r.status === 'DRAFT').length },
            { id: 'log', label: 'سجل الواردات', count: db.receipts.length },
          ]}
        />
      )}

      {tab === 'issue' && (
        <ImdTabs
          active={issueSubTab}
          onChange={(v) => setIssueSubTab(v as 'new' | 'drafts' | 'log')}
          tabs={[
            { id: 'new', label: 'سند صرف جديد' },
            { id: 'drafts', label: 'المسودات والأوامر', count: issueDraftGroups.length },
            { id: 'log', label: 'سجل المنصرفات', count: db.issues.length },
          ]}
        />
      )}

      {tab === 'issue' && issueSubTab === 'drafts' && (
        <ImdPanel title="المسودات وأوامر التوجيه المعلقة (IssueDraftsView)">
          {issueDraftGroups.length === 0 ? (
            <div className="text-xs text-[var(--imd-muted)] py-6 text-center">
              لا توجد مسودات أو أوامر صرف معلقة في نطاق مستودعاتك
            </div>
          ) : (
            <div className="space-y-3">
              {issueDraftGroups.map(([refKey, group]) => {
                const f = group[0];
                return (
                  <div
                    key={refKey}
                    className="p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] space-y-2"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <ImdStatusText
                          label={f.status === 'ORDER' ? 'أمر توجيه' : 'مسودة'}
                          tone={f.status === 'ORDER' ? 'info' : 'warn'}
                        />
                        <span className="font-mono-num font-bold">{refKey}</span>
                        <span className="font-bold">{f.recipientDisplay || '—'}</span>
                        <span className="text-[var(--imd-muted)]">· {f.date} · {f.warehouse} · {group.length} صنف</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ImdButton size="sm" variant="primary" onClick={() => void approveIssueDraftGroup(refKey, group)}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اعتماد وصرف الرصيد</span>
                        </ImdButton>
                        <ImdButton size="sm" variant="danger" onClick={() => deleteIssueDraftGroup(refKey, group)}>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </ImdButton>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--imd-text2)] leading-relaxed">
                      {group.map((g, idx) => (
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

      {tab === 'issue' && issueSubTab === 'new' && recoveryRestored && (
        <ImdNote tone="info" title="تمت استعادة مسودة الصرف غير المحفوظة تلقائياً (issueRecovery)">
          <div className="flex items-center justify-between gap-2">
            <span>يتم حفظ بنود الصرف آلياً لتفادي فقدانها عند انقطاع الكهرباء أو إغلاق المتصفح.</span>
            <ImdButton
              size="sm"
              variant="ghost"
              onClick={() => {
                localStorage.removeItem(ISSUE_RECOVERY_KEY);
                setLines([makeDefaultLine()]);
                setRecoveryRestored(false);
              }}
            >
              تفريغ المسودة
            </ImdButton>
          </div>
        </ImdNote>
      )}

      {tab === 'issue' && issueSubTab === 'new' && (() => {
        const lineIds = new Set(lines.map((l) => l.itemId).filter(Boolean));
        const alerts = computeFifoExpiryAlerts({
          receipts: db.receipts.filter((r) => r.warehouse === warehouse),
          ledger: ledger.filter((r) => r.warehouse === warehouse),
          asOfDate: date || todayIso(),
          warnDays: 60,
        }).filter((a) => lineIds.has(a.itemId));
        if (alerts.length === 0) return null;
        return (
          <ImdNote
            tone={alerts.some((a) => a.status === 'expired') ? 'danger' : 'note'}
            title={`تنبيه صلاحية وأولوية الصرف (FEFO/FIFO) — ${warehouse}`}
          >
            <div className="space-y-1 text-xs">
              {alerts.map((a) => (
                <div key={`${a.receiptRefNo}-${a.itemId}`}>
                  • <strong>{a.itemName}</strong> (دفعة {a.receiptRefNo} بتاريخ انتهاء <span className="font-mono-num">{a.expiryDate}</span>): متبقٍ{' '}
                  <strong>{fmt(a.remainingBatchQty)} {a.baseUnit}</strong> —{' '}
                  {a.daysUntilExpiry <= 0 ? 'منتهي الصلاحية!' : `يتبقى ${a.daysUntilExpiry} يوم (يُصرف الأقدم أولاً)`}
                </div>
              ))}
            </div>
          </ImdNote>
        );
      })()}

      {(tab !== 'receive' || receiveSubTab === 'new') && (tab !== 'issue' || issueSubTab === 'new') && (
        <ImdPanel
          title={
            tab === 'receive'
              ? 'تسجيل سند توريد متعدد الأصناف'
              : tab === 'issue'
              ? 'تسجيل سند صرف مخزني (مربوط بمحرك القواعد والاستحقاق)'
              : tab === 'transfer'
              ? 'إصدار إذن تحويل مخزني (يُحفظ قيد التسليم حتى تأكيد المستلم)'
              : tab === 'returns'
              ? 'تسجيل مرتجع مخزني'
              : tab === 'opening'
              ? 'تثبيت رصيد افتتاحي'
              : 'اعتماد محضر إتلاف مخزني بلجنة متعددة الأعضاء'
          }
          headerRight={
            isMultiLineTab ? (
              <div className="flex flex-wrap items-center gap-2">
                {tab === 'receive' && (
                  <label className="inline-flex items-center gap-1 h-8 px-2.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] cursor-pointer hover:bg-[var(--imd-hover)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                    <Upload className="w-3.5 h-3.5" />
                    <span>استيراد Excel</span>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportReceiveExcel} />
                  </label>
                )}
                {tab === 'issue' && (
                  <ImdButton size="sm" variant="secondary" onClick={handleCalculateFromEntitlement}>
                    <Calculator className="w-3.5 h-3.5" />
                    <span>احتساب من الاستحقاق</span>
                  </ImdButton>
                )}
                {tab === 'transfer' && (
                  <ImdButton size="sm" variant="secondary" onClick={handlePullFromApprovedOrder}>
                    <Download className="w-3.5 h-3.5" />
                    <span>سحب من طلبية معتمدة</span>
                  </ImdButton>
                )}
              </div>
            ) : null
          }
        >
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ImdFld label="التاريخ" type="date" value={date} onChange={setDate} />
            <ImdSelect
              label={tab === 'transfer' ? 'المستودع المحوِّل (المصدر)' : 'المستودع'}
              value={warehouse}
              onChange={setWarehouse}
              options={allowedWarehouses.map((w) => ({ value: w.name, label: w.name }))}
            />

            {tab === 'receive' && (
              <>
                <div className="flex items-end gap-1.5">
                  <ImdSelect
                    label="المورد"
                    value={supplier}
                    onChange={setSupplier}
                    options={db.suppliers.map((s) => ({ value: s.name, label: s.name }))}
                    className="flex-1"
                    searchable
                  />
                  <ImdButton size="sm" variant="secondary" title="إضافة مورد سريع" onClick={() => setQuickSupOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5" />
                  </ImdButton>
                </div>
                <ImdFld label="رقم الفاتورة" value={invoiceNo} onChange={setInvoiceNo} placeholder="INV-..." />
                <ImdFld label="رقم القيد" value={entryNo} onChange={setEntryNo} placeholder="رقم القيد المالي..." />
                <ImdFld label="اللجنة المستلمة" value={committee} onChange={setCommittee} />
                <ImdFld label="المراجعة والتفتيش" value={supervision} onChange={setSupervision} />
                <ImdFld label="التدقيق" value={auditCol} onChange={setAuditCol} />
              </>
            )}

            {tab === 'issue' && (
              <>
                <ImdSelect
                  label="توجيه الصرف (IssueTarget)"
                  value={targetType}
                  onChange={(v) => setTargetType(v as '0' | '1' | '2')}
                  options={[
                    { value: '0', label: 'وحدة مستفيدة / معسكر' },
                    { value: '1', label: 'مطبخ أو فرن' },
                    { value: '2', label: 'مستلم مخصص بالاسم' },
                  ]}
                />
                {targetType === '0' && (
                  <ImdSelect
                    label="الوحدة المستفيدة"
                    value={unitId}
                    onChange={setUnitId}
                    options={db.beneficiary_units.map((u) => ({ value: u.id, label: u.name }))}
                    searchable
                  />
                )}
                {targetType === '1' && (
                  <ImdSelect
                    label="المطبخ / الفرن"
                    value={facilityId}
                    onChange={setFacilityId}
                    options={db.facilities.map((f) => ({ value: f.id, label: f.name }))}
                  />
                )}
                {targetType === '2' && (
                  <ImdFld label="اسم المستلم المخصص" value={customRecipient} onChange={setCustomRecipient} />
                )}
                <ImdFld label="مدة الصرف (أيام)" type="number" value={durationDays} onChange={setDurationDays} />
                <ImdFld label="اسم المستلم ورتبته (يُطبع بإشعار الاستلام)" value={receiverName} onChange={setReceiverName} placeholder="رقيب / ..." />
              </>
            )}

            {tab === 'transfer' && (
              <>
                <ImdSelect
                  label="المستودع المستلم (الوجهة)"
                  value={destWarehouse}
                  onChange={setDestWarehouse}
                  options={db.warehouses.map((w) => ({ value: w.name, label: w.name }))}
                />
                <div className="p-2 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-xs flex flex-col justify-center" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                  <div className="text-[var(--imd-muted)]">المعسكر المكتشف تلقائياً:</div>
                  <div className="font-bold mt-0.5">
                    {linkedCamp ? `${linkedCamp.name} (${fmt(linkedCampStrength, 0)} فرد)` : 'غير مرتبط بمعسكر'}
                  </div>
                </div>
                <ImdFld label="المدة التموينية (أيام)" type="number" value={durationDays} onChange={setDurationDays} />
              </>
            )}

            {tab === 'destruction' && (
              <>
                <ImdFld label="سبب الإتلاف" value={destReason} onChange={setDestReason} />
                <ImdFld label="طريقة الإتلاف (حرق/دفن/تكسير)" value={destMethod} onChange={setDestMethod} />
                <ImdFld label="مكان الإتلاف" value={destPlace} onChange={setDestPlace} />
                <ImdFld label="رقم أمر الإجازة" value={destOrderRef} onChange={setDestOrderRef} />
              </>
            )}

            {(tab === 'returns' || tab === 'opening') && (
              <>
                <ImdItemPicker
                  label="الصنف"
                  value={singleItemId}
                  onChange={(id) => {
                    setSingleItemId(id);
                    const it = db.items.find((x) => x.id === id);
                    if (it) setSingleUnitName(it.units[0]?.name ?? it.baseUnit);
                  }}
                  warehouse={warehouse}
                />
                <ImdUnitPicker
                  item={singleItem}
                  unitName={singleUnitName}
                  onChange={(u) => setSingleUnitName(u)}
                  qty={singleQty}
                />
                <ImdFld label="الكمية" type="number" value={singleQtyStr} onChange={setSingleQtyStr} />
              </>
            )}

            {tab === 'returns' && (
              <>
                <ImdSelect
                  label="نوع المرتجع"
                  value={returnType}
                  onChange={(v) => setReturnType(v as 'FROM_UNIT' | 'TO_SUPPLIER')}
                  options={[
                    { value: 'FROM_UNIT', label: 'مرتجع من وحدة مستفيدة' },
                    { value: 'TO_SUPPLIER', label: 'مرتجع إلى مورد' },
                  ]}
                />
                <ImdSelect
                  label="حالة المادة"
                  value={returnCondition}
                  onChange={(v) => setReturnCondition(v as 'صالحة' | 'تالفة')}
                  options={[
                    { value: 'صالحة', label: 'صالحة (تُعاد للرصيد)' },
                    { value: 'تالفة', label: 'تالفة (لا تدخل الرصيد الصالح)' },
                  ]}
                />
                <ImdSelect
                  label="الجهة / الطرف"
                  value={returnParty}
                  onChange={setReturnParty}
                  options={
                    returnType === 'FROM_UNIT'
                      ? db.beneficiary_units.map((u) => ({ value: u.name, label: u.name }))
                      : db.suppliers.map((s) => ({ value: s.name, label: s.name }))
                  }
                />
                <ImdFld label="رقم السند الأصلي" value={origRef} onChange={setOrigRef} />
                {singleItem?.isRefillable && (
                  <ImdSelect
                    label="حالة الأسطوانات المرتجعة"
                    value={cylReturn}
                    onChange={(v) => setCylReturn(v as CylReturnAction)}
                    options={[
                      { value: 'RETURN_FULL', label: 'مرتجع ممتلئة' },
                      { value: 'RETURN_EMPTY', label: 'مرتجع فارغة' },
                    ]}
                  />
                )}
              </>
            )}

            {tab === 'opening' && singleItem?.isRefillable && (
              <>
                <ImdFld label="أسطوانات ممتلئة" type="number" value={cylFull} onChange={setCylFull} />
                <ImdFld label="أسطوانات فارغة" type="number" value={cylEmpty} onChange={setCylEmpty} />
              </>
            )}

            <ImdFld label="ملاحظات السند" value={notes} onChange={setNotes} className="lg:col-span-2" />
          </div>

          {/* Destruction Committee Matrix */}
          {tab === 'destruction' && (
            <div className="mb-4 p-3 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] space-y-2" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">أعضاء لجنة الإتلاف (حسب ترتيب التوقيع)</span>
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setDestCommittee((prev) => [...prev, { name: '', rank: '', role: 'عضو لجنة' }])
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة عضو</span>
                </ImdButton>
              </div>
              <div className="space-y-1.5">
                {destCommittee.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                    <ImdFld
                      value={m.name}
                      onChange={(v) =>
                        setDestCommittee((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)))
                      }
                      placeholder="الاسم"
                    />
                    <ImdFld
                      value={m.rank}
                      onChange={(v) =>
                        setDestCommittee((prev) => prev.map((x, i) => (i === idx ? { ...x, rank: v } : x)))
                      }
                      placeholder="الرتبة"
                    />
                    <ImdFld
                      value={m.role}
                      onChange={(v) =>
                        setDestCommittee((prev) => prev.map((x, i) => (i === idx ? { ...x, role: v } : x)))
                      }
                      placeholder="الصفة في اللجنة"
                    />
                    <ImdButton
                      size="sm"
                      variant="ghost"
                      onClick={() => setDestCommittee((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                    </ImdButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Line Entry Table (ImdEntryTable) */}
          {isMultiLineTab && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ImdBarcodeInput onScan={addScannedItem} className="w-full md:w-80" />
                <ImdButton size="sm" variant="secondary" onClick={() => setLines((p) => [...p, makeDefaultLine()])}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة سطر صنف</span>
                </ImdButton>
              </div>

              <div className="overflow-x-auto border border-[var(--imd-line)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-[var(--imd-table-head)] border-b border-[var(--imd-line)]">
                    <tr>
                      <th className="p-2">م</th>
                      <th className="p-2 min-w-[230px]">الصنف + الرصيد المتاح</th>
                      <th className="p-2 min-w-[140px]">الوحدة</th>
                      <th className="p-2 w-24">الكمية</th>
                      <th className="p-2 w-28">بالأساس</th>
                      {(tab === 'receive' || tab === 'issue' || tab === 'transfer') && (
                        <th className="p-2 min-w-[160px]">{tab === 'receive' ? 'الصلاحية / الأسطوانة' : 'عملية الأسطوانة'}</th>
                      )}
                      <th className="p-2 w-20">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((ln, idx) => {
                      const it = db.items.find((x) => x.id === ln.itemId);
                      const whAvail = getWarehouseItemStock(ledger, warehouse, ln.itemId);
                      const baseNeed = ln.qty * ln.factor;
                      const isOutbound = tab === 'issue' || tab === 'transfer' || tab === 'destruction';
                      const isOverStock = isOutbound && baseNeed > whAvail;
                      const nearestBatch = isOutbound
                        ? db.receipts
                            .filter(
                              (r) =>
                                r.itemId === ln.itemId &&
                                r.warehouse === warehouse &&
                                isMovementActive(r.status) &&
                                Boolean(r.expiryDate)
                            )
                            .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]
                        : undefined;

                      return (
                        <tr key={ln.id} className="border-b border-[var(--imd-table-row-line)] align-bottom">
                          <td className="p-2 font-mono-num">{idx + 1}</td>
                          <td className="p-2 space-y-1">
                            <ImdItemPicker
                              label=""
                              value={ln.itemId}
                              onChange={(id) => changeLineItem(ln.id, id)}
                              warehouse={warehouse}
                            />
                            {it && (
                              <div className="flex flex-wrap items-center gap-2 text-[10px] tabular-nums text-[var(--imd-muted)]">
                                <span>
                                  رصيد المستودع:{' '}
                                  <strong style={{ color: whAvail > 0 ? 'var(--imd-accent)' : 'var(--imd-danger)' }}>
                                    {fmt(whAvail)} {it.baseUnit}
                                  </strong>
                                </span>
                                {nearestBatch && (
                                  <span>
                                    · أقدم صلاحية (FIFO):{' '}
                                    <strong className="font-mono-num text-[var(--imd-warn)]">
                                      {nearestBatch.expiryDate}
                                    </strong>
                                  </span>
                                )}
                                {isOverStock && (
                                  <span className="font-bold text-[var(--imd-danger)]">
                                    · تجاوز المتاح بالمستودع!
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <ImdUnitPicker
                              label=""
                              item={it}
                              unitName={ln.unitName}
                              onChange={(u, f) => updateLine(ln.id, { unitName: u, factor: f })}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={ln.qty}
                              onChange={(e) => updateLine(ln.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-full h-9 px-2 border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] tabular-nums"
                              style={{ borderRadius: 'var(--imd-radius-sm)' }}
                            />
                          </td>
                          <td
                            className="p-2 tabular-nums font-semibold"
                            style={{ color: isOverStock ? 'var(--imd-danger)' : undefined }}
                          >
                            {fmt(baseNeed)} {it?.baseUnit}
                          </td>
                          {(tab === 'receive' || tab === 'issue' || tab === 'transfer') && (
                            <td className="p-2 space-y-1">
                              {tab === 'receive' && (
                                <input
                                  type="date"
                                  value={ln.expiryDate}
                                  onChange={(e) => updateLine(ln.id, { expiryDate: e.target.value })}
                                  className="w-full h-8 px-1.5 text-[11px] border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
                                />
                              )}
                              {it?.isRefillable && (
                                <select
                                  value={ln.cylinderAction}
                                  onChange={(e) => updateLine(ln.id, { cylinderAction: e.target.value })}
                                  className="w-full h-8 px-1.5 text-[11px] border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
                                >
                                  {tab === 'receive' && (
                                    <>
                                      <option value="RECEIVE_FULL">استلام ممتلئة</option>
                                      <option value="RECEIVE_EMPTY">استلام فارغة</option>
                                      <option value="REFILL">عودة من التعبئة</option>
                                    </>
                                  )}
                                  {tab === 'issue' && (
                                    <>
                                      <option value="EXCHANGE">استبدال (ممتلئ مقابل فارغ)</option>
                                      <option value="CONSUME">إرسال للتعبئة الخارجية</option>
                                      <option value="ISSUE_FULL">صرف ممتلئة نهائياً</option>
                                      <option value="ISSUE_EMPTY">صرف فارغة</option>
                                    </>
                                  )}
                                  {tab === 'transfer' && (
                                    <>
                                      <option value="TRANSFER_FULL">تحويل ممتلئة</option>
                                      <option value="TRANSFER_EMPTY">تحويل فارغة</option>
                                    </>
                                  )}
                                </select>
                              )}
                            </td>
                          )}
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <ImdButton size="sm" variant="ghost" title="نسخ سطر" onClick={() => duplicateLine(ln)}>
                                <Copy className="w-3.5 h-3.5" />
                              </ImdButton>
                              {lines.length > 1 && (
                                <ImdButton
                                  size="sm"
                                  variant="ghost"
                                  title="حذف السطر"
                                  onClick={() => setLines((p) => p.filter((x) => x.id !== ln.id))}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                                </ImdButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ImdPanel>
      )}

      {/* Sticky Actions Bar (ImdStickyActions) */}
      {(tab !== 'receive' || receiveSubTab === 'new') && (tab !== 'issue' || issueSubTab === 'new') && (
        <ImdStickyActions
          left={
            <span className="tabular-nums">
              {isMultiLineTab ? (
                <>
                  عدد البنود: <strong>{fmt(lines.length, 0)}</strong> · إجمالي الكميات بالأساس:{' '}
                  <strong className="text-[var(--imd-text)]">{fmt(totalDraftBase)}</strong>
                </>
              ) : (
                <>
                  المتاح في {warehouse}: <strong>{fmt(singleWhStock)} {singleItem?.baseUnit}</strong> · المكافئ:{' '}
                  <strong>{fmt(singleBaseQty)}</strong>
                </>
              )}
            </span>
          }
          right={
            <>
              {tab === 'receive' && (
                <>
                  <ImdButton variant="secondary" onClick={() => handleSaveReceive(true)}>
                    <FileText className="w-4 h-4" />
                    <span>حفظ كمسودة</span>
                  </ImdButton>
                  <ImdButton variant="orange" onClick={() => handleSaveReceive(false)}>
                    <Save className="w-4 h-4" />
                    <span>اعتماد وتنفيذ التوريد والطباعة</span>
                  </ImdButton>
                </>
              )}
              {tab === 'issue' && (
                <>
                  <ImdButton variant="secondary" onClick={() => void handleSaveIssue('DRAFT')}>
                    <FileText className="w-4 h-4" />
                    <span>حفظ كمسودة</span>
                  </ImdButton>
                  <ImdButton variant="secondary" onClick={() => void handleSaveIssue('ORDER')}>
                    <FileText className="w-4 h-4" />
                    <span>إرسال كأمر توجيه</span>
                  </ImdButton>
                  <ImdButton variant="primary" onClick={() => void handleSaveIssue('COMPLETED')}>
                    <Save className="w-4 h-4" />
                    <span>فحص القواعد واعتماد الصرف والطباعة</span>
                  </ImdButton>
                </>
              )}
              {tab === 'transfer' && (
                <ImdButton variant="primary" onClick={handleSaveTransfer}>
                  <Save className="w-4 h-4" />
                  <span>إصدار إذن التحويل (قيد التسليم)</span>
                </ImdButton>
              )}
              {tab === 'returns' && (
                <ImdButton variant="primary" onClick={handleSaveReturn}>
                  <Save className="w-4 h-4" />
                  <span>تسجيل المرتجع</span>
                </ImdButton>
              )}
              {tab === 'opening' && (
                <ImdButton variant="primary" onClick={handleSaveOpening}>
                  <Save className="w-4 h-4" />
                  <span>تثبيت الرصيد الافتتاحي</span>
                </ImdButton>
              )}
              {tab === 'destruction' && (
                <ImdButton variant="danger" onClick={handleSaveDestruction}>
                  <Save className="w-4 h-4" />
                  <span>اعتماد محضر الإتلاف</span>
                </ImdButton>
              )}
            </>
          }
        />
      )}

      <ImdPanel title="السجلات والحركات المسجلة">
        <ImdTable
          columns={commonCols}
          rows={activeRows as unknown as Record<string, unknown>[]}
          rowKey={(r, idx) => String(r.id ?? idx)}
          enableColumnFilter
        />
      </ImdPanel>

      {/* Quick Add Supplier Modal */}
      <ImdModal
        open={quickSupOpen}
        onClose={() => setQuickSupOpen(false)}
        title="إضافة مورد سريع"
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setQuickSupOpen(false)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleQuickAddSupplier}>حفظ وتحديد المورد</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdFld label="اسم المورد / الشركة" value={quickSupName} onChange={setQuickSupName} />
          <ImdFld label="رقم الهاتف" value={quickSupPhone} onChange={setQuickSupPhone} />
          <ImdFld label="المدينة" value={quickSupCity} onChange={setQuickSupCity} />
        </div>
      </ImdModal>

      {/* Reject Transfer Modal */}
      <ImdModal
        open={Boolean(rejectModal)}
        onClose={() => setRejectModal(null)}
        title={`رفض التحويل ${rejectModal?.refNo ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setRejectModal(null)}>تراجع</ImdButton>
            <ImdButton variant="danger" onClick={handleConfirmRejectTransfer}>رفض وإرجاع الرصيد للمصدر</ImdButton>
          </>
        }
      >
        <ImdFld
          label="سبب رفض الاستلام الإلزامي"
          value={rejectReason}
          onChange={setRejectReason}
          placeholder="اكتب سبب الرفض (نقص، تلف أثناء النقل...)"
        />
      </ImdModal>

      {/* RuleDecision Modal */}
      <ImdModal
        open={Boolean(ruleModal)}
        onClose={() => setRuleModal(null)}
        title="مراجعة محرك القواعد (RuleDecision)"
        widthClass="max-w-lg"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setRuleModal(null)}>
              إلغاء الصرف
            </ImdButton>
            {ruleModal &&
              (ruleModal.result.decision === 'softWarningRequiresReason' ||
                currentUser?.role === 'owner') && (
                <ImdButton
                  variant={
                    ruleModal.result.decision === 'hardLockRequiresOwnerSign' ? 'danger' : 'primary'
                  }
                  onClick={async () => {
                    if (!overrideReason.trim()) {
                      notify('يجب كتابة مبرر التجاوز قبل المتابعة', 'danger');
                      return;
                    }
                    const list = ruleModal.pendingIssues;
                    setRuleModal(null);
                    await finalizeIssues(list, overrideReason.trim());
                  }}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>
                    {ruleModal.result.decision === 'hardLockRequiresOwnerSign'
                      ? 'اعتماد بتوقيع المالك'
                      : 'متابعة مع تسجيل المبرر'}
                  </span>
                </ImdButton>
              )}
          </>
        }
      >
        {ruleModal && (
          <div className="space-y-3">
            <ImdNote
              tone={ruleModal.result.decision === 'hardLockRequiresOwnerSign' ? 'danger' : 'note'}
              title={
                ruleModal.result.decision === 'hardLockRequiresOwnerSign'
                  ? 'قفل إلزامي — يتطلب توقيع المالك ومبرر مكتوب'
                  : 'تنبيه استحقاق — يتطلب تسجيل مبرر مكتوب'
              }
            >
              <ul className="list-disc pr-4 space-y-1 mt-1">
                {ruleModal.result.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </ImdNote>
            {ruleModal.result.decision === 'hardLockRequiresOwnerSign' &&
              currentUser?.role !== 'owner' && (
                <ImdNote tone="danger">
                  حسابك الحالي ({currentUser?.name}) لا يملك صلاحية المالك لفك القفل الإلزامي.
                </ImdNote>
              )}
            <ImdFld
              label="المبرر المكتوب (يُسجّل في سجل التدقيق الحساس)"
              value={overrideReason}
              onChange={setOverrideReason}
              placeholder="مثال: تغطية تمرين ميداني طارئ بأمر القائد..."
            />
          </div>
        )}
      </ImdModal>
    </ImdPage>
  );
};
