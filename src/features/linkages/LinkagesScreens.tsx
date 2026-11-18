// Linkages Screens (Part 2 Complete: Photo Upload + Auto "متجاوز" detection, Custody Sheet Duplicate Invoice Highlighting, Money Receipt Arabic Tafkeet + Print, Armaments Return)

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  FileSignature,
  FileSpreadsheet,
  History,
  Plus,
  Printer,
  Shield,
  Upload,
  UserCheck,
  Users,
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
import { exportRowsToXlsx } from '../../core/export/excelEngine';
import { todayIso } from '../../core/ui/imdTokens';
import { amountToArabicWords } from '../../core/arabicWords';
import {
  buildContractOfficialDoc,
  buildCustodySheetHorizontalDoc,
  buildMoneyReceiptDoc,
} from '../../core/print/specializedTemplates';
import type {
  LinkArmament,
  LinkClearance,
  LinkCustodySheet,
  LinkCustodySheetRow,
  LinkFinCustody,
  LinkFinanceLedger,
  LinkMoneyReceipt,
  LinkPerson,
  LinkPurchaseContract,
  LinkStatusLog,
  PersonStatus,
} from '../../domain/types';

const STATUS_LABELS: Record<PersonStatus, string> = {
  present: 'حاضر / على رأس العمل',
  leave: 'إجازة',
  mission: 'مهمة',
  sick: 'مريض',
  absent: 'غائب',
  transferred: 'منقول',
  retired: 'متقاعد',
};

