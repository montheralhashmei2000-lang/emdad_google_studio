// Electronic Archive Screen (Auto-Archived PDFs/Docs on Print + Manual Upload with SHA-256 Integrity)

import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, Pin, Printer, Trash2, Upload } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdFld,
  ImdModal,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
} from '../../components/imd/primitives';
import { ImdTable, type ImdColumn } from '../../components/imd/ImdTable';
import { Ids, sha256Hex } from '../../core/security/crypto';
import { todayIso } from '../../core/ui/imdTokens';
import type { ArchiveFile } from '../../domain/types';

export const ElectronicArchiveScreen: React.FC = () => {
  const { db, currentUser, navIntent, clearNavIntent, upsertRow, deleteRow, logAudit, notify, openPrintPreview, fmt } = useEmdad();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');

  useEffect(() => {
    if (!navIntent || navIntent.door !== 'archive') return;
    if (navIntent.searchQuery !== undefined) {
      setSearch(navIntent.searchQuery);
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent]);

  const [viewFile, setViewFile] = useState<ArchiveFile | null>(null);
  const [editFile, setEditFile] = useState<ArchiveFile | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const sha256 = await sha256Hex(buf);
    const now = new Date().toISOString();
    const rec: ArchiveFile = {
      id: Ids.next('arc'),
      space: 'supply',
      title: file.name,
      category: 'مستند مرفوع يدوياً',
      tags: ['أرشفة-يدوية'],
      docRef: `MAN-${Date.now().toString().slice(-6)}`,
      warehouse: db.warehouses[0]?.name ?? '',
      docDate: todayIso(),
      fileName: file.name,
      storedPath: `manual_archive/${file.name}`,
      mime: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      sha256,
      source: 'manual',
      opType: 'أرشفة يدوية',
      notes: '',
      pinned: false,
      createdBy: currentUser?.name ?? '',
      createdAt: now,
      updatedAt: now,
    };
    upsertRow('archive_files', rec);
    logAudit({
      action: 'ARCHIVE_UPLOAD',
      entityType: 'archive_files',
      summary: `أرشفة ملف "${file.name}" يدوياً ببصمة SHA-256`,
      refNo: rec.docRef,
    });
    notify(`تم حفظ "${file.name}" في الأرشيف ببصمة SHA-256`, 'success');
    e.target.value = '';
  };

  const handleSaveEdit = () => {
    if (!editFile || !editTitle.trim()) return;
    upsertRow('archive_files', {
      ...editFile,
      title: editTitle.trim(),
      category: editCategory.trim(),
      notes: editNotes.trim(),
      updatedAt: new Date().toISOString(),
    });
    logAudit({
      action: 'ARCHIVE_UPDATE',
      entityType: 'archive_files',
      summary: `تعديل بيانات الوثيقة المؤرشفة ${editFile.docRef}`,
      refNo: editFile.docRef,
    });
    notify('تم تحديث بيانات الوثيقة المؤرشفة', 'success');
    setEditFile(null);
  };

  const handleDeleteArchive = (f: ArchiveFile) => {
    deleteRow('archive_files', f.id);
    logAudit({
      action: 'ARCHIVE_DELETE',
      entityType: 'archive_files',
      summary: `حذف الوثيقة المؤرشفة ${f.docRef} (${f.title})`,
      risk: 'sensitive',
      refNo: f.docRef,
    });
    notify(`تم حذف "${f.title}" من الأرشيف`, 'warn');
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.archive_files
      .filter((a) => (sourceFilter === 'ALL' ? true : a.source === sourceFilter))
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.docRef.toLowerCase().includes(q) ||
          a.sha256.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  }, [db.archive_files, search, sourceFilter]);

  const cols: ImdColumn<ArchiveFile>[] = [
    { key: 'title', header: 'العنوان / الملف', render: (r) => <strong>{r.title}</strong> },
    { key: 'ref', header: 'رقم السند', render: (r) => <span className="font-mono-num">{r.docRef}</span> },
    { key: 'cat', header: 'التصنيف', render: (r) => r.category || '—' },
    { key: 'dt', header: 'التاريخ', numeric: true, render: (r) => r.docDate },
    { key: 'src', header: 'المصدر', render: (r) => <ImdStatusText label={r.source === 'auto' ? 'أرشفة تلقائية' : 'رفع يدوي'} tone={r.source === 'auto' ? 'success' : 'info'} /> },
    { key: 'sz', header: 'الحجم', numeric: true, render: (r) => `${fmt(r.sizeBytes / 1024, 1)} KB` },
    { key: 'sha', header: 'بصمة SHA-256', render: (r) => <span className="font-mono-num text-[11px]">{r.sha256.slice(0, 18)}…</span> },
    {
      key: 'act',
      header: 'الإجراءات',
      render: (r) => (
        <div className="flex items-center gap-1">
          <ImdButton size="sm" variant="ghost" title="عرض البيانات" onClick={() => setViewFile(r)}>
            <Eye className="w-3.5 h-3.5" />
          </ImdButton>
          <ImdButton
            size="sm"
            variant="ghost"
            title="تعديل الوصف والتصنيف"
            onClick={() => {
              setEditFile(r);
              setEditTitle(r.title);
              setEditCategory(r.category);
              setEditNotes(r.notes);
            }}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </ImdButton>
          <ImdButton
            size="sm"
            variant="ghost"
            title={r.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
            onClick={() => upsertRow('archive_files', { ...r, pinned: !r.pinned })}
          >
            <Pin className={`w-3.5 h-3.5 ${r.pinned ? 'text-[var(--imd-accent)]' : 'opacity-40'}`} />
          </ImdButton>
          <ImdButton size="sm" variant="ghost" title="حذف" onClick={() => handleDeleteArchive(r)}>
            <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
          </ImdButton>
        </div>
      ),
    },
  ];

  return (
    <ImdPage
      title="الأرشيف الإلكتروني الموثق"
      subtitle="حفظ تلقائي لنسخ الطباعة الرسمية ببصمة SHA-256 مع إمكانية الأرشفة اليدوية والتثبيت"
      actions={
        <label className="inline-flex items-center gap-1.5 h-9 px-4 text-xs md:text-sm font-medium border border-[var(--imd-accent)] bg-[var(--imd-accent)] text-[var(--imd-on-accent)] cursor-pointer" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
          <Upload className="w-4 h-4" />
          <span>أرشفة ملف جديد</span>
          <input type="file" className="hidden" onChange={handleManualUpload} />
        </label>
      }
    >
      <ImdPanel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <ImdFld label="بحث بالعنوان، المرجع، أو SHA-256" value={search} onChange={setSearch} className="md:col-span-2" />
          <ImdSelect
            label="مصدر الأرشفة"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: 'ALL', label: 'الكل' },
              { value: 'auto', label: 'الأرشفة التلقائية عند الطباعة' },
              { value: 'manual', label: 'الرفع اليدوي' },
            ]}
          />
        </div>
        <ImdTable columns={cols} rows={rows} rowKey={(r) => r.id} />
      </ImdPanel>

      <ImdModal
        open={Boolean(viewFile)}
        onClose={() => setViewFile(null)}
        title={`بطاقة وثيقة مؤرشفة — ${viewFile?.docRef ?? ''}`}
        widthClass="max-w-lg"
        footer={
          <>
            {viewFile && (
              <ImdButton
                variant="secondary"
                onClick={() =>
                  openPrintPreview({
                    formKey: 'archive_certificate',
                    space: viewFile.space,
                    title: 'شهادة أرشفة إلكترونية موثقة',
                    refNo: viewFile.docRef,
                    date: viewFile.docDate,
                    warehouse: viewFile.warehouse || 'الأرشيف العام',
                    partyLabel: 'التصنيف',
                    partyValue: viewFile.category || '—',
                    notes: viewFile.notes,
                    opType: viewFile.opType || 'أرشفة إلكترونية',
                    columns: ['العنوان', 'اسم الملف', 'الحجم', 'بصمة SHA-256'],
                    rows: [[viewFile.title, viewFile.fileName, `${fmt(viewFile.sizeBytes / 1024, 1)} KB`, viewFile.sha256]],
                    totalQty: 1,
                    actorName: currentUser?.name ?? '',
                  })
                }
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة شهادة التوثيق</span>
              </ImdButton>
            )}
            <ImdButton variant="primary" onClick={() => setViewFile(null)}>إغلاق</ImdButton>
          </>
        }
      >
        {viewFile && (
          <div className="space-y-2 text-xs">
            <div><strong>العنوان:</strong> {viewFile.title}</div>
            <div><strong>رقم السند:</strong> <span className="font-mono-num">{viewFile.docRef}</span></div>
            <div><strong>التصنيف / العملية:</strong> {viewFile.category} · {viewFile.opType}</div>
            <div><strong>المستودع والتاريخ:</strong> {viewFile.warehouse || '—'} · {viewFile.docDate}</div>
            <div><strong>اسم الملف والحجم:</strong> {viewFile.fileName} ({fmt(viewFile.sizeBytes / 1024, 1)} KB)</div>
            <div><strong>المسار الداخلي:</strong> <span className="font-mono-num">{viewFile.storedPath}</span></div>
            <div className="p-2 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] font-mono-num break-all">
              <strong>SHA-256:</strong> {viewFile.sha256}
            </div>
            {viewFile.notes && <div><strong>ملاحظات:</strong> {viewFile.notes}</div>}
          </div>
        )}
      </ImdModal>

      <ImdModal
        open={Boolean(editFile)}
        onClose={() => setEditFile(null)}
        title={`تعديل بيانات الوثيقة — ${editFile?.docRef ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditFile(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleSaveEdit}>حفظ التعديل</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdFld label="العنوان" value={editTitle} onChange={setEditTitle} />
          <ImdFld label="التصنيف" value={editCategory} onChange={setEditCategory} />
          <ImdFld label="ملاحظات" value={editNotes} onChange={setEditNotes} />
        </div>
      </ImdModal>
    </ImdPage>
  );
};

