// Cables Screen: Incoming & Outgoing Official Cables, Classification, Priority, SHA-256 Attachments

import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Plus, Printer, Reply } from 'lucide-react';
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
import { Ids, sha256Hex } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import { buildCableOfficialDoc } from '../../core/print/specializedTemplates';
import type { Cable } from '../../domain/types';

const BRANCH_OPTIONS = [
  { value: 'ALL', label: 'كافة الشعب / الفروع' },
  { value: 'شعبة الإمداد', label: 'شعبة الإمداد' },
  { value: 'قسم المحروقات', label: 'قسم المحروقات' },
  { value: 'المالية والعقود', label: 'المالية والعقود' },
  { value: 'التسليح والعتاد', label: 'التسليح والعتاد' },
];

export const CablesScreen: React.FC = () => {
  const { db, currentUser, navIntent, clearNavIntent, upsertRow, nextDocRef, logAudit, notify, openPrintPreview } = useEmdad();
  const [dirFilter, setDirFilter] = useState<'all' | 'in' | 'out'>('all');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'cables') return;
    if (navIntent.subTab === 'in' || navIntent.subTab === 'out' || navIntent.subTab === 'all') {
      setDirFilter(navIntent.subTab);
    }
    if (navIntent.searchQuery) {
      setSearch(navIntent.searchQuery);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fromParty, setFromParty] = useState('شعبة الإمداد والتموين');
  const [toParty, setToParty] = useState('هيئة العمليات والإمداد العليا');
  const [ccParty, setCcParty] = useState('');
  const [recipientsExtra, setRecipientsExtra] = useState('');
  const [branch, setBranch] = useState('شعبة الإمداد');
  const [sendMethod, setSendMethod] = useState('شبكة محلية مغلقة');
  const [editorRank, setEditorRank] = useState('نقيب');
  const [editorJob, setEditorJob] = useState('ركن الإمداد');
  const [classification, setClassification] = useState<'normal' | 'secret' | 'top'>('normal');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'immediate'>('normal');
  const [replyToNo, setReplyToNo] = useState('');
  const [attachName, setAttachName] = useState('');
  const [attachSha, setAttachSha] = useState('');
  const [attachSize, setAttachSize] = useState(0);

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    const sha = await sha256Hex(buf);
    setAttachName(f.name);
    setAttachSize(f.size);
    setAttachSha(sha);
    notify(`تم إرفاق الملف (${f.name}) وحساب بصمة SHA-256`, 'info');
  };

  const handleSaveCable = () => {
    if (!subject.trim()) {
      notify('أدخل موضوع البرقية', 'danger');
      return;
    }
    const cableNo = nextDocRef('cable');
    const now = new Date().toISOString();
    const extraRecipients = recipientsExtra
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const recipientsJson = Array.from(new Set([toParty.trim(), ...extraRecipients].filter(Boolean)));
    const cab: Cable = {
      id: Ids.next('cab'),
      direction,
      cableNo,
      cableDate: todayIso(),
      subject: subject.trim(),
      body: body.trim(),
      fromParty,
      toParty,
      branch: branch || null,
      classification,
      priority,
      status: direction === 'in' ? 'new' : 'replied',
      cableTime: new Date().toTimeString().slice(0, 5),
      ccParty: ccParty.trim(),
      recipientsJson,
      editorName: currentUser?.name ?? '',
      editorRank: editorRank.trim(),
      editorJob: editorJob.trim(),
      signerText: currentUser?.name ?? '',
      serialNo: String(db.cables.length + 4503),
      sendMethod: sendMethod.trim() || 'شبكة محلية مغلقة',
      sendDateTime: now,
      specialist: currentUser?.name ?? '',
      receiverName: '',
      receiveTime: '',
      replyToNo,
      attachName,
      attachPath: attachName ? `cables/${cableNo}/${attachName}` : '',
      attachSize,
      attachSha256: attachSha,
      notes: '',
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('cables', cab);
    logAudit({
      action: 'CREATE_CABLE',
      entityType: 'cables',
      summary: `${direction === 'in' ? 'برقية واردة' : 'برقية صادرة'} ${cableNo}: ${cab.subject}`,
      refNo: cableNo,
      risk: classification === 'top' ? 'sensitive' : 'normal',
    });
    notify(`تم حفظ البرقية ${cableNo}`, 'success');
    setModalOpen(false);
    setSubject('');
    setBody('');
    setReplyToNo('');
    setCcParty('');
    setRecipientsExtra('');
    setAttachName('');
    setAttachSha('');
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.cables
      .filter((c) => (dirFilter === 'all' ? true : c.direction === dirFilter))
      .filter((c) => (branchFilter === 'ALL' ? true : (c.branch ?? 'شعبة الإمداد') === branchFilter))
      .filter((c) =>
        !q
          ? true
          : c.cableNo.toLowerCase().includes(q) ||
            c.subject.toLowerCase().includes(q) ||
            c.fromParty.toLowerCase().includes(q) ||
            c.toParty.toLowerCase().includes(q) ||
            c.body.toLowerCase().includes(q)
      );
  }, [db.cables, dirFilter, branchFilter, search]);

  const cols: ImdColumn<Cable>[] = [
    { key: 'no', header: 'رقم البرقية', render: (r) => <span className="font-mono-num font-semibold">{r.cableNo}</span> },
    { key: 'dir', header: 'الاتجاه', render: (r) => (r.direction === 'in' ? 'واردة' : 'صادرة') },
    { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => `${r.cableDate} ${r.cableTime}` },
    { key: 'sub', header: 'الموضوع', render: (r) => <strong>{r.subject}</strong> },
    {
      key: 'from',
      header: 'من / إلى (والمستلمين)',
      render: (r) => (
        <div>
          <div>{r.fromParty} ← {r.toParty}</div>
          {r.recipientsJson.length > 1 && (
            <div className="text-[11px] text-[var(--imd-muted)]">
              توزيع ({r.recipientsJson.length}): {r.recipientsJson.join('، ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'cls',
      header: 'السرية والأولوية والحالة',
      render: (r) => (
        <ImdStatusText
          label={`${r.classification === 'top' ? 'سري للغاية' : r.classification === 'secret' ? 'سري' : 'عادي'} · ${
            r.priority === 'immediate' ? 'فوري' : r.priority === 'urgent' ? 'عاجل' : 'عادي'
          }${r.status === 'archived' ? ' · مؤرشفة' : ''}`}
          tone={
            r.status === 'archived'
              ? 'muted'
              : r.priority === 'immediate' || r.classification === 'top'
              ? 'danger'
              : r.priority === 'urgent'
              ? 'warn'
              : 'info'
          }
        />
      ),
    },
    {
      key: 'act',
      header: 'الإجراءات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <ImdButton
            size="sm"
            variant="ghost"
            title="رد على البرقية"
            onClick={() => {
              setDirection('out');
              setToParty(r.fromParty);
              setFromParty(r.toParty);
              setReplyToNo(r.cableNo);
              setSubject(`رداً على: ${r.subject}`);
              setModalOpen(true);
            }}
          >
            <Reply className="w-3.5 h-3.5" />
          </ImdButton>
          <ImdButton
            size="sm"
            variant="ghost"
            title="طباعة البرقية"
            onClick={() => openPrintPreview(buildCableOfficialDoc(r, currentUser?.name ?? ''))}
          >
            <Printer className="w-3.5 h-3.5" />
          </ImdButton>
          {r.status !== 'archived' && (
            <ImdButton
              size="sm"
              variant="ghost"
              title="أرشفة البرقية"
              onClick={() => {
                upsertRow('cables', { ...r, status: 'archived', updatedAt: new Date().toISOString() });
                notify(`تمت أرشفة البرقية ${r.cableNo}`, 'info');
              }}
            >
              <Archive className="w-3.5 h-3.5" />
            </ImdButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <ImdPage
      title="البرقيات الصادرة والواردة"
      subtitle="سجل المراسلات الرسمية والتوجيهات والردود والمرفقات الموثقة ببصمة SHA-256"
      actions={
        <ImdButton variant="primary" onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          <span>تحرير برقية جديدة</span>
        </ImdButton>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ImdTabs
          active={dirFilter}
          onChange={(v) => setDirFilter(v as 'all' | 'in' | 'out')}
          tabs={[
            { id: 'all', label: 'كافة البرقيات', count: db.cables.length },
            { id: 'in', label: 'البرقيات الواردة', count: db.cables.filter((c) => c.direction === 'in').length },
            { id: 'out', label: 'البرقيات الصادرة', count: db.cables.filter((c) => c.direction === 'out').length },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ImdFld
            value={search}
            onChange={setSearch}
            placeholder="بحث برقم البرقية أو الموضوع أو الجهة..."
            className="w-60"
          />
          <ImdSelect
            label=""
            value={branchFilter}
            onChange={setBranchFilter}
            options={BRANCH_OPTIONS}
            className="w-48"
          />
        </div>
      </div>

      <ImdPanel>
        <ImdTable columns={cols} rows={rows} rowKey={(r) => r.id} />
      </ImdPanel>

      <ImdModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="تحرير / تسجيل برقية"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleSaveCable}>حفظ واعتماد البرقية</ImdButton>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ImdSelect
            label="الاتجاه"
            value={direction}
            onChange={(v) => setDirection(v as 'in' | 'out')}
            options={[
              { value: 'out', label: 'برقية صادرة' },
              { value: 'in', label: 'برقية واردة' },
            ]}
          />
          <ImdSelect
            label="الشعبة / الفرع المختص"
            value={branch}
            onChange={setBranch}
            options={BRANCH_OPTIONS.filter((b) => b.value !== 'ALL')}
          />
          <ImdFld label="من الجهة" value={fromParty} onChange={setFromParty} />
          <ImdFld label="إلى الجهة الرئيسية" value={toParty} onChange={setToParty} />
          <ImdFld
            label="مستلمون إضافيون (مفصولة بفاصلة)"
            value={recipientsExtra}
            onChange={setRecipientsExtra}
            placeholder="مثال: قائد المعسكر، أمين المستودع"
          />
          <ImdFld label="صورة إلى (CC)" value={ccParty} onChange={setCcParty} placeholder="اختياري" />
          <ImdSelect
            label="درجة السرية"
            value={classification}
            onChange={(v) => setClassification(v as 'normal' | 'secret' | 'top')}
            options={[
              { value: 'normal', label: 'عادي' },
              { value: 'secret', label: 'سري' },
              { value: 'top', label: 'سري للغاية' },
            ]}
          />
          <ImdSelect
            label="الأولوية"
            value={priority}
            onChange={(v) => setPriority(v as 'normal' | 'urgent' | 'immediate')}
            options={[
              { value: 'normal', label: 'عادي' },
              { value: 'urgent', label: 'عاجل' },
              { value: 'immediate', label: 'فوري' },
            ]}
          />
          <ImdFld label="وسيلة الإرسال" value={sendMethod} onChange={setSendMethod} />
          <ImdFld label="رداً على رقم" value={replyToNo} onChange={setReplyToNo} placeholder="اختياري" />
          <ImdFld label="رتبة المحرر" value={editorRank} onChange={setEditorRank} />
          <ImdFld label="وظيفة المحرر" value={editorJob} onChange={setEditorJob} />
          <ImdFld label="الموضوع" value={subject} onChange={setSubject} className="md:col-span-2" />
          <label className="block space-y-1 md:col-span-2">
            <span className="block text-xs font-medium text-[var(--imd-text2)]">نص البرقية</span>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-2.5 text-sm border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] text-[var(--imd-text)]"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="block text-xs font-medium text-[var(--imd-text2)]">إرفاق ملف (يُحسب SHA-256 تلقائياً)</span>
            <input type="file" onChange={handleAttachFile} className="text-xs" />
            {attachSha && (
              <div className="text-[11px] font-mono-num text-[var(--imd-success)] break-all">
                {attachName} · SHA-256: {attachSha}
              </div>
            )}
          </label>
        </div>
      </ImdModal>
    </ImdPage>
  );
};