export const PersonnelStrengthScreen: React.FC = () => {
  const { db, currentUser, navIntent, clearNavIntent, upsertRow, mutateDb, notify, fmt } = useEmdad();
  const [fullName, setFullName] = useState('');
  const [milNo, setMilNo] = useState('');
  const [rank, setRank] = useState('رقيب');
  const [section, setSection] = useState('شعبة الإمداد');
  const [job, setJob] = useState('إداري');
  const [photoPath, setPhotoPath] = useState('');
  const [statusToDate, setStatusToDate] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [historyPerson, setHistoryPerson] = useState<LinkPerson | null>(null);

  const today = todayIso();

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'personnel') return;
    if (navIntent.searchQuery) {
      setSearch(navIntent.searchQuery);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoPath(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddPerson = () => {
    if (!fullName.trim()) return;
    const now = new Date().toISOString();
    const p: LinkPerson = {
      id: Ids.next('per'),
      fullName: fullName.trim(),
      militaryNo: milNo.trim(),
      rank,
      phone: '',
      phone2: '',
      photoPath,
      subUnit: 'قيادة الشعبة',
      camp: 'معسكر النصر',
      section,
      job,
      status: 'present',
      statusFrom: today,
      statusTo: statusToDate,
      statusDays: 0,
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('link_persons', p);
    setFullName('');
    setMilNo('');
    setPhotoPath('');
    notify(`تمت إضافة ${p.rank} / ${p.fullName}`, 'success');
  };

  const changePersonStatus = (person: LinkPerson, newStatus: PersonStatus) => {
    const now = new Date().toISOString();
    const toDate = newStatus === 'present' ? '' : person.statusTo || today;
    const log: LinkStatusLog = {
      id: Ids.next('lsl'),
      personId: person.id,
      personName: person.fullName,
      status: newStatus,
      fromDate: today,
      toDate,
      days: 1,
      returnAction: newStatus === 'present' ? 'عودة مسجلة' : '',
      notes: `تغيير الحالة إلى ${STATUS_LABELS[newStatus]}`,
      actor: currentUser?.name ?? '',
      createdAt: now,
    };
    mutateDb((prev) => ({
      ...prev,
      link_persons: prev.link_persons.map((p) =>
        p.id === person.id
          ? { ...p, status: newStatus, statusFrom: today, statusTo: toDate, updatedAt: now }
          : p
      ),
      link_status_logs: [log, ...prev.link_status_logs],
    }));
    notify(`تم تحديث حالة ${person.fullName}`, 'info');
  };

  const isOverdue = (p: LinkPerson): boolean =>
    p.status !== 'present' &&
    p.status !== 'retired' &&
    p.status !== 'transferred' &&
    Boolean(p.statusTo) &&
    p.statusTo < today;

  const overdueCount = useMemo(() => db.link_persons.filter(isOverdue).length, [db.link_persons]);
  const presentCount = useMemo(
    () => db.link_persons.filter((p) => p.status === 'present').length,
    [db.link_persons]
  );
  const awayCount = useMemo(
    () => db.link_persons.filter((p) => p.status === 'leave' || p.status === 'mission' || p.status === 'sick').length,
    [db.link_persons]
  );

  const filteredPersons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (onlyOverdue ? db.link_persons.filter(isOverdue) : db.link_persons).filter((p) =>
      !q
        ? true
        : p.fullName.toLowerCase().includes(q) ||
          p.militaryNo.toLowerCase().includes(q) ||
          p.rank.toLowerCase().includes(q) ||
          p.section.toLowerCase().includes(q) ||
          p.job.toLowerCase().includes(q)
    );
  }, [db.link_persons, onlyOverdue, search]);

  const historyLogs = useMemo(
    () =>
      historyPerson
        ? db.link_status_logs.filter((l) => l.personId === historyPerson.id)
        : db.link_status_logs,
    [db.link_status_logs, historyPerson]
  );

  return (
    <ImdPage
      title="القوة البشرية للإمداد"
      subtitle="بطاقة الفرد بالصورة الشخصية · الرقم العسكري · الحالات المؤرخة · كشف المتجاوزين تلقائياً"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ImdKpiCard
          label="إجمالي القوة المسجلة"
          value={fmt(db.link_persons.length, 0)}
          icon={<Users className="w-4 h-4" />}
          tone="accent"
          meta="ضباط وأفراد شعبة الإمداد"
        />
        <ImdKpiCard
          label="حاضر / على رأس العمل"
          value={fmt(presentCount, 0)}
          icon={<UserCheck className="w-4 h-4" />}
          tone="success"
          meta={db.link_persons.length > 0 ? `${Math.round((presentCount / db.link_persons.length) * 100)}% نسبة الحضور` : '0%'}
        />
        <ImdKpiCard
          label="في إجازة / مهمة / مرضي"
          value={fmt(awayCount, 0)}
          icon={<History className="w-4 h-4" />}
          tone="warn"
          meta={`${fmt(db.link_status_logs.length, 0)} حركة حالة مسجلة`}
        />
        <ImdKpiCard
          label="المتجاوزون المتأخرون"
          value={fmt(overdueCount, 0)}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone={overdueCount > 0 ? 'danger' : 'success'}
          meta={onlyOverdue ? 'انقر لعرض الكل' : 'انقر لتصفية المتجاوزين'}
          onClick={() => setOnlyOverdue((v) => !v)}
        />
      </div>

      <ImdPanel title="إضافة فرد / ضابط">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
          <ImdFld label="الاسم الكامل" value={fullName} onChange={setFullName} className="md:col-span-2" />
          <ImdFld label="الرقم العسكري" value={milNo} onChange={setMilNo} />
          <ImdFld label="الرتبة" value={rank} onChange={setRank} />
          <ImdFld label="القسم" value={section} onChange={setSection} />
          <label className="inline-flex items-center justify-center gap-1.5 h-9 px-3 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] cursor-pointer hover:bg-[var(--imd-hover)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
            <Upload className="w-3.5 h-3.5" />
            <span>{photoPath ? 'تم اختيار الصورة' : 'صورة شخصية'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </label>
          <ImdButton variant="primary" onClick={handleAddPerson}>
            <Plus className="w-4 h-4" />
            <span>إضافة</span>
          </ImdButton>
        </div>
      </ImdPanel>

      <ImdPanel
        title="قائمة الأفراد وحالات التمام"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <ImdFld
              value={search}
              onChange={setSearch}
              placeholder="بحث بالاسم أو الرقم العسكري..."
              className="w-56"
            />
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={onlyOverdue}
                onChange={(e) => setOnlyOverdue(e.target.checked)}
              />
              <span>المتجاوزون فقط ({overdueCount})</span>
            </label>
            <ImdButton
              size="sm"
              variant="secondary"
              onClick={() => setHistoryPerson({ id: '', fullName: 'كافة الأفراد' } as LinkPerson)}
            >
              <History className="w-3.5 h-3.5" />
              <span>سجل الحالات العام ({db.link_status_logs.length})</span>
            </ImdButton>
          </div>
        }
      >
        <ImdTable
          columns={[
            {
              key: 'ph',
              header: 'الصورة',
              render: (r) =>
                r.photoPath ? (
                  <img src={r.photoPath} alt={r.fullName} className="w-8 h-8 object-cover border border-[var(--imd-line)]" />
                ) : (
                  <div className="w-8 h-8 flex items-center justify-center border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-[10px] text-[var(--imd-muted)]">
                    صورة
                  </div>
                ),
            },
            { key: 'mil', header: 'الرقم العسكري', render: (r) => <span className="font-mono-num">{r.militaryNo || '—'}</span> },
            { key: 'rk', header: 'الرتبة', render: (r) => r.rank },
            { key: 'nm', header: 'الاسم', render: (r) => <strong>{r.fullName}</strong> },
            { key: 'sec', header: 'القسم والوظيفة', render: (r) => `${r.section} · ${r.job}` },
            {
              key: 'st',
              header: 'الحالة الحالية',
              render: (r) =>
                isOverdue(r) ? (
                  <ImdStatusText label={`متجاوز (انتهى ${r.statusTo})`} tone="danger" />
                ) : (
                  <ImdStatusText
                    label={STATUS_LABELS[r.status]}
                    tone={r.status === 'present' ? 'success' : r.status === 'absent' ? 'danger' : 'warn'}
                  />
                ),
            },
            {
              key: 'to',
              header: 'تاريخ العودة المقرر',
              render: (r) => (
                <input
                  type="date"
                  value={r.statusTo}
                  onChange={(e) =>
                    upsertRow('link_persons', { ...r, statusTo: e.target.value, updatedAt: new Date().toISOString() })
                  }
                  className="h-7 px-1.5 text-xs border border-[var(--imd-line)] bg-[var(--imd-field-fill)]"
                />
              ),
            },
            {
              key: 'chg',
              header: 'تحديث الحالة والسجل',
              render: (r) => (
                <div className="flex items-center gap-1">
                  <select
                    value={r.status}
                    onChange={(e) => changePersonStatus(r, e.target.value as PersonStatus)}
                    className="h-8 px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <ImdButton
                    size="sm"
                    variant="ghost"
                    title="سجل تغييرات الفرد"
                    onClick={() => setHistoryPerson(r)}
                  >
                    <History className="w-3.5 h-3.5" />
                  </ImdButton>
                </div>
              ),
            },
          ]}
          rows={filteredPersons}
          rowKey={(r) => r.id}
        />
      </ImdPanel>

      <ImdModal
        open={Boolean(historyPerson)}
        onClose={() => setHistoryPerson(null)}
        title={`سجل الحالات المؤرخة (link_status_logs) — ${historyPerson?.fullName ?? ''}`}
        widthClass="max-w-3xl"
        footer={
          <ImdButton variant="primary" onClick={() => setHistoryPerson(null)}>
            إغلاق
          </ImdButton>
        }
      >
        <ImdTable
          columns={[
            { key: 'p', header: 'الفرد', render: (r) => r.personName },
            { key: 'st', header: 'الحالة', render: (r) => STATUS_LABELS[r.status] },
            { key: 'fr', header: 'من', numeric: true, render: (r) => r.fromDate },
            { key: 'to', header: 'إلى', numeric: true, render: (r) => r.toDate || '—' },
            { key: 'act', header: 'المنفّذ', render: (r) => r.actor },
            { key: 'nt', header: 'ملاحظات', render: (r) => r.notes },
          ]}
          rows={historyLogs}
          rowKey={(r) => r.id}
          reportCountToStatusBar={false}
        />
      </ImdModal>
    </ImdPage>
  );
};

export const LinkagesScreen: React.FC = () => {
  const { db, currentUser, navIntent, clearNavIntent, upsertRow, mutateDb, nextDocRef, notify, openPrintPreview, fmt } =
    useEmdad();
  const [tab, setTab] = useState<
    'custodies' | 'clearances' | 'contracts' | 'sheets' | 'receipts' | 'ledger' | 'armaments'
  >('custodies');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'linkages') return;
    if (
      navIntent.subTab === 'custodies' ||
      navIntent.subTab === 'clearances' ||
      navIntent.subTab === 'contracts' ||
      navIntent.subTab === 'sheets' ||
      navIntent.subTab === 'receipts' ||
      navIntent.subTab === 'ledger' ||
      navIntent.subTab === 'armaments'
    ) {
      setTab(navIntent.subTab);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  // Custody form
  const [custHolder, setCustHolder] = useState('');
  const [custTitle, setCustTitle] = useState('');
  const [custAmount, setCustAmount] = useState('10000');
  const [custCur, setCustCur] = useState<'sar' | 'yer'>('sar');

  // Clearance form
  const [clrCustodyId, setClrCustodyId] = useState(db.link_fin_custodies[0]?.id ?? '');
  const [clrSpent, setClrSpent] = useState('25000');

  // Contract form
  const [conTitle, setConTitle] = useState('');
  const [conSup, setConSup] = useState(db.suppliers[0]?.name ?? '');
  const [conAmount, setConAmount] = useState('30000');

  // Custody sheet selector + creation + row form
  const [activeSheetId, setActiveSheetId] = useState(db.link_custody_sheets[0]?.id ?? 'cs_1');
  const [newSheetName, setNewSheetName] = useState('');
  const [shStmt, setShStmt] = useState('');
  const [shSpentSar, setShSpentSar] = useState('0');
  const [shInvoiceNo, setShInvoiceNo] = useState('');
  const [shShop, setShShop] = useState('');

  // Money receipt form
  const [mrReceiver, setMrReceiver] = useState('');
  const [mrAmount, setMrAmount] = useState('5000');
  const [mrCur, setMrCur] = useState<'sar' | 'yer'>('sar');
  const [mrPurpose, setMrPurpose] = useState('');

  // Armament form
  const [armPersonId, setArmPersonId] = useState(db.link_persons[0]?.id ?? '');
  const [armWeapon, setArmWeapon] = useState('بندقية آلية AK-103');
  const [armSerial, setArmSerial] = useState('');
  const [armAmmo, setArmAmmo] = useState('90');

  // Finance statement filters
  const [stmtParty, setStmtParty] = useState('ALL');
  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');

  const handleAddCustody = () => {
    if (!custHolder.trim() || !custTitle.trim()) return;
    const amt = Number(custAmount) || 0;
    const refNo = nextDocRef('custody');
    const now = new Date().toISOString();
    const id = Ids.next('fc');
    const rec: LinkFinCustody = {
      id,
      custodyNo: refNo,
      holder: custHolder.trim(),
      title: custTitle.trim(),
      serialNo: '',
      qty: 1,
      unit: 'عهدة',
      valueAmount: amt,
      custodyDate: todayIso(),
      dueDate: '',
      kind: 'delivered',
      amount: amt,
      currency: custCur,
      exchangeRate: 1,
      giverName: 'الصندوق المالي',
      receiverName: custHolder.trim(),
      status: 'open',
      outcome: 'matched',
      outcomeAmount: 0,
      sourceDocNo: '',
      costCenter: 'الإمداد',
      attachmentsJson: [],
      cleared: false,
      clearedDate: '',
      clearanceNotes: '',
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    const led: LinkFinanceLedger = {
      id: Ids.next('fl'),
      partyName: custHolder.trim(),
      custodyId: id,
      clearanceId: '',
      entryKind: 'delivered',
      delta: amt,
      currency: custCur,
      entryDate: todayIso(),
      note: custTitle.trim(),
      receiptId: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
    };
    mutateDb((prev) => ({
      ...prev,
      link_fin_custodies: [rec, ...prev.link_fin_custodies],
      link_finance_ledger: [led, ...prev.link_finance_ledger],
    }));
    setCustHolder('');
    setCustTitle('');
    notify(`تم قيد العهدة المالية ${refNo}`, 'success');
  };

  const handleCreateClearance = (initialWorkflow: 'draft' | 'approved' = 'draft') => {
    const c = db.link_fin_custodies.find((x) => x.id === clrCustodyId);
    if (!c) return;
    const spent = Number(clrSpent) || 0;
    const diff = c.amount - spent;
    const diffType = Math.abs(diff) < 0.01 ? 'matched' : diff > 0 ? 'surplus' : 'deficit';
    const refNo = nextDocRef('clearance');
    const clr: LinkClearance = {
      id: Ids.next('clr'),
      clearanceNo: refNo,
      kind: 'custody',
      refId: c.id,
      refTitle: c.title,
      partyName: c.holder,
      amount: spent,
      clearanceDate: todayIso(),
      custodyNo: c.custodyNo,
      currency: c.currency,
      grantedAmount: c.amount,
      spentAmount: spent,
      diffType,
      surplusAmount: diff > 0 ? diff : 0,
      deficitAmount: diff < 0 ? Math.abs(diff) : 0,
      counterpartyName: c.holder,
      workflow: initialWorkflow,
      docNo: refNo,
      clearerName: currentUser?.name ?? '',
      reviewDate: initialWorkflow === 'approved' ? todayIso() : '',
      adminNotes: '',
      attachName: '',
      attachPath: '',
      attachSha256: '',
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: new Date().toISOString(),
    };
    mutateDb((prev) => ({
      ...prev,
      link_clearances: [clr, ...prev.link_clearances],
      link_fin_custodies:
        initialWorkflow === 'approved'
          ? prev.link_fin_custodies.map((x) =>
              x.id === c.id
                ? {
                    ...x,
                    status: 'cleared',
                    cleared: true,
                    clearedDate: todayIso(),
                    outcome: diffType,
                    outcomeAmount: Math.abs(diff),
                  }
                : x
            )
          : prev.link_fin_custodies,
    }));
    notify(
      initialWorkflow === 'draft'
        ? `تم حفظ مسودة الإخلاء ${refNo} (بانتظار الإرسال والاعتماد)`
        : `تم إخلاء العهدة ${c.custodyNo} (${diffType === 'matched' ? 'مطابق' : diffType === 'surplus' ? 'فائض' : 'عجز'})`,
      'success'
    );
  };

  const advanceClearanceStage = (clr: LinkClearance, nextStage: 'sent' | 'approved') => {
    mutateDb((prev) => ({
      ...prev,
      link_clearances: prev.link_clearances.map((x) =>
        x.id === clr.id
          ? {
              ...x,
              workflow: nextStage,
              reviewDate: nextStage === 'approved' ? todayIso() : x.reviewDate,
            }
          : x
      ),
      link_fin_custodies:
        nextStage === 'approved'
          ? prev.link_fin_custodies.map((c) =>
              c.id === clr.refId
                ? {
                    ...c,
                    status: 'cleared',
                    cleared: true,
                    clearedDate: todayIso(),
                    outcome: clr.diffType,
                    outcomeAmount: Math.max(clr.surplusAmount, clr.deficitAmount),
                  }
                : c
            )
          : prev.link_fin_custodies,
    }));
    notify(
      nextStage === 'sent'
        ? `تم إرسال الإخلاء ${clr.clearanceNo} للمراجعة`
        : `تم اعتماد الإخلاء النهائي ${clr.clearanceNo} وتصفية العهدة`,
      'success'
    );
  };

  const handleAddContract = () => {
    if (!conTitle.trim()) return;
    const refNo = nextDocRef('contract');
    const now = new Date().toISOString();
    const c: LinkPurchaseContract = {
      id: Ids.next('con'),
      contractNo: refNo,
      title: conTitle.trim(),
      supplier: conSup,
      currency: 'sar',
      exchangeRate: 1,
      listDate: todayIso(),
      custodyId: '',
      invoiceNo: '',
      itemsJson: [],
      amount: Number(conAmount) || 0,
      endDate: '',
      status: 'active',
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('link_purchase_contracts', c);
    setConTitle('');
    notify(`تم تسجيل عقد الشراء ${refNo}`, 'success');
  };

  const handleCreateSheet = () => {
    if (!newSheetName.trim()) return;
    const now = new Date().toISOString();
    const id = Ids.next('cs');
    const sheet: LinkCustodySheet = {
      id,
      sheetNo: `SH-${db.link_custody_sheets.length + 1}`,
      title: newSheetName.trim(),
      custodyId: '',
      currency: 'sar',
      holderName: currentUser?.name ?? '',
      defaultRate: 1,
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('link_custody_sheets', sheet);
    setActiveSheetId(id);
    setNewSheetName('');
    notify(`تم إنشاء مسير العهدة "${sheet.title}"`, 'success');
  };

  const handleAddSheetRow = () => {
    if (!shStmt.trim()) return;
    const targetSheetId = activeSheetId || db.link_custody_sheets[0]?.id || 'cs_1';
    const currentRows = db.link_custody_sheet_rows.filter((r) => r.sheetId === targetSheetId);
    const row: LinkCustodySheetRow = {
      id: Ids.next('csr'),
      sheetId: targetSheetId,
      seq: currentRows.length + 1,
      date: todayIso(),
      grantSar: 0,
      grantYer: 0,
      returnSar: 0,
      returnYer: 0,
      spentSar: Number(shSpentSar) || 0,
      spentYer: 0,
      rate: 1,
      person: currentUser?.name ?? '',
      statement: shStmt.trim(),
      category: 'مشتريات',
      entryNo: String(100 + db.link_custody_sheet_rows.length + 1),
      invoiceNo: shInvoiceNo.trim(),
      shop: shShop.trim(),
      notes: '',
    };
    upsertRow('link_custody_sheet_rows', row);
    setShStmt('');
    setShInvoiceNo('');
    notify('تمت إضافة سطر إلى مسير العهدة', 'success');
  };

  const handleAddMoneyReceipt = () => {
    if (!mrReceiver.trim()) return;
    const now = new Date().toISOString();
    const rec: LinkMoneyReceipt = {
      id: Ids.next('mr'),
      receiverName: mrReceiver.trim(),
      capacity: 'مستلم عهدة',
      amount: Number(mrAmount) || 0,
      currency: mrCur,
      receiptDate: todayIso(),
      purpose: mrPurpose.trim() || 'دفعة مالية',
      method: 'cash',
      transferNo: '',
      delivererName: currentUser?.name ?? 'أمين الصندوق',
      attachments: [],
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('link_money_receipts', rec);
    setMrReceiver('');
    setMrPurpose('');
    notify('تم إصدار سند استلام المبلغ مع التفقيط التلقائي', 'success');
  };

  const handleAddArmament = () => {
    const p = db.link_persons.find((x) => x.id === armPersonId);
    if (!p || !armSerial.trim()) return;
    const now = new Date().toISOString();
    const a: LinkArmament = {
      id: Ids.next('arm'),
      personId: p.id,
      personName: p.fullName,
      personMilitaryNo: p.militaryNo,
      weaponType: armWeapon,
      serialNo: armSerial.trim(),
      qty: 1,
      magazines: 4,
      magazineType: '30 طلقة',
      ammoQty: Number(armAmmo) || 0,
      assignedDate: todayIso(),
      returned: false,
      returnedDate: '',
      condition: 'جيدة',
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('link_armaments', a);
    setArmSerial('');
    notify(`تم تسليم السلاح (${a.serialNo}) إلى ${p.fullName}`, 'success');
  };

  // Detect duplicate invoiceNo in Custody Sheet Rows
  const sheetRows = useMemo(
    () =>
      db.link_custody_sheets.length > 0
        ? db.link_custody_sheet_rows.filter((r) => r.sheetId === activeSheetId)
        : db.link_custody_sheet_rows,
    [db.link_custody_sheet_rows, db.link_custody_sheets.length, activeSheetId]
  );
  const dupInvoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of db.link_custody_sheet_rows) {
      const inv = r.invoiceNo.trim();
      if (!inv) continue;
      counts.set(inv, (counts.get(inv) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, c]) => c > 1).map(([k]) => k));
  }, [db.link_custody_sheet_rows]);

  const stmtParties = useMemo(() => {
    const set = new Set<string>();
    for (const e of db.link_finance_ledger) {
      if (e.partyName.trim()) set.add(e.partyName.trim());
    }
    return Array.from(set).sort();
  }, [db.link_finance_ledger]);

  const statementRows = useMemo(() => {
    const filtered = db.link_finance_ledger
      .filter((e) => stmtParty === 'ALL' || e.partyName.trim() === stmtParty)
      .filter((e) => (!stmtFrom || e.entryDate >= stmtFrom) && (!stmtTo || e.entryDate <= stmtTo))
      .slice()
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.createdAt.localeCompare(b.createdAt));

    const runningByCur = { sar: 0, yer: 0 };
    return filtered.map((e) => {
      const absAmt = Math.abs(Number(e.delta) || 0);
      const isDebitKind =
        e.entryKind === 'delivered' || e.entryKind === 'deficit' || (e.entryKind === 'reversal' && e.delta < 0);
      const debit = isDebitKind ? absAmt : 0;
      const credit = isDebitKind ? 0 : absAmt;
      runningByCur[e.currency] += credit - debit;
      return {
        ...e,
        debit,
        credit,
        runningBalance: runningByCur[e.currency],
      };
    });
  }, [db.link_finance_ledger, stmtParty, stmtFrom, stmtTo]);

  const openCustodies = useMemo(
    () => db.link_fin_custodies.filter((c) => c.status === 'open'),
    [db.link_fin_custodies]
  );
  const pendingClearances = useMemo(
    () => db.link_clearances.filter((c) => c.workflow !== 'approved'),
    [db.link_clearances]
  );
  const activeContracts = useMemo(
    () => db.link_purchase_contracts.filter((c) => c.status === 'active'),
    [db.link_purchase_contracts]
  );
  const activeArmaments = useMemo(
    () => db.link_armaments.filter((a) => !a.returned),
    [db.link_armaments]
  );

  return (
    <ImdPage
      title="الارتباطات: المالية والتسليح"
      subtitle="العهد المالية · الإخلاءات · عقود الشراء · مسير العهدة (كشف الفواتير المكررة) · سندات القبض (بالتفقيط العربي) · التسليح"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <ImdKpiCard
          label="العهد المالية المفتوحة"
          value={fmt(openCustodies.length, 0)}
          icon={<Banknote className="w-4 h-4" />}
          tone={openCustodies.length > 0 ? 'warn' : 'success'}
          meta={`SAR ${fmt(openCustodies.filter((c) => c.currency === 'sar').reduce((s, c) => s + c.amount, 0), 0)}`}
          onClick={() => setTab('custodies')}
        />
        <ImdKpiCard
          label="إخلاءات بانتظار الاعتماد"
          value={fmt(pendingClearances.length, 0)}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone={pendingClearances.length > 0 ? 'info' : 'success'}
          meta={`${fmt(dupInvoices.size, 0)} فواتير مكررة بمسير العهدة`}
          onClick={() => setTab('clearances')}
        />
        <ImdKpiCard
          label="عقود الشراء السارية"
          value={fmt(activeContracts.length, 0)}
          icon={<FileSignature className="w-4 h-4" />}
          tone="accent"
          meta={`بقيمة ${fmt(activeContracts.reduce((s, c) => s + c.amount, 0), 0)} SAR`}
          onClick={() => setTab('contracts')}
        />
        <ImdKpiCard
          label="السلاح والذخيرة في العهدة"
          value={fmt(activeArmaments.length, 0)}
          icon={<Shield className="w-4 h-4" />}
          tone="default"
          meta={`${fmt(activeArmaments.reduce((s, a) => s + a.ammoQty, 0), 0)} طلقة مصروفة`}
          onClick={() => setTab('armaments')}
        />
      </div>

      <ImdTabs
        active={tab}
        onChange={(v) => setTab(v as typeof tab)}
        tabs={[
          { id: 'custodies', label: 'العهد المالية', count: db.link_fin_custodies.length },
          { id: 'clearances', label: 'الإخلاءات', count: db.link_clearances.length },
          { id: 'contracts', label: 'عقود الشراء', count: db.link_purchase_contracts.length },
          { id: 'sheets', label: 'مسير العهدة', count: db.link_custody_sheet_rows.length },
          { id: 'receipts', label: 'سندات استلام المبالغ', count: db.link_money_receipts.length },
          { id: 'ledger', label: 'دفتر رصيد المالية', count: db.link_finance_ledger.length },
          { id: 'armaments', label: 'التسليح والعهدة الفردية', count: db.link_armaments.length },
        ]}
      />

      {tab === 'custodies' && (
        <div className="space-y-4">
          <ImdPanel title="قيد عهدة مالية جديدة">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdFld label="صاحب العهدة" value={custHolder} onChange={setCustHolder} />
              <ImdFld label="البيان / الغرض" value={custTitle} onChange={setCustTitle} className="md:col-span-2" />
              <div className="grid grid-cols-2 gap-2">
                <ImdFld label="المبلغ" type="number" value={custAmount} onChange={setCustAmount} />
                <ImdSelect
                  label="العملة"
                  value={custCur}
                  onChange={(v) => setCustCur(v as 'sar' | 'yer')}
                  options={[
                    { value: 'sar', label: 'SAR' },
                    { value: 'yer', label: 'YER' },
                  ]}
                />
              </div>
              <ImdButton variant="primary" onClick={handleAddCustody}>حفظ العهدة</ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'no', header: 'رقم العهدة', render: (r) => <span className="font-mono-num">{r.custodyNo}</span> },
                { key: 'h', header: 'المستفيد', render: (r) => r.holder },
                { key: 't', header: 'البيان', render: (r) => r.title },
                { key: 'a', header: 'المبلغ', numeric: true, render: (r) => `${fmt(r.amount)} ${r.currency.toUpperCase()}` },
                { key: 'st', header: 'الحالة', render: (r) => <ImdStatusText label={r.status === 'open' ? 'مفتوحة' : 'مُخلاّة'} tone={r.status === 'open' ? 'warn' : 'success'} /> },
              ]}
              rows={db.link_fin_custodies}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'clearances' && (
        <div className="space-y-4">
          <ImdPanel title="إخلاء وتصفية عهدة مفتوحة (سير العمل: مسودة → مرسلة → معتمدة)">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <ImdSelect
                label="العهدة"
                value={clrCustodyId}
                onChange={setClrCustodyId}
                options={db.link_fin_custodies.map((c) => ({ value: c.id, label: `${c.custodyNo} — ${c.holder} (${fmt(c.amount)})` }))}
                className="md:col-span-2"
              />
              <ImdFld label="المبلغ المنصرف الفعلي" type="number" value={clrSpent} onChange={setClrSpent} />
              <div className="flex items-center gap-2">
                <ImdButton variant="secondary" onClick={() => handleCreateClearance('draft')}>حفظ مسودة</ImdButton>
                <ImdButton variant="primary" onClick={() => handleCreateClearance('approved')}>اعتماد مباشر</ImdButton>
              </div>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'no', header: 'رقم الإخلاء', render: (r) => <span className="font-mono-num">{r.clearanceNo}</span> },
                { key: 'p', header: 'الطرف', render: (r) => r.partyName },
                { key: 'g', header: 'الممنوح', numeric: true, render: (r) => fmt(r.grantedAmount) },
                { key: 's', header: 'المصروف', numeric: true, render: (r) => fmt(r.spentAmount) },
                {
                  key: 'df',
                  header: 'النتيجة',
                  render: (r) => (
                    <ImdStatusText
                      label={r.diffType === 'matched' ? 'مطابق' : r.diffType === 'surplus' ? `فائض ${fmt(r.surplusAmount)}` : `عجز ${fmt(r.deficitAmount)}`}
                      tone={r.diffType === 'matched' ? 'success' : r.diffType === 'surplus' ? 'info' : 'danger'}
                    />
                  ),
                },
                {
                  key: 'wf',
                  header: 'مرحلة سير العمل',
                  render: (r) => (
                    <div className="flex items-center gap-1.5">
                      <ImdStatusText
                        label={r.workflow === 'draft' ? 'مسودة' : r.workflow === 'sent' ? 'مرسل للمراجعة' : 'معتمد نهائي'}
                        tone={r.workflow === 'approved' ? 'success' : r.workflow === 'sent' ? 'info' : 'warn'}
                      />
                      {r.workflow === 'draft' && (
                        <ImdButton size="sm" variant="secondary" onClick={() => advanceClearanceStage(r, 'sent')}>
                          إرسال
                        </ImdButton>
                      )}
                      {r.workflow === 'sent' && (
                        <ImdButton size="sm" variant="primary" onClick={() => advanceClearanceStage(r, 'approved')}>
                          اعتماد
                        </ImdButton>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={db.link_clearances}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'contracts' && (
        <div className="space-y-4">
          <ImdPanel title="إضافة عقد شراء وتوريد">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <ImdFld label="عنوان العقد" value={conTitle} onChange={setConTitle} />
              <ImdSelect label="المورد" value={conSup} onChange={setConSup} options={db.suppliers.map((s) => ({ value: s.name, label: s.name }))} />
              <ImdFld label="قيمة العقد" type="number" value={conAmount} onChange={setConAmount} />
              <ImdButton variant="primary" onClick={handleAddContract}>حفظ العقد</ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'no', header: 'رقم العقد', render: (r) => <span className="font-mono-num">{r.contractNo}</span> },
                { key: 't', header: 'العنوان', render: (r) => r.title },
                { key: 's', header: 'المورد', render: (r) => r.supplier },
                { key: 'a', header: 'القيمة', numeric: true, render: (r) => `${fmt(r.amount)} ${r.currency.toUpperCase()}` },
                { key: 'st', header: 'الحالة', render: (r) => <ImdStatusText label={r.status === 'active' ? 'ساري' : r.status} tone="success" /> },
                {
                  key: 'prt',
                  header: 'طباعة',
                  render: (r) => (
                    <ImdButton
                      size="sm"
                      variant="ghost"
                      title="طباعة العقد الرسمي"
                      onClick={() => void openPrintPreview(buildContractOfficialDoc(r, currentUser?.name ?? ''))}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </ImdButton>
                  ),
                },
              ]}
              rows={db.link_purchase_contracts}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'sheets' && (
        <div className="space-y-4">
          <ImdPanel title="إدارة دفاتر مسير العهدة وإضافة سطر صرف">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4 pb-3 border-b border-[var(--imd-line)]">
              <ImdSelect
                label="مسير العهدة النشط"
                value={activeSheetId}
                onChange={setActiveSheetId}
                options={db.link_custody_sheets.map((s) => ({ value: s.id, label: `${s.title} (${s.holderName || 'عام'})` }))}
                className="md:col-span-2"
              />
              <ImdFld label="اسم مسير جديد" value={newSheetName} onChange={setNewSheetName} placeholder="مسير تموين الربع..." />
              <ImdButton variant="secondary" onClick={handleCreateSheet}>
                <Plus className="w-4 h-4" />
                <span>إنشاء مسير</span>
              </ImdButton>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdFld label="البيان" value={shStmt} onChange={setShStmt} className="md:col-span-2" />
              <ImdFld label="رقم الفاتورة (يفحص التكرار)" value={shInvoiceNo} onChange={setShInvoiceNo} />
              <ImdFld label="المتجر / التاجر" value={shShop} onChange={setShShop} />
              <div className="flex items-end gap-2">
                <ImdFld label="المنصرف (SAR)" type="number" value={shSpentSar} onChange={setShSpentSar} className="flex-1" />
                <ImdButton variant="primary" onClick={handleAddSheetRow}>إضافة</ImdButton>
              </div>
            </div>
          </ImdPanel>
          <ImdPanel
            title="سجلات مسير العهدة (تلوين أرقام الفواتير المكررة تلقائياً)"
            headerRight={
              <ImdButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  const sheet = db.link_custody_sheets.find((s) => s.id === activeSheetId) ?? db.link_custody_sheets[0];
                  if (sheet) {
                    void openPrintPreview(
                      buildCustodySheetHorizontalDoc({
                        sheet,
                        rows: sheetRows,
                        dupInvoices,
                        actorName: currentUser?.name ?? '',
                      })
                    );
                  }
                }}
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة المسير أفقياً (A4_L)</span>
              </ImdButton>
            }
          >
            <ImdTable
              columns={[
                { key: 'seq', header: 'م', numeric: true, render: (r) => r.seq },
                { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.date },
                {
                  key: 'inv',
                  header: 'رقم الفاتورة',
                  render: (r) => {
                    const isDup = dupInvoices.has(r.invoiceNo.trim());
                    return (
                      <span className={`font-mono-num ${isDup ? 'text-[var(--imd-danger)] font-bold' : ''}`}>
                        {r.invoiceNo || '—'} {isDup ? '(مكررة!)' : ''}
                      </span>
                    );
                  },
                },
                { key: 'st', header: 'البيان', render: (r) => r.statement },
                { key: 'shop', header: 'التاجر', render: (r) => r.shop || '—' },
                { key: 'gr', header: 'المستلم (SAR)', numeric: true, render: (r) => fmt(r.grantSar) },
                { key: 'sp', header: 'المنصرف (SAR)', numeric: true, render: (r) => fmt(r.spentSar) },
              ]}
              rows={sheetRows}
              rowKey={(r) => r.id}
              rowClassName={(r) => (dupInvoices.has(r.invoiceNo.trim()) ? 'bg-[var(--imd-danger-soft)]' : '')}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'receipts' && (
        <div className="space-y-4">
          <ImdPanel title="إصدار سند استلام مبلغ (مع التفقيط التلقائي)">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdFld label="اسم المستلم" value={mrReceiver} onChange={setMrReceiver} />
              <ImdFld label="المبلغ" type="number" value={mrAmount} onChange={setMrAmount} />
              <ImdSelect
                label="العملة"
                value={mrCur}
                onChange={(v) => setMrCur(v as 'sar' | 'yer')}
                options={[
                  { value: 'sar', label: 'SAR' },
                  { value: 'yer', label: 'YER' },
                ]}
              />
              <ImdFld label="الغرض" value={mrPurpose} onChange={setMrPurpose} />
              <ImdButton variant="primary" onClick={handleAddMoneyReceipt}>إصدار السند</ImdButton>
            </div>
            <div className="mt-2 text-xs text-[var(--imd-accent)] font-semibold">
              التفقيط: {amountToArabicWords(Number(mrAmount) || 0, mrCur)}
            </div>
          </ImdPanel>
          <ImdPanel title="سندات استلام المبالغ">
            <ImdTable
              columns={[
                { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.receiptDate },
                { key: 'rec', header: 'المستلم', render: (r) => r.receiverName },
                { key: 'amt', header: 'المبلغ', numeric: true, render: (r) => `${fmt(r.amount)} ${r.currency.toUpperCase()}` },
                { key: 'words', header: 'المبلغ بالحروف (تفقيط)', render: (r) => <span className="text-xs font-semibold">{amountToArabicWords(r.amount, r.currency)}</span> },
                { key: 'pur', header: 'الغرض', render: (r) => r.purpose },
                {
                  key: 'prt',
                  header: 'طباعة',
                  render: (r) => (
                    <ImdButton
                      size="sm"
                      variant="ghost"
                      onClick={() => void openPrintPreview(buildMoneyReceiptDoc(r, currentUser?.name ?? ''))}
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </ImdButton>
                  ),
                },
              ]}
              rows={db.link_money_receipts}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}

      {tab === 'ledger' && (() => {
        const sarNet = statementRows.filter((r) => r.currency === 'sar').reduce((s, r) => s + r.credit - r.debit, 0);
        const yerNet = statementRows.filter((r) => r.currency === 'yer').reduce((s, r) => s + r.credit - r.debit, 0);
        const balText = (v: number, cur: string) =>
          v > 0.004 ? `${fmt(v)} ${cur} (له)` : v < -0.004 ? `${fmt(Math.abs(v))} ${cur} (عليه)` : `0 ${cur} (متزن)`;
        return (
          <ImdPanel
            title="كشف حساب مالي تفصيلي (FinanceStatement)"
            subtitle="المدين ما على الطرف والدائن ما له — يظهر الرصيد التراكمي بالريال السعودي واليمني"
            headerRight={
              <div className="flex flex-wrap items-center gap-2">
                <ImdButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    exportRowsToXlsx(
                      `finance_statement_${todayIso()}.xlsx`,
                      'Statement',
                      [
                        { header: 'التاريخ', key: 'date' },
                        { header: 'الطرف', key: 'party' },
                        { header: 'البيان', key: 'note' },
                        { header: 'مدين (عليه)', key: 'debit' },
                        { header: 'دائن (له)', key: 'credit' },
                        { header: 'الرصيد التراكمي', key: 'bal' },
                        { header: 'العملة', key: 'cur' },
                      ],
                      statementRows.map((r) => ({
                        date: r.entryDate,
                        party: r.partyName,
                        note: r.note,
                        debit: r.debit,
                        credit: r.credit,
                        bal: balText(r.runningBalance, r.currency.toUpperCase()),
                        cur: r.currency.toUpperCase(),
                      }))
                    )
                  }
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير Excel</span>
                </ImdButton>
                <ImdButton
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    openPrintPreview({
                      formKey: 'finance_statement',
                      space: 'supply',
                      title: 'كشف حساب مالي تفصيلي',
                      refNo: `FIN-${todayIso().replace(/-/g, '')}`,
                      date: todayIso(),
                      warehouse: 'الشؤون المالية للشعبة',
                      partyLabel: 'الحساب / الطرف',
                      partyValue: stmtParty === 'ALL' ? 'كافة الأطراف' : stmtParty,
                      opType: 'كشف حساب مالي',
                      columns: ['التاريخ', 'الطرف', 'البيان', 'مدين (عليه)', 'دائن (له)', 'الرصيد التراكمي'],
                      rows: statementRows.map((r) => [
                        r.entryDate,
                        r.partyName,
                        r.note || r.entryKind,
                        r.debit > 0 ? fmt(r.debit) : '—',
                        r.credit > 0 ? fmt(r.credit) : '—',
                        balText(r.runningBalance, r.currency.toUpperCase()),
                      ]),
                      totalQty: statementRows.length,
                      actorName: currentUser?.name ?? '',
                    })
                  }
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الكشف</span>
                </ImdButton>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mb-4">
              <ImdSelect
                label="الطرف / صاحب العهدة"
                value={stmtParty}
                onChange={setStmtParty}
                options={[
                  { value: 'ALL', label: 'كافة الأطراف المالية' },
                  ...stmtParties.map((p) => ({ value: p, label: p })),
                ]}
              />
              <ImdFld label="من تاريخ" type="date" value={stmtFrom} onChange={setStmtFrom} />
              <ImdFld label="إلى تاريخ" type="date" value={stmtTo} onChange={setStmtTo} />
            </div>

            <div className="flex flex-wrap gap-3 text-xs mb-3 p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              <span>
                الرصيد الصافي (SAR): <strong className="tabular-nums">{balText(sarNet, 'SAR')}</strong>
              </span>
              <span>·</span>
              <span>
                الرصيد الصافي (YER): <strong className="tabular-nums">{balText(yerNet, 'YER')}</strong>
              </span>
              <span>·</span>
              <span>
                عدد القيود: <strong className="tabular-nums">{fmt(statementRows.length, 0)}</strong>
              </span>
            </div>

            <ImdTable
              columns={[
                { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.entryDate },
                { key: 'p', header: 'الطرف', render: (r) => <strong>{r.partyName}</strong> },
                { key: 'n', header: 'البيان / القيد', render: (r) => r.note || r.entryKind },
                {
                  key: 'deb',
                  header: 'مدين (عليه)',
                  numeric: true,
                  render: (r) =>
                    r.debit > 0 ? (
                      <span className="text-[var(--imd-danger)] font-bold">{fmt(r.debit)} {r.currency.toUpperCase()}</span>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'crd',
                  header: 'دائن (له)',
                  numeric: true,
                  render: (r) =>
                    r.credit > 0 ? (
                      <span className="text-[var(--imd-success)] font-bold">{fmt(r.credit)} {r.currency.toUpperCase()}</span>
                    ) : (
                      '—'
                    ),
                },
                {
                  key: 'bal',
                  header: 'الرصيد التراكمي',
                  numeric: true,
                  render: (r) => (
                    <strong
                      style={{
                        color:
                          r.runningBalance > 0.004
                            ? 'var(--imd-success)'
                            : r.runningBalance < -0.004
                            ? 'var(--imd-danger)'
                            : 'var(--imd-muted)',
                      }}
                    >
                      {balText(r.runningBalance, r.currency.toUpperCase())}
                    </strong>
                  ),
                },
              ]}
              rows={statementRows}
              rowKey={(r) => r.id}
              emptyTitle="لا توجد قيود مالية ضمن المدة أو الطرف المحدد"
            />
          </ImdPanel>
        );
      })()}

      {tab === 'armaments' && (
        <div className="space-y-4">
          <ImdPanel title="صرف عهدة سلاح وذخيرة">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <ImdSelect
                label="الفرد / الضابط"
                value={armPersonId}
                onChange={setArmPersonId}
                options={db.link_persons.map((p) => ({ value: p.id, label: `${p.rank} / ${p.fullName}` }))}
              />
              <ImdFld label="نوع السلاح" value={armWeapon} onChange={setArmWeapon} />
              <ImdFld label="الرقم التسلسلي" value={armSerial} onChange={setArmSerial} />
              <ImdFld label="الذخيرة (طلقة)" type="number" value={armAmmo} onChange={setArmAmmo} />
              <ImdButton variant="primary" onClick={handleAddArmament}>تسليم العهدة</ImdButton>
            </div>
          </ImdPanel>
          <ImdPanel>
            <ImdTable
              columns={[
                { key: 'p', header: 'الحامل', render: (r) => `${r.personName} (${r.personMilitaryNo})` },
                { key: 'w', header: 'السلاح', render: (r) => r.weaponType },
                { key: 's', header: 'الرقم التسلسلي', render: (r) => <span className="font-mono-num">{r.serialNo}</span> },
                { key: 'm', header: 'المخازن والذخيرة', numeric: true, render: (r) => `${r.magazines} مخزن · ${r.ammoQty} طلقة` },
                { key: 'st', header: 'الحالة', render: (r) => <ImdStatusText label={r.returned ? `مسترد (${r.returnedDate})` : 'بعهدته'} tone={r.returned ? 'muted' : 'success'} /> },
                {
                  key: 'act',
                  header: 'إجراء',
                  render: (r) =>
                    !r.returned ? (
                      <ImdButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          upsertRow('link_armaments', {
                            ...r,
                            returned: true,
                            returnedDate: todayIso(),
                            updatedAt: new Date().toISOString(),
                          });
                          notify(`تم تسجيل إرجاع السلاح (${r.serialNo})`, 'success');
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تسجيل الإرجاع</span>
                      </ImdButton>
                    ) : null,
                },
              ]}
              rows={db.link_armaments}
              rowKey={(r) => r.id}
            />
          </ImdPanel>
        </div>
      )}
    </ImdPage>
  );
};
