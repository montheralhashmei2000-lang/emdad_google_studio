// Settings Screen: 16 Sections in 6 Groups + SignerPositions ({المستودع}) + PrintPaper Defaults + ImdDropZone Backup Restore

import React, { useState } from 'react';
import { CheckCircle2, Download, Edit2, KeyRound, Plus, Power, ShieldCheck, Sliders, Trash2 } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  ImdButton,
  ImdDropZone,
  ImdFld,
  ImdModal,
  ImdNote,
  ImdPage,
  ImdPanel,
  ImdSelect,
  ImdStatusText,
} from '../../components/imd/primitives';
import { ImdTable } from '../../components/imd/ImdTable';
import {
  exportEscrowSigningKeys,
  Ids,
  restoreEscrowSigningKeys,
  signDocumentPayload,
  verifyDeviceIdChecksum,
} from '../../core/security/crypto';
import { PasswordHash } from '../../core/security/passwordHash';
import { OwnerSignature } from '../../core/security/ownerSignature';
import {
  DeviceActivation,
  loadDeviceRevocations,
  type DeviceRole,
} from '../../core/security/deviceActivation';
import { ESign } from '../../core/security/esign';
import { fmtDate, nf, nfMoney, nfPrint } from '../../core/ui/imdFormat';
import type { DecimalSep, DigitSystem, ThousandsSep } from '../../core/ui/imdNumbers';
import {
  DEFAULT_LABEL_SIZE,
  DEFAULT_PRINT_FORM,
  DEFAULT_SIGNER_POSITIONS,
  formatLabelSize,
  isValidLabelSize,
  LABEL_SIZE_PRESETS,
  loadLabelSize,
  PAPER_SIZE_LABELS,
  saveLabelSize,
  type LabelSize,
} from '../../core/print/printEngine';
import {
  downloadExcelTemplate,
  downloadOfficialExcelTemplate,
  EXCEL_TEMPLATES,
  exportRowsToXlsx,
  importXlsxFile,
} from '../../core/export/excelEngine';
import { APP_VERSION, APP_CODENAME } from '../../core/appVersion';
import {
  exportSystemMigrationJson,
  smartMergeImportJson,
} from '../../data/migration/dataMigration';
import {
  deleteRotatedSnapshot,
  exportImdbkBackup,
  importImdbkBackup,
  listRotatedSnapshots,
  loadBackupSchedule,
  runScheduledBackupRotation,
  saveBackupSchedule,
  type BackupIntervalHours,
  type BackupScheduleSettings,
  type RotatedBackupSnapshot,
} from '../../data/backup/backupScheduler';
import {
  applyConflictResolution,
  exportEncryptedSyncPacket,
  mergeEncryptedSyncPacket,
} from '../../data/sync/localSync';
import {
  hasSysPerm,
  ROLE_TEMPLATES,
  SECTION_BLOCKS,
} from '../../domain/accessControl';
import type {
  PrintPaperSize,
  SignerPositionEntry,
  SystemConfig,
  User,
  UserRole,
} from '../../domain/types';

type SettingsSection =
  | 'org'
  | 'forms'
  | 'signers'
  | 'authorities'
  | 'appearance'
  | 'numerals'
  | 'print_io'
  | 'ops_rules'
  | 'auto_archive'
  | 'users'
  | 'devices'
  | 'verify_sign'
  | 'sync'
  | 'backup'
  | 'maintenance'
  | 'about';

const GROUPS: Array<{ title: string; items: Array<{ id: SettingsSection; label: string }> }> = [
  {
    title: 'الجهة والهوية',
    items: [
      { id: 'org', label: 'بيانات الجهة والشعار' },
      { id: 'forms', label: 'رأس وتذييل النماذج (مصمم النماذج)' },
      { id: 'signers', label: 'دليل المسميات والتوقيعات ({المستودع})' },
      { id: 'authorities', label: 'جهات الاعتمادات' },
    ],
  },
  {
    title: 'التفضيلات والعرض',
    items: [
      { id: 'appearance', label: 'المظهر والخطوط والكثافة' },
      { id: 'numerals', label: 'الأرقام والعملات' },
      { id: 'print_io', label: 'أحجام الورق والتصدير والاستيراد' },
    ],
  },
  {
    title: 'العمليات',
    items: [
      { id: 'ops_rules', label: 'المخزون والاستحقاقات ومحرك القوانين' },
      { id: 'auto_archive', label: 'الأرشفة التلقائية والقفل' },
    ],
  },
  {
    title: 'الأمان والوصول',
    items: [
      { id: 'users', label: 'المستخدمون والصلاحيات (16 قالباً)' },
      { id: 'devices', label: 'تفعيل الأجهزة (IMDACT2)' },
      { id: 'verify_sign', label: 'التحقق من التوقيع (IMD2)' },
    ],
  },
  {
    title: 'البيانات والمزامنة',
    items: [
      { id: 'sync', label: 'المزامنة المحلية والتضاربات' },
      { id: 'backup', label: 'النسخ الاحتياطي المشفّر (AES-256)' },
    ],
  },
  {
    title: 'النظام',
    items: [
      { id: 'maintenance', label: 'الصيانة والفحص' },
      { id: 'about', label: 'عن النظام' },
    ],
  },
];

export const SettingsScreen: React.FC = () => {
  const {
    db,
    currentUser,
    updateConfig,
    upsertRow,
    mutateDb,
    logAudit,
    notify,
    resetAllLocalData,
    numberPrefs,
    updateNumberPrefs,
    activationStatus,
    refreshActivationStatus,
    setKeyRecoveryRequired,
  } = useEmdad();
  const [sec, setSec] = useState<SettingsSection>('appearance');

  // FormsDesigner state
  const [formKey, setFormKey] = useState('default');
  const activeForm = db.config.printForms[formKey] ?? db.config.printForms.default ?? DEFAULT_PRINT_FORM;

  // Barcode LabelSize local settings
  const [labelSize, setLabelSize] = useState<LabelSize>(() => loadLabelSize());
  const isPresetLabel = LABEL_SIZE_PRESETS.some(
    (p) => p.widthMm === labelSize.widthMm && p.heightMm === labelSize.heightMm
  );
  const [labelChoice, setLabelChoice] = useState<string>(
    isPresetLabel ? `${labelSize.widthMm}x${labelSize.heightMm}` : 'custom'
  );
  const [customLblW, setCustomLblW] = useState(String(labelSize.widthMm));
  const [customLblH, setCustomLblH] = useState(String(labelSize.heightMm));

  // SignerPositions state
  const signers = db.config.signerPositions ?? DEFAULT_SIGNER_POSITIONS;
  const [spRoleKey, setSpRoleKey] = useState('store_manager');
  const [spWarehouse, setSpWarehouse] = useState('*');
  const [spName, setSpName] = useState('');
  const [spRank, setSpRank] = useState('');

  // Authorities state
  const [authName, setAuthName] = useState('');
  const [authTitle, setAuthTitle] = useState('');

  // User creation & management state
  const [newUname, setNewUname] = useState('');
  const [newName, setNewName] = useState('');
  const [newPwd, setNewPwd] = useState('123456');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newTplId, setNewTplId] = useState(ROLE_TEMPLATES[0].id);
  const [newWhScope, setNewWhScope] = useState('ALL');

  const [resetPwdTarget, setResetPwdTarget] = useState<User | null>(null);
  const [resetPwdVal, setResetPwdVal] = useState('');
  const [resetPwdConfirm, setResetPwdConfirm] = useState('');

  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [editUserRole, setEditUserRole] = useState<UserRole>('user');
  const [editUserTplId, setEditUserTplId] = useState(ROLE_TEMPLATES[0].id);
  const [editUserScopeMode, setEditUserScopeMode] = useState<'ALL' | 'CUSTOM'>('ALL');
  const [editUserWarehouses, setEditUserWarehouses] = useState<string[]>([]);

  const [sectionBlockTarget, setSectionBlockTarget] = useState<User | null>(null);

  // Device Activation & KeyEscrow state
  const [actVerifyInput, setActVerifyInput] = useState(db.config.activationToken);
  const [actRole, setActRole] = useState<DeviceRole>(activationStatus?.role ?? 'master');
  const [actBranch, setActBranch] = useState(activationStatus?.branch || 'المركز الرئيسي');
  const [actExpires, setActExpires] = useState(activationStatus?.expiresAt || '');
  const [revokeTargetId, setRevokeTargetId] = useState(db.config.deviceId);
  const [revokeReason, setRevokeReason] = useState('إنهاء ارتباط جهاز فرعي');
  const [actStatusMsg, setActStatusMsg] = useState('');
  const [escrowPass, setEscrowPass] = useState('Escrow@2026');

  // VerifySign state
  const [sigSampleRef, setSigSampleRef] = useState(db.receipts[0]?.refNo ?? 'و-K7QX2A-000001');
  const [sigToken, setSigToken] = useState('');
  const [sigCheckMsg, setSigCheckMsg] = useState('');

  // Backup passphrase, scheduler & import mode
  const [backupPass, setBackupPass] = useState('Emdad@2026');
  const [backupSchedule, setBackupSchedule] = useState<BackupScheduleSettings>(() => loadBackupSchedule());
  const [snapshots, setSnapshots] = useState<RotatedBackupSnapshot[]>(() => listRotatedSnapshots());
  const [excelImportMode, setExcelImportMode] = useState<'merge' | 'replace'>('merge');

  // Sync Pairing code
  const [pairCode, setPairCode] = useState('K7QX-92BM');

  const handleAddSigner = () => {
    if (!spName.trim()) return;
    const roleLabelMap: Record<string, string> = {
      supply_officer: 'ركن الإمداد',
      store_manager: 'مدير المخزن ({المستودع})',
      approver: 'المصادقة والاعتماد',
      fuel_officer: 'مسؤول المحروقات',
      audit: 'المراجعة والتدقيق',
      inspection: 'الرقابة والتفتيش',
    };
    const next: SignerPositionEntry = {
      id: Ids.next('sp'),
      roleKey: spRoleKey,
      roleLabel: roleLabelMap[spRoleKey] ?? spRoleKey,
      warehouse: spWarehouse,
      personName: spName.trim(),
      rank: spRank.trim(),
    };
    updateConfig({ signerPositions: [next, ...signers] });
    setSpName('');
    setSpRank('');
    notify('تم تحديث دليل التوقيعات بنجاح', 'success');
  };

  const handleSaveUser = async () => {
    if (!hasSysPerm(currentUser, 'sys.users')) {
      notify('هذه الصلاحية محصورة للمالك فقط (sys.users)', 'danger');
      return;
    }
    if (!newUname.trim() || !newName.trim()) return;
    const tpl = ROLE_TEMPLATES.find((t) => t.id === newTplId) ?? ROLE_TEMPLATES[0];
    const hash = await PasswordHash.hash(newPwd || '123456');
    const now = new Date().toISOString();
    const user: User = {
      id: Ids.next('usr'),
      username: newUname.trim().toLowerCase(),
      name: newName.trim(),
      email: `${newUname.trim().toLowerCase()}@imdad.local`,
      role: newRole,
      roles: [tpl.id],
      permissions: tpl.permissions,
      warehouseScope: newWhScope === 'ALL' ? 'ALL' : [newWhScope],
      saltHex: hash.saltHex,
      hashHex: hash.hashHex,
      iterations: hash.iterations,
      active: true,
      approved: true,
      failedAttempts: 0,
      lockedUntil: null,
      sectionBlocked: [],
      ownerSig: '',
      createdAt: now,
      updatedAt: now,
    };
    user.ownerSig = await OwnerSignature.signUserDecisions(user);
    upsertRow('users', user);
    setNewUname('');
    setNewName('');
    notify(`تم إنشاء المستخدم "${user.name}" (PBKDF2 310k + OwnerSignature)`, 'success');
  };

  const toggleUserSectionBlock = async (u: User, blockKey: string) => {
    if (!hasSysPerm(currentUser, 'sys.permissions')) {
      notify('فك أو حجب الأقسام يتطلب توقيع المالك', 'danger');
      return;
    }
    const exists = u.sectionBlocked.includes(blockKey);
    const next = exists
      ? u.sectionBlocked.filter((b) => b !== blockKey)
      : [...u.sectionBlocked, blockKey];
    const draftUser: User = { ...u, sectionBlocked: next, updatedAt: new Date().toISOString() };
    draftUser.ownerSig = await OwnerSignature.signUserDecisions(draftUser);
    upsertRow('users', draftUser);
    if (sectionBlockTarget?.id === u.id) {
      setSectionBlockTarget(draftUser);
    }
    logAudit({
      action: 'USER_SECTION_BLOCK',
      entityType: 'users',
      summary: `${exists ? 'فك حجب' : 'حجب'} قسم (${blockKey}) عن المستخدم ${u.username}`,
      risk: 'high',
      target: u.username,
    });
  };

  const handleToggleUserActive = (u: User) => {
    if (!hasSysPerm(currentUser, 'sys.users')) {
      notify('هذه الصلاحية محصورة للمالك فقط (sys.users)', 'danger');
      return;
    }
    if (u.role === 'owner' || u.id === currentUser?.id) {
      notify('لا يمكن إيقاف حساب المالك أو الحساب الحالي', 'danger');
      return;
    }
    const nextActive = !u.active;
    upsertRow('users', { ...u, active: nextActive, updatedAt: new Date().toISOString() });
    logAudit({
      action: nextActive ? 'USER_ACTIVATE' : 'USER_SUSPEND',
      entityType: 'users',
      summary: `${nextActive ? 'تفعيل' : 'إيقاف'} حساب المستخدم ${u.username}`,
      risk: 'sensitive',
      target: u.username,
    });
    notify(nextActive ? `تم تفعيل حساب "${u.name}"` : `تم إيقاف حساب "${u.name}"`, nextActive ? 'success' : 'warn');
  };

  const handleApproveUser = (u: User) => {
    if (!hasSysPerm(currentUser, 'sys.users')) {
      notify('هذه الصلاحية محصورة للمالك فقط (sys.users)', 'danger');
      return;
    }
    upsertRow('users', { ...u, approved: true, active: true, updatedAt: new Date().toISOString() });
    logAudit({
      action: 'USER_APPROVE',
      entityType: 'users',
      summary: `اعتماد وتفعيل حساب المستخدم ${u.username}`,
      risk: 'sensitive',
      target: u.username,
    });
    notify(`تم اعتماد حساب "${u.name}"`, 'success');
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPwdTarget) return;
    if (!hasSysPerm(currentUser, 'sys.users')) {
      notify('هذه الصلاحية محصورة للمالك فقط (sys.users)', 'danger');
      return;
    }
    if (resetPwdVal.length < 6) {
      notify('كلمة المرور يجب أن لا تقل عن 6 أحرف/أرقام', 'danger');
      return;
    }
    if (resetPwdVal !== resetPwdConfirm) {
      notify('كلمة المرور وتأكيدها غير متطابقين', 'danger');
      return;
    }
    const hash = await PasswordHash.hash(resetPwdVal);
    upsertRow('users', {
      ...resetPwdTarget,
      saltHex: hash.saltHex,
      hashHex: hash.hashHex,
      iterations: hash.iterations,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    });
    logAudit({
      action: 'USER_PASSWORD_RESET',
      entityType: 'users',
      summary: `إعادة تعيين كلمة مرور المستخدم ${resetPwdTarget.username}`,
      risk: 'high',
      target: resetPwdTarget.username,
    });
    notify(`تم تعيين كلمة مرور جديدة للمستخدم "${resetPwdTarget.name}" (PBKDF2 310k)`, 'success');
    setResetPwdTarget(null);
    setResetPwdVal('');
    setResetPwdConfirm('');
  };

  const handleOpenEditUser = (u: User) => {
    setEditUserTarget(u);
    setEditUserRole(u.role);
    setEditUserTplId(u.roles[0] ?? ROLE_TEMPLATES[0].id);
    if (u.warehouseScope === 'ALL') {
      setEditUserScopeMode('ALL');
      setEditUserWarehouses([]);
    } else {
      setEditUserScopeMode('CUSTOM');
      setEditUserWarehouses(u.warehouseScope);
    }
  };

  const handleConfirmEditUser = async () => {
    if (!editUserTarget) return;
    if (!hasSysPerm(currentUser, 'sys.users')) {
      notify('هذه الصلاحية محصورة للمالك فقط (sys.users)', 'danger');
      return;
    }
    const tpl = ROLE_TEMPLATES.find((t) => t.id === editUserTplId) ?? ROLE_TEMPLATES[0];
    const nextScope: 'ALL' | string[] =
      editUserScopeMode === 'ALL' || editUserWarehouses.length === 0 ? 'ALL' : editUserWarehouses;
    const draftUser: User = {
      ...editUserTarget,
      role: editUserTarget.role === 'owner' ? 'owner' : editUserRole,
      roles: [tpl.id],
      permissions: tpl.permissions,
      warehouseScope: nextScope,
      updatedAt: new Date().toISOString(),
    };
    draftUser.ownerSig = await OwnerSignature.signUserDecisions(draftUser);
    upsertRow('users', draftUser);
    logAudit({
      action: 'USER_UPDATE_ROLE_SCOPE',
      entityType: 'users',
      summary: `تعديل دور ونطاق مستودعات المستخدم ${editUserTarget.username} (${tpl.name})`,
      risk: 'sensitive',
      target: editUserTarget.username,
    });
    notify(`تم تحديث وتوقيع صلاحيات "${editUserTarget.name}" (OwnerSignature r/s/c)`, 'success');
    setEditUserTarget(null);
  };

  const handleGenerateActivation = async () => {
    const token = await DeviceActivation.issueCertificate({
      deviceId: db.config.deviceId,
      issuedTo: db.config.orgName,
      role: actRole,
      branch: actBranch,
      expiresAt: actExpires,
    });
    updateConfig({ activationToken: token });
    setActVerifyInput(token);
    await refreshActivationStatus();
    setActStatusMsg(
      `شهادة تفعيل موقعة (${actRole === 'master' ? 'رئيسي Master' : `فرعي Branch: ${actBranch}`}) للجهاز ${db.config.deviceId}`
    );
    notify('تم إصدار شهادة التفعيل IMDACT2 بمفتاح المالك', 'success');
  };

  const handleVerifyActivation = async () => {
    const res = await DeviceActivation.verifyToken(actVerifyInput.trim(), loadDeviceRevocations());
    if (res.valid) {
      setActStatusMsg(
        `تفعيل صحيح · الدور: ${res.role === 'master' ? 'رئيسي' : 'فرعي'} (${res.branch || 'عام'}) · الانتهاء: ${res.expiresAt || 'مفتوح'}`
      );
    } else {
      setActStatusMsg(res.reason || 'رمز التفعيل غير صالح أو تم العبث بالتوقيع');
    }
  };

  const handleGenerateSampleSig = async () => {
    const rec =
      db.receipts.find((r) => r.refNo === sigSampleRef) ??
      db.issues.find((i) => i.refNo === sigSampleRef);
    if (!rec) {
      setSigCheckMsg('لم يتم العثور على السند في القاعدة');
      return;
    }
    const sig = await signDocumentPayload({
      refNo: rec.refNo,
      date: rec.date,
      warehouse: rec.warehouse,
      totalQty: rec.baseQty,
      signer: rec.createdBy,
    });
    setSigToken(sig);
    setSigCheckMsg('تم توليد توقيع IMD2 بنجاح');
  };

  const handleVerifyDocumentSig = () => {
    const parts = sigToken.trim().split('|');
    if (parts[0] !== 'IMD2' || parts.length < 7) {
      setSigCheckMsg('صيغة توقيع IMD2 غير مكتملة');
      return;
    }
    const refNo = parts[1];
    const date = parts[2];
    const wh = parts[3];
    const qty = Number(parts[4]);
    const match = [...db.receipts, ...db.issues, ...db.transfers].find(
      (x) => x.refNo === refNo && x.date === date && x.warehouse === wh && x.baseQty === qty
    );
    if (match) {
      setSigCheckMsg(`التوقيع مطابق للوثيقة المحفوظة في القاعدة (${match.itemName} — ${match.status})`);
    } else {
      setSigCheckMsg('تحذير: بيانات التوقيع لا تطابق أي سند مطابق في القاعدة المحلية!');
    }
  };

  const handleExportEncryptedBackup = async () => {
    if (!backupPass.trim()) {
      notify('أدخل كلمة مرور لتشفير النسخة الاحتياطية', 'danger');
      return;
    }
    const { encrypted, fileName } = await exportImdbkBackup(db, backupPass);
    const blob = new Blob([encrypted], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    notify('تم تصدير النسخة الاحتياطية المشفّرة AES-256-GCM (.imdbk)', 'success');
  };

  const restoreEncryptedFile = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = await importImdbkBackup(txt, backupPass);
      mutateDb(() => parsed);
      notify('تم فك التشفير واستعادة قاعدة البيانات بنجاح', 'success');
    } catch {
      notify('فشل فك التشفير — تأكد من كلمة المرور أو سلامة الملف', 'danger');
    }
  };

  const handleRunRotatedBackupNow = async () => {
    if (!backupPass.trim()) {
      notify('أدخل كلمة مرور التشفير لتشغيل الجدولة', 'danger');
      return;
    }
    const res = await runScheduledBackupRotation(db, backupPass);
    setSnapshots(res.all);
    setBackupSchedule(res.schedule);
    notify(`تم حفظ نسخة مجدولة مشفّرة (${res.snapshot.fileName}) والاحتفاظ بآخر ${res.all.length} نسخ`, 'success');
  };

  const handleExportMigrationJson = async () => {
    const { json, sha256, recordCount } = await exportSystemMigrationJson(db, {
      includeLocalKeys: false,
      includeOwnerSecrets: false,
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imdad_migration_v31_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`تم تصدير حزمة الترحيل JSON (${recordCount} سجل · SHA-256: ${sha256.slice(0, 10)}...)`, 'success');
  };

  const handleSmartImportMigrationJson = async (file: File) => {
    try {
      const txt = await file.text();
      const res = await smartMergeImportJson(db, txt, currentUser);
      mutateDb(() => res.nextState);
      logAudit({
        action: 'LEGACY_SMART_MERGE_IMPORT',
        entityType: 'sync_conflicts',
        summary: `استيراد ترحيل ذكي: دمج ${res.mergedCount} سجل، عزل ${res.conflictsCaptured} تعارض، صد ${res.skippedSecurityCount} تصعيد صلاحيات`,
        risk: res.conflictsCaptured > 0 || res.skippedSecurityCount > 0 ? 'sensitive' : 'normal',
      });
      notify(
        `تم الدمج الذكي: ${res.mergedCount} سجل محدّث${res.conflictsCaptured ? ` · ${res.conflictsCaptured} تعارض معزول` : ''}`,
        res.conflictsCaptured > 0 ? 'warn' : 'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'فشل استيراد ملف الترحيل JSON', 'danger');
    }
  };

  // LAN Sync packet handlers & Bulk SyncConflicts handlers (admin + owner)
  const canResolveConflicts = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const unresolvedConflicts = db.sync_conflicts.filter((c) => !c.resolved);

  const handleExportSyncPacket = async () => {
    if (!pairCode.trim()) {
      notify('أدخل رمز الاقتران لتشفير حزمة المزامنة', 'danger');
      return;
    }
    const { encrypted, header } = await exportEncryptedSyncPacket(db, pairCode);
    const blob = new Blob([encrypted], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imdad_sync_${header.sourceDeviceId}_${new Date().toISOString().slice(0, 10)}.imdad-sync`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`تم تصدير حزمة المزامنة المشفّرة (${header.recordCount} سجل)`, 'success');
  };

  const handleImportSyncPacket = async (file: File) => {
    try {
      const txt = await file.text();
      const mergedRes = await mergeEncryptedSyncPacket(db, txt, pairCode);
      mutateDb(() => mergedRes.nextState);
      logAudit({
        action: 'LAN_SYNC_MERGE',
        entityType: 'sync_conflicts',
        summary: `دمج حزمة مزامنة من ${mergedRes.sourceDeviceId}: ${mergedRes.mergedCount} سجل، ${mergedRes.conflictsAdded} تعارض`,
        risk: mergedRes.conflictsAdded > 0 ? 'sensitive' : 'normal',
      });
      notify(
        `تم الدمج من ${mergedRes.sourceDeviceId}: ${mergedRes.mergedCount} سجل محدث، ${mergedRes.conflictsAdded} تعارض مسجّل`,
        mergedRes.conflictsAdded > 0 ? 'warn' : 'success'
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : 'فشل دمج حزمة المزامنة — تحقق من رمز الاقتران', 'danger');
    }
  };

  const handleResolveConflicts = (ids: string[], mode: 'restore_local' | 'accept_peer') => {
    if (!canResolveConflicts) {
      notify('حسم التعارضات متاح لحسابي المدير (admin) والمالك (owner) فقط', 'danger');
      return;
    }
    if (ids.length === 0) return;
    mutateDb((prev) => applyConflictResolution(prev, ids, mode));
    logAudit({
      action: mode === 'restore_local' ? 'SYNC_RESTORE_CONFLICTS' : 'SYNC_ACCEPT_PEER_CONFLICTS',
      entityType: 'sync_conflicts',
      summary: `${mode === 'restore_local' ? 'استعادة النسخة المحلية' : 'اعتماد نسخة القرين'} لـ ${ids.length} تعارض`,
      risk: 'sensitive',
    });
    notify(
      mode === 'restore_local'
        ? `تمت استعادة النسخة المحلية لـ ${ids.length} تعارض`
        : `تم اعتماد نسخة القرين لـ ${ids.length} تعارض`,
      'success'
    );
  };

  const handleBatchExcelImport = async (file: File) => {
    try {
      const rows = await importXlsxFile(file);
      if (rows.length === 0) {
        notify('الملف فارغ أو لا يحتوي على صفوف صالحة', 'warn');
        return;
      }
      let addedItems = 0;
      let addedSuppliers = 0;
      mutateDb((prev) => {
        const nextItems = excelImportMode === 'replace' ? [] : [...prev.items];
        const nextSups = [...prev.suppliers];
        for (const r of rows) {
          const itemName = (r['اسم الصنف'] || r['الصنف'] || '').trim();
          const code = (r['الكود'] || '').trim();
          if (itemName) {
            if (!nextItems.some((x) => x.name === itemName || (code && x.code === code))) {
              const baseUnit = (r['الوحدة الأساسية'] || r['الوحدة'] || 'كجم').trim();
              const catName = (r['التصنيف'] || 'مواد غذائية').trim();
              const matchedCat = prev.categories.find((c) => c.name === catName);
              nextItems.unshift({
                id: Ids.next('itm'),
                code: code || `ITM-${nextItems.length + 101}`,
                name: itemName,
                categoryId: matchedCat?.id ?? prev.categories[0]?.id ?? 'cat_food',
                categoryName: matchedCat?.name ?? catName,
                baseUnit,
                reportUnit: baseUnit,
                qty: 0,
                minQty: Number(r['الحد الأدنى']) || 50,
                barcode: (r['الباركود'] || '').trim(),
                units: [{ name: baseUnit, factor: 1, isBase: true }],
                isRefillable: false,
                isAsset: false,
                assetType: '',
                lifespanMonths: 0,
                unitValue: Number(r['السعر التقديري']) || 0,
                createdAt: new Date().toISOString(),
              });
              addedItems++;
            }
          } else if (r['اسم المورد']) {
            const supName = r['اسم المورد'].trim();
            if (supName && !nextSups.some((s) => s.name === supName)) {
              nextSups.unshift({
                id: Ids.next('sup'),
                name: supName,
                phone: r['الهاتف'] || '',
                contact: r['المسؤول'] || '',
                city: r['المدينة'] || '',
                notes: 'مستورد عبر قالب Excel',
              });
              addedSuppliers++;
            }
          }
        }
        return { ...prev, items: nextItems, suppliers: nextSups };
      });
      notify(`تم الاستيراد (${excelImportMode === 'replace' ? 'استبدال' : 'دمج'}): ${addedItems} أصناف، ${addedSuppliers} موردين`, 'success');
    } catch {
      notify('تعذر قراءة ملف Excel — تأكد من صيغة .xlsx والقالب المعتمد', 'danger');
    }
  };

  return (
    <ImdPage title="إعدادات النظام والأمان" subtitle="16 قسماً مجمّعة في 6 مجموعات وظيفية">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {/* Left Navigation Groups */}
        <ImdPanel padded={false} className="lg:col-span-1 overflow-hidden">
          <div className="divide-y divide-[var(--imd-line)]">
            {GROUPS.map((g) => (
              <div key={g.title} className="p-2.5 space-y-1">
                <div className="px-2 py-1 text-[11px] font-bold text-[var(--imd-muted)]">
                  {g.title}
                </div>
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSec(item.id)}
                    className={`w-full text-right px-2.5 py-1.5 text-xs transition-colors cursor-pointer block ${
                      sec === item.id
                        ? 'bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-bold'
                        : 'text-[var(--imd-text2)] hover:bg-[var(--imd-hover)]'
                    }`}
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ImdPanel>

        {/* Right Section Content */}
        <div className="lg:col-span-3 space-y-4">
          {sec === 'org' && (
            <ImdPanel title="بيانات الجهة والشعار">
              <div className="flex flex-wrap items-center gap-4 pb-4 mb-4 border-b border-[var(--imd-line)]">
                <img
                  src={db.config.logoDataUrl || '/logo-official.png'}
                  alt={db.config.orgName}
                  className="w-16 h-16 object-contain border border-[var(--imd-line)] bg-white p-1"
                  style={{ borderRadius: 'var(--imd-radius-sm)' }}
                />
                <div className="space-y-1.5">
                  <div className="text-xs font-bold">الشعار الرسمي للمؤسسة / الشعبة</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] cursor-pointer hover:bg-[var(--imd-hover)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                      <span>رفع شعار مخصص</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              updateConfig({ logoDataUrl: reader.result });
                              notify('تم تحديث شعار الجهة بنجاح', 'success');
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {db.config.logoDataUrl && (
                      <ImdButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          updateConfig({ logoDataUrl: '' });
                          notify('تمت استعادة الشعار الرسمي الافتراضي', 'info');
                        }}
                      >
                        استعادة الشعار الافتراضي
                      </ImdButton>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ImdFld label="اسم الجهة / الشعبة" value={db.config.orgName} onChange={(v) => updateConfig({ orgName: v })} />
                <ImdFld label="العنوان الفرعي" value={db.config.orgSubTitle} onChange={(v) => updateConfig({ orgSubTitle: v })} />
                <ImdFld label="المدينة / القطاع" value={db.config.orgCity} onChange={(v) => updateConfig({ orgCity: v })} />
                <ImdFld label="الهاتف" value={db.config.orgPhone} onChange={(v) => updateConfig({ orgPhone: v })} />
              </div>
            </ImdPanel>
          )}

          {sec === 'forms' && (
            <ImdPanel title="مصمم النماذج (FormsDesigner & PrintForms)" subtitle="تخصيص كل مطبوعة: الترويسة، الخط، حجم الخط، مربع التوثيق، والتوقيعات">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <ImdSelect
                  label="فهرس المطبوعة (PrintForms)"
                  value={formKey}
                  onChange={setFormKey}
                  options={[
                    { value: 'default', label: 'التخطيط العام الافتراضي' },
                    { value: 'receipt', label: 'سند الاستلام (receipt)' },
                    { value: 'issue', label: 'سند الصرف (issue)' },
                    { value: 'transfer', label: 'إذن التحويل (transfer)' },
                    { value: 'ration_order', label: 'طلبية الإعاشة (ration_order)' },
                    { value: 'cable', label: 'نموذج البرقية العسكرية (cable)' },
                    { value: 'money_receipt', label: 'سند استلام مبلغ (money_receipt)' },
                  ]}
                />
                <ImdSelect
                  label="خط الطباعة الرسمي"
                  value={activeForm.fontFamily}
                  onChange={(v) =>
                    updateConfig({
                      printForms: { ...db.config.printForms, [formKey]: { ...activeForm, fontFamily: v } },
                    })
                  }
                  options={[
                    { value: 'Amiri', label: 'Amiri (الأميري الرسمي)' },
                    { value: 'IBMPlexSansArabic', label: 'IBM Plex Sans Arabic' },
                    { value: 'Tajawal', label: 'Tajawal' },
                    { value: 'Cairo', label: 'Cairo' },
                    { value: 'NotoSansArabic', label: 'Noto Sans Arabic' },
                  ]}
                />
                <ImdFld
                  label="حجم خط الجدول (px)"
                  type="number"
                  value={activeForm.fontSize}
                  onChange={(v) =>
                    updateConfig({
                      printForms: { ...db.config.printForms, [formKey]: { ...activeForm, fontSize: Number(v) || 12 } },
                    })
                  }
                />
              </div>
              <div className="space-y-3">
                <ImdFld
                  label="أسطر الترويسة اليمنى (مفصولة بـ | — يدعم الرمز {المستودع})"
                  value={activeForm.rightLines.join(' | ')}
                  onChange={(v) =>
                    updateConfig({
                      printForms: {
                        ...db.config.printForms,
                        [formKey]: { ...activeForm, rightLines: v.split('|').map((s) => s.trim()) },
                      },
                    })
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => (
                    <ImdFld
                      key={idx}
                      label={`التوقيع ${idx + 1}`}
                      value={activeForm.footerRoles[idx]}
                      onChange={(v) => {
                        const roles: [string, string, string] = [...activeForm.footerRoles] as [string, string, string];
                        roles[idx] = v;
                        updateConfig({
                          printForms: { ...db.config.printForms, [formKey]: { ...activeForm, footerRoles: roles } },
                        });
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-xs pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeForm.showQr}
                      onChange={(e) =>
                        updateConfig({
                          printForms: { ...db.config.printForms, [formKey]: { ...activeForm, showQr: e.target.checked } },
                        })
                      }
                    />
                    <span>طباعة رمز QR التوثيق (IMD2)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeForm.showAuthBox}
                      onChange={(e) =>
                        updateConfig({
                          printForms: { ...db.config.printForms, [formKey]: { ...activeForm, showAuthBox: e.target.checked } },
                        })
                      }
                    />
                    <span>إظهار مربع المصادقة</span>
                  </label>
                </div>
              </div>
            </ImdPanel>
          )}

          {sec === 'signers' && (
            <ImdPanel
              title="دليل المسميات والتوقيعات (SignerPositions)"
              subtitle="ربط كل صفة توقيع بشاغلها لكل مستودع، مع دعم الرمز {المستودع} ليُستبدل تلقائياً باسم مستودع السند عند الطباعة"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4">
                <ImdSelect
                  label="صفة التوقيع"
                  value={spRoleKey}
                  onChange={setSpRoleKey}
                  options={[
                    { value: 'supply_officer', label: 'ركن الإمداد' },
                    { value: 'store_manager', label: 'مدير المخزن ({المستودع})' },
                    { value: 'approver', label: 'المصادقة والاعتماد' },
                    { value: 'fuel_officer', label: 'مسؤول المحروقات' },
                    { value: 'audit', label: 'المراجعة والتدقيق' },
                    { value: 'inspection', label: 'الرقابة والتفتيش' },
                  ]}
                />
                <ImdSelect
                  label="المستودع"
                  value={spWarehouse}
                  onChange={setSpWarehouse}
                  options={[
                    { value: '*', label: 'كافة المستودعات (*)' },
                    ...db.warehouses.map((w) => ({ value: w.name, label: w.name })),
                  ]}
                />
                <ImdFld label="الاسم (يدعم {المستودع})" value={spName} onChange={setSpName} placeholder="أمين {المستودع}" />
                <ImdFld label="الرتبة" value={spRank} onChange={setSpRank} placeholder="رقيب أول" />
                <ImdButton variant="primary" onClick={handleAddSigner}>
                  <Plus className="w-4 h-4" />
                  <span>إضافة / ربط</span>
                </ImdButton>
              </div>
              <ImdTable
                columns={[
                  { key: 'r', header: 'صفة التوقيع', render: (r) => <strong>{r.roleLabel}</strong> },
                  { key: 'w', header: 'المستودع', render: (r) => (r.warehouse === '*' ? 'الافتراضي (الكل)' : r.warehouse) },
                  { key: 'n', header: 'الشاغل', render: (r) => r.personName },
                  { key: 'rk', header: 'الرتبة', render: (r) => r.rank || '—' },
                  {
                    key: 'del',
                    header: 'حذف',
                    render: (r) => (
                      <ImdButton
                        size="sm"
                        variant="ghost"
                        onClick={() => updateConfig({ signerPositions: signers.filter((x) => x.id !== r.id) })}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                      </ImdButton>
                    ),
                  },
                ]}
                rows={signers}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}

          {sec === 'authorities' && (
            <ImdPanel title="جهات الاعتمادات">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mb-4">
                <ImdFld label="اسم الجهة" value={authName} onChange={setAuthName} />
                <ImdFld label="الصفة / المسمى" value={authTitle} onChange={setAuthTitle} />
                <ImdButton
                  variant="primary"
                  onClick={() => {
                    if (!authName.trim()) return;
                    upsertRow('supply_authorities', {
                      id: Ids.next('auth'),
                      name: authName.trim(),
                      title: authTitle.trim(),
                      notes: '',
                      active: true,
                      createdAt: new Date().toISOString(),
                    });
                    setAuthName('');
                    setAuthTitle('');
                    notify('تمت إضافة جهة الاعتماد', 'success');
                  }}
                >
                  إضافة جهة
                </ImdButton>
              </div>
              <ImdTable
                columns={[
                  { key: 'n', header: 'الجهة', render: (r) => r.name },
                  { key: 't', header: 'المسمى', render: (r) => r.title || '—' },
                ]}
                rows={db.supply_authorities}
                rowKey={(r) => r.id}
              />
            </ImdPanel>
          )}

          {sec === 'appearance' && (
            <ImdPanel title="المظهر والخطوط والكثافة (6 سمات + 4 خطوط)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImdSelect
                  label="الوضع اللوني (ThemeMode)"
                  value={db.config.themeMode}
                  onChange={(v) => updateConfig({ themeMode: v as 'light' | 'dark' })}
                  options={[
                    { value: 'light', label: 'السمة الفاتحة (ImdColors.light)' },
                    { value: 'dark', label: 'السمة الداكنة (ImdColors.dark)' },
                  ]}
                />
                <ImdSelect
                  label="خط الواجهة العربية"
                  value={db.config.fontFamily}
                  onChange={(v) => updateConfig({ fontFamily: v as SystemConfig['fontFamily'] })}
                  options={[
                    { value: 'IBMPlexSansArabic', label: 'IBM Plex Sans Arabic (الافتراضي)' },
                    { value: 'Tajawal', label: 'Tajawal' },
                    { value: 'Cairo', label: 'Cairo' },
                    { value: 'NotoSansArabic', label: 'Noto Sans Arabic' },
                  ]}
                />
              </div>
              <div className="mt-4 space-y-2.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={db.config.classicFlat}
                    onChange={(e) => updateConfig({ classicFlat: e.target.checked })}
                  />
                  <span>النمط الكلاسيكي المسطّح (ImdStyle.classic — حواف 2px بدون ظلال)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={db.config.distinctFuelTheme}
                    onChange={(e) => updateConfig({ distinctFuelTheme: e.target.checked })}
                  />
                  <span>تمييز قسم المحروقات باللوحة البرتقالية (fuelLight / fuelDark)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={db.config.highDensity}
                    onChange={(e) => updateConfig({ highDensity: e.target.checked })}
                  />
                  <span>وضع الكثافة العالية (ImdDensity — ضغط الجداول والحقول)</span>
                </label>
              </div>
            </ImdPanel>
          )}

          {sec === 'numerals' && (
            <ImdPanel
              title="تنسيق الأرقام والعملات والتواريخ (ImdNumberPrefs & ImdFormat)"
              subtitle="فصل تفضيل أرقام الشاشات عن المطبوعات مع ضبط الفواصل وخانات الكميات والمبالغ"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ImdSelect
                    label="أرقام الشاشات (UI Digits)"
                    value={db.config.numerals}
                    onChange={(v) => {
                      const d = v as DigitSystem;
                      updateConfig({ numerals: d });
                      updateNumberPrefs({ ...numberPrefs, uiDigits: d });
                    }}
                    options={[
                      { value: 'arabic', label: 'أرقام هندية/عربية (٠١٢٣٤٥)' },
                      { value: 'western', label: 'أرقام قياسية لاتينية (012345)' },
                    ]}
                  />
                  <ImdSelect
                    label="أرقام المطبوعات وExcel (Print Digits)"
                    value={numberPrefs.printDigits}
                    onChange={(v) => updateNumberPrefs({ ...numberPrefs, printDigits: v as DigitSystem })}
                    options={[
                      { value: 'western', label: 'أرقام قياسية لاتينية (موصى به لمطابقة Excel)' },
                      { value: 'arabic', label: 'أرقام هندية/عربية (٠١٢٣٤٥)' },
                    ]}
                  />
                  <ImdSelect
                    label="العملة الافتراضية"
                    value={db.config.currencyPrimary}
                    onChange={(v) => updateConfig({ currencyPrimary: v as 'SAR' | 'YER' })}
                    options={[
                      { value: 'SAR', label: 'ريال سعودي (SAR)' },
                      { value: 'YER', label: 'ريال يمني (YER)' },
                    ]}
                  />
                  <ImdSelect
                    label="فاصل الآلاف"
                    value={numberPrefs.thousandsSep}
                    onChange={(v) => updateNumberPrefs({ ...numberPrefs, thousandsSep: v as ThousandsSep })}
                    options={[
                      { value: ',', label: 'فاصلة قياسية (,)' },
                      { value: '\u066C', label: 'فاصلة عربية (٬)' },
                      { value: ' ', label: 'مسافة فارغة ( )' },
                      { value: '', label: 'بدون فاصل' },
                    ]}
                  />
                  <ImdSelect
                    label="الفاصل العشري"
                    value={numberPrefs.decimalSep}
                    onChange={(v) => updateNumberPrefs({ ...numberPrefs, decimalSep: v as DecimalSep })}
                    options={[
                      { value: '.', label: 'نقطة قياسية (.)' },
                      { value: '\u066B', label: 'فاصلة عشرية عربية (٫)' },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ImdSelect
                      label="خانات الكميات"
                      value={String(numberPrefs.qtyDecimals)}
                      onChange={(v) => updateNumberPrefs({ ...numberPrefs, qtyDecimals: Number(v) })}
                      options={[
                        { value: '2', label: '2 خانات' },
                        { value: '3', label: '3 خانات (حذف الأصفار)' },
                        { value: '4', label: '4 خانات' },
                      ]}
                    />
                    <ImdSelect
                      label="خانات المبالغ"
                      value={String(numberPrefs.moneyDecimals)}
                      onChange={(v) => updateNumberPrefs({ ...numberPrefs, moneyDecimals: Number(v) })}
                      options={[
                        { value: '0', label: '0' },
                        { value: '2', label: '2 ثابتة' },
                        { value: '3', label: '3 ثابتة' },
                      ]}
                    />
                  </div>
                </div>
                <ImdNote tone="info">
                  معاينة حية: الكمية على الشاشة{' '}
                  <strong className="font-mono-num">{nf(12345.5, { ...numberPrefs, uiDigits: db.config.numerals })}</strong>{' '}
                  · بالمطبوعات{' '}
                  <strong className="font-mono-num">{nfPrint(12345.5, numberPrefs)}</strong> · المبلغ{' '}
                  <strong className="font-mono-num">{nfMoney(1500.5, { ...numberPrefs, uiDigits: db.config.numerals })}</strong>{' '}
                  · التاريخ الرسمي <strong className="font-mono-num">{fmtDate(new Date())}</strong>
                </ImdNote>
              </div>
            </ImdPanel>
          )}

          {sec === 'print_io' && (
            <div className="space-y-4">
              <ImdPanel title="أحجام الورق الافتراضية (PrintPaper)">
                <div className="space-y-3">
                  <ImdSelect
                    label="مقاس الورق الافتراضي للطباعة"
                    value={db.config.paperSize ?? 'A4_P'}
                    onChange={(v) => updateConfig({ paperSize: v as PrintPaperSize })}
                    options={(Object.entries(PAPER_SIZE_LABELS) as Array<[PrintPaperSize, string]>).map(
                      ([k, lbl]) => ({ value: k, label: lbl })
                    )}
                    className="max-w-sm"
                  />
                  <ImdNote tone="info">
                    يدعم النظام الطباعة على A4 (عمودي/أفقي)، A5، و3 مقاسات حرارية (58مم / 80مم / 112مم بدون خانات توقيع)، مع نسخ الصرف والتحويل المتعددة.
                  </ImdNote>
                </div>
              </ImdPanel>

              <ImdPanel
                title="مقاس ملصق الباركود (LabelSize — محلي للجهاز)"
                subtitle={`الحالي: ${formatLabelSize(labelSize)} · يُستخدم عند طباعة ملصقات الأصناف والأصول`}
              >
                <div className="space-y-3">
                  <ImdSelect
                    label="حجم ملصق الباركود"
                    value={labelChoice}
                    onChange={(v) => {
                      setLabelChoice(v);
                      if (v !== 'custom') {
                        const preset =
                          LABEL_SIZE_PRESETS.find((p) => `${p.widthMm}x${p.heightMm}` === v) ??
                          DEFAULT_LABEL_SIZE;
                        setLabelSize(preset);
                        saveLabelSize(preset);
                        notify(`حجم الملصق المحفوظ: ${formatLabelSize(preset)}`, 'success');
                      }
                    }}
                    options={[
                      ...LABEL_SIZE_PRESETS.map((p) => ({
                        value: `${p.widthMm}x${p.heightMm}`,
                        label: formatLabelSize(p),
                      })),
                      { value: 'custom', label: 'مخصص (Custom mm)' },
                    ]}
                    className="max-w-sm"
                  />
                  {labelChoice === 'custom' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end max-w-lg">
                      <ImdFld label="العرض (مم · 15–200)" type="number" value={customLblW} onChange={setCustomLblW} />
                      <ImdFld label="الارتفاع (مم · 15–200)" type="number" value={customLblH} onChange={setCustomLblH} />
                      <ImdButton
                        variant="primary"
                        onClick={() => {
                          const w = Number(customLblW);
                          const h = Number(customLblH);
                          if (!isValidLabelSize(w, h)) {
                            notify('العرض والارتفاع يجب أن يكونا بين 15 و 200 مم', 'danger');
                            return;
                          }
                          const next = { widthMm: w, heightMm: h };
                          setLabelSize(next);
                          saveLabelSize(next);
                          notify(`تم حفظ المقاس المخصص: ${formatLabelSize(next)}`, 'success');
                        }}
                      >
                        حفظ المقاس
                      </ImdButton>
                    </div>
                  )}
                </div>
              </ImdPanel>

              <ImdPanel
                title="القوالب السبعة للتصدير والاستيراد (ExcelTemplates — ورقة البيانات + ورقة التعليمات)"
                subtitle="تنزيل القوالب السبعة المعتمدة أو التصدير والاستيراد الجماعي بوضعي Merge / Replace"
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {EXCEL_TEMPLATES.map((tpl) => (
                      <ImdButton
                        key={tpl.id}
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadOfficialExcelTemplate(tpl.id)}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{tpl.label}</span>
                      </ImdButton>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--imd-line)]">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-[var(--imd-text2)]">وضع الاستيراد:</span>
                      <ImdSelect
                        value={excelImportMode}
                        onChange={(v) => setExcelImportMode(v as 'merge' | 'replace')}
                        options={[
                          { value: 'merge', label: 'دمج ذكي مع الحالي (Merge)' },
                          { value: 'replace', label: 'استبدال الدليل (Replace)' },
                        ]}
                        className="w-56"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ImdButton
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          downloadExcelTemplate(
                            'template_suppliers.xlsx',
                            ['اسم المورد', 'الهاتف', 'المسؤول', 'المدينة'],
                            ['شركة التموين الحديثة', '0501234567', 'سالم الحربي', 'الرياض']
                          )
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>قالب الموردين</span>
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          exportRowsToXlsx(
                            'emdad_items_export.xlsx',
                            'البيانات',
                            [
                              { header: 'الكود', key: 'code' },
                              { header: 'اسم الصنف', key: 'name' },
                              { header: 'التصنيف', key: 'categoryName' },
                              { header: 'الوحدة الأساسية', key: 'baseUnit' },
                              { header: 'الحد الأدنى', key: 'minQty' },
                            ],
                            db.items as unknown as Array<Record<string, unknown>>
                          )
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تصدير دليل الأصناف</span>
                      </ImdButton>
                    </div>
                  </div>
                  <ImdDropZone
                    accept=".xlsx,.xls"
                    label="اسحب وأفلت ملف قالب Excel (.xlsx) هنا لاستيراد الأصناف أو الموردين دفعة واحدة"
                    hint="يدعم ورقة (البيانات) ويطبّع الأرقام الهندية والعربية تلقائياً قبل الحفظ"
                    onFile={handleBatchExcelImport}
                  />
                </div>
              </ImdPanel>
            </div>
          )}

          {sec === 'ops_rules' && (
            <ImdPanel title="المخزون والاستحقاقات ومحرك القوانين (RuleDecision & DaysOfSupply)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ImdSelect
                  label="المعيار الرسمي المعتمد للوجبات"
                  value={db.config.officialStandard}
                  onChange={(v) => updateConfig({ officialStandard: v as 'detailed32' | 'compact27' })}
                  options={[
                    { value: 'detailed32', label: 'detailed32 (32 صنفاً تفصيلياً — أساس 31 يوماً)' },
                    { value: 'compact27', label: 'compact27 (27 صنفاً مدمجاً — أساس 30 يوماً)' },
                  ]}
                />
                <ImdFld
                  label="أيام إعادة الطلب (supplyDaysMin)"
                  type="number"
                  value={db.config.supplyDaysMin}
                  onChange={(v) => updateConfig({ supplyDaysMin: Number(v) || 7 })}
                />
                <ImdFld
                  label="أيام حد الخطر الحرج (supplyDaysCritical)"
                  type="number"
                  value={db.config.supplyDaysCritical}
                  onChange={(v) => updateConfig({ supplyDaysCritical: Number(v) || 3 })}
                />
                <ImdFld
                  label="نسبة تنبيه تجاوز الاستحقاق (%)"
                  type="number"
                  value={db.config.ruleSoftWarningThresholdPct}
                  onChange={(v) => updateConfig({ ruleSoftWarningThresholdPct: Number(v) || 10 })}
                />
                <ImdFld
                  label="نسبة القفل الإلزامي (% يتطلب توقيع المالك)"
                  type="number"
                  value={db.config.ruleHardLockThresholdPct}
                  onChange={(v) => updateConfig({ ruleHardLockThresholdPct: Number(v) || 30 })}
                />
              </div>
            </ImdPanel>
          )}

          {sec === 'auto_archive' && (
            <ImdPanel title="الأرشفة التلقائية وقفل الخمول">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={db.config.autoArchiveOnPrint}
                    onChange={(e) => updateConfig({ autoArchiveOnPrint: e.target.checked })}
                  />
                  <span>تفعيل الأرشفة التلقائية (حفظ نسخة موثقة ببصمة SHA-256 فور طباعة أي سند)</span>
                </label>
                <ImdFld
                  label="قفل الجلسة التلقائي بعد الخمول (دقائق — 0 للتعطيل)"
                  type="number"
                  value={db.config.idleLockMinutes}
                  onChange={(v) => updateConfig({ idleLockMinutes: Math.max(0, Number(v) || 0) })}
                  className="max-w-xs"
                />
              </div>
            </ImdPanel>
          )}

          {sec === 'users' && (
            <div className="space-y-4">
              <ImdPanel title="إضافة مستخدم وتعيين قالب الدور ونطاق المستودعات">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ImdFld label="اسم الدخول" value={newUname} onChange={setNewUname} />
                  <ImdFld label="الاسم الكامل" value={newName} onChange={setNewName} />
                  <ImdFld label="كلمة المرور (PBKDF2)" type="password" value={newPwd} onChange={setNewPwd} />
                  <ImdSelect
                    label="الدور الأساسي"
                    value={newRole}
                    onChange={(v) => setNewRole(v as UserRole)}
                    options={[
                      { value: 'user', label: 'مستخدم (حسب القالب والمصفوفة)' },
                      { value: 'admin', label: 'مدير نظام (كل الصفحات دون sys.*)' },
                      { value: 'owner', label: 'مالك (كامل الصلاحيات + sys.*)' },
                    ]}
                  />
                  <ImdSelect
                    label="قالب الدور / المنصب (16 قالباً)"
                    value={newTplId}
                    onChange={setNewTplId}
                    options={ROLE_TEMPLATES.map((t) => ({
                      value: t.id,
                      label: `${t.category === 'military' ? '[منصب] ' : '[وظيفي] '}${t.name}`,
                    }))}
                  />
                  <ImdSelect
                    label="نطاق المستودعات (warehouseScope)"
                    value={newWhScope}
                    onChange={setNewWhScope}
                    options={[
                      { value: 'ALL', label: 'كافة المستودعات (ALL)' },
                      ...db.warehouses.map((w) => ({ value: w.name, label: w.name })),
                    ]}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <ImdButton variant="primary" onClick={handleSaveUser}>إنشاء المستخدم</ImdButton>
                </div>
              </ImdPanel>

              <ImdPanel title="المستخدمون وحجب الأقسام (SectionBlock Fail-Closed)">
                <ImdTable
                  columns={[
                    { key: 'u', header: 'الحساب', render: (r) => <span className="font-mono-num">{r.username}</span> },
                    { key: 'n', header: 'الاسم', render: (r) => <strong>{r.name}</strong> },
                    {
                      key: 'r',
                      header: 'الدور والقالب',
                      render: (r) => (
                        <div className="text-xs">
                          <span className="font-semibold">{r.role}</span>
                          {r.roles[0] && (
                            <div className="text-[10px] text-[var(--imd-muted)]">
                              {ROLE_TEMPLATES.find((t) => t.id === r.roles[0])?.name ?? r.roles[0]}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    { key: 'sc', header: 'نطاق المستودعات', render: (r) => (r.warehouseScope === 'ALL' ? 'الكل' : r.warehouseScope.join('، ')) },
                    {
                      key: 'st',
                      header: 'الحالة',
                      render: (r) => (
                        <ImdStatusText
                          label={!r.approved ? 'بانتظار الاعتماد' : r.active ? 'نشط' : 'موقوف'}
                          tone={!r.approved ? 'warn' : r.active ? 'success' : 'danger'}
                        />
                      ),
                    },
                    {
                      key: 'blk',
                      header: 'حجب الأقسام',
                      render: (r) =>
                        r.role === 'owner' ? (
                          <span className="text-xs text-[var(--imd-muted)]">محصّن (المالك)</span>
                        ) : (
                          <ImdButton size="sm" variant="secondary" onClick={() => setSectionBlockTarget(r)}>
                            <Sliders className="w-3.5 h-3.5" />
                            <span>الأقسام ({r.sectionBlocked.length}/{SECTION_BLOCKS.length})</span>
                          </ImdButton>
                        ),
                    },
                    {
                      key: 'act',
                      header: 'الإجراءات',
                      render: (r) => (
                        <div className="flex items-center gap-1">
                          {!r.approved && (
                            <ImdButton size="sm" variant="primary" title="اعتماد الحساب" onClick={() => handleApproveUser(r)}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>اعتماد</span>
                            </ImdButton>
                          )}
                          <ImdButton size="sm" variant="ghost" title="تعديل الدور ونطاق المستودعات" onClick={() => handleOpenEditUser(r)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </ImdButton>
                          <ImdButton
                            size="sm"
                            variant="ghost"
                            title="إعادة تعيين كلمة المرور"
                            onClick={() => {
                              setResetPwdTarget(r);
                              setResetPwdVal('');
                              setResetPwdConfirm('');
                            }}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </ImdButton>
                          {r.role !== 'owner' && r.id !== currentUser?.id && (
                            <ImdButton
                              size="sm"
                              variant="ghost"
                              title={r.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                              onClick={() => handleToggleUserActive(r)}
                            >
                              <Power className={`w-3.5 h-3.5 ${r.active ? 'text-[var(--imd-danger)]' : 'text-[var(--imd-success)]'}`} />
                            </ImdButton>
                          )}
                        </div>
                      ),
                    },
                  ]}
                  rows={db.users}
                  rowKey={(r) => r.id}
                />
              </ImdPanel>
            </div>
          )}

          {sec === 'devices' && (
            <div className="space-y-4">
              <ImdPanel title="تفعيل الأجهزة بدون إنترنت (DeviceActivation — Master / Branch / Expiry)">
                <div className="space-y-3">
                  <div className="text-xs flex flex-wrap items-center gap-2">
                    <span>
                      معرّف الجهاز الحالي: <strong className="font-mono-num">{db.config.deviceId}</strong>
                    </span>
                    <ImdStatusText
                      label={verifyDeviceIdChecksum(db.config.deviceId) ? 'Checksum صحيح' : 'Checksum غير صالح'}
                      tone={verifyDeviceIdChecksum(db.config.deviceId) ? 'success' : 'danger'}
                    />
                    {activationStatus && (
                      <ImdStatusText
                        label={
                          activationStatus.valid
                            ? `مفعّل (${activationStatus.role === 'master' ? 'رئيسي' : 'فرعي'})`
                            : activationStatus.reason || 'غير مفعّل'
                        }
                        tone={activationStatus.valid ? 'success' : 'danger'}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <ImdSelect
                      label="دور الجهاز"
                      value={actRole}
                      onChange={(v) => setActRole(v as DeviceRole)}
                      options={[
                        { value: 'master', label: 'جهاز الإدارة الرئيسي (Master)' },
                        { value: 'branch', label: 'جهاز فرعي (Branch)' },
                      ]}
                    />
                    <ImdFld label="الفرع / القطاع التابع" value={actBranch} onChange={setActBranch} />
                    <ImdFld label="تاريخ انتهاء التفعيل (اختياري)" type="date" value={actExpires} onChange={setActExpires} />
                  </div>
                  <ImdFld label="شهادة التفعيل (IMDACT2...)" value={actVerifyInput} onChange={setActVerifyInput} />
                  <div className="flex flex-wrap gap-2">
                    <ImdButton variant="primary" onClick={handleGenerateActivation}>
                      <KeyRound className="w-4 h-4" />
                      <span>إصدار وتثبيت شهادة التفعيل (IMDACT2)</span>
                    </ImdButton>
                    <ImdButton variant="secondary" onClick={handleVerifyActivation}>
                      <ShieldCheck className="w-4 h-4" />
                      <span>التحقق من الشهادة</span>
                    </ImdButton>
                    <ImdButton
                      variant="ghost"
                      onClick={async () => {
                        await ESign.resetKey();
                        notify('تم تدوير زوج مفاتيح التوقيع الميداني ESign (RFC 6979 / P-256)', 'info');
                      }}
                    >
                      تدوير مفتاح القائد (ESign)
                    </ImdButton>
                    <ImdButton variant="ghost" onClick={() => setKeyRecoveryRequired(true)}>
                      اختبار شاشة الاسترداد (KeyRecovery)
                    </ImdButton>
                  </div>
                  {actStatusMsg && <ImdNote tone="info">{actStatusMsg}</ImdNote>}
                </div>
              </ImdPanel>

              <ImdPanel
                title="سجل إلغاء التفعيل الموقّع (Device Revocations)"
                subtitle="إصدار قرار إلغاء تفعيل موقّع ينتشر عبر حزم المزامنة ليُغلق الجهاز الملغى فوراً عند الإقلاع"
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                    <ImdFld label="معرّف الجهاز المراد إلغاؤه" value={revokeTargetId} onChange={setRevokeTargetId} />
                    <ImdFld label="سبب الإلغاء" value={revokeReason} onChange={setRevokeReason} />
                    <ImdButton
                      variant="danger"
                      onClick={async () => {
                        if (!hasSysPerm(currentUser, 'sys.devices')) {
                          notify('صلاحية sys.devices محصورة بالمالك', 'danger');
                          return;
                        }
                        await DeviceActivation.createRevocation({
                          deviceId: revokeTargetId,
                          reason: revokeReason,
                          revokedBy: currentUser?.name ?? 'المالك',
                        });
                        await refreshActivationStatus();
                        notify(`تم تسجيل إلغاء موقّع للجهاز ${revokeTargetId}`, 'warn');
                      }}
                    >
                      تسجيل قرار إلغاء جهاز
                    </ImdButton>
                  </div>
                  {loadDeviceRevocations().length > 0 && (
                    <div className="text-xs space-y-1 text-[var(--imd-muted)]">
                      {loadDeviceRevocations().map((rv) => (
                        <div key={rv.id} className="flex items-center justify-between border-b border-[var(--imd-table-row-line)] py-1">
                          <span className="font-mono-num">
                            {rv.deviceId} · {rv.reason} ({rv.revokedAt.slice(0, 10)})
                          </span>
                          <ImdButton
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const next = loadDeviceRevocations().filter((x) => x.id !== rv.id);
                              localStorage.setItem('emdad_device_revocations_v1', JSON.stringify(next));
                              await refreshActivationStatus();
                              notify(`تم رفع الإلغاء عن الجهاز ${rv.deviceId}`, 'success');
                            }}
                          >
                            رفع الإلغاء
                          </ImdButton>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ImdPanel>

              <ImdPanel
                title="ضمان واسترداد مفتاح المالك (KeyEscrow — .imdadkey)"
                subtitle="تصدير نسخة مشفّرة من مفتاح التوقيع ECDSA P-256 أو استردادها عند تغيير الجهاز أو قفل الحساب"
              >
                <div className="space-y-3">
                  <ImdFld
                    label="عبارة حماية ملف الضمان"
                    type="password"
                    value={escrowPass}
                    onChange={setEscrowPass}
                    className="max-w-sm"
                  />
                  <ImdButton
                    variant="secondary"
                    onClick={async () => {
                      if (!escrowPass.trim()) {
                        notify('أدخل عبارة الحماية أولاً', 'danger');
                        return;
                      }
                      const enc = await exportEscrowSigningKeys(escrowPass.trim());
                      const blob = new Blob([enc], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `imdad_owner_escrow_${db.config.deviceId}.imdadkey`;
                      a.click();
                      URL.revokeObjectURL(url);
                      notify('تم تصدير ملف ضمان مفتاح المالك المشفّر (.imdadkey)', 'success');
                    }}
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير مفتاح المالك (KeyEscrow)</span>
                  </ImdButton>
                  <ImdDropZone
                    accept=".imdadkey,.json"
                    label="اسحب وأفلت ملف ضمان المفتاح (.imdadkey) لاسترداد زوج المفاتيح"
                    hint="سيُستعاد مفتاح التوقيع الرقمي الفوري للتحقق من شهادات IMD2 و IMDACT2"
                    onFile={async (file) => {
                      try {
                        const txt = await file.text();
                        await restoreEscrowSigningKeys(txt, escrowPass.trim());
                        notify('تم استرداد زوج مفاتيح المالك بنجاح', 'success');
                      } catch {
                        notify('فشل استرداد المفتاح — تأكد من عبارة الحماية', 'danger');
                      }
                    }}
                  />
                </div>
              </ImdPanel>
            </div>
          )}

          {sec === 'verify_sign' && (
            <ImdPanel title="التحقق من التوقيع الإلكتروني للسندات (VerifySign — IMD2|...)">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 items-end">
                  <ImdFld label="رقم سند للاختبار" value={sigSampleRef} onChange={setSigSampleRef} className="flex-1" />
                  <ImdButton variant="secondary" onClick={handleGenerateSampleSig}>
                    توليد حمولة QR للسند
                  </ImdButton>
                </div>
                <ImdFld label="نص التوقيع / QR (IMD2|...)" value={sigToken} onChange={setSigToken} />
                <ImdButton variant="primary" onClick={handleVerifyDocumentSig}>
                  <ShieldCheck className="w-4 h-4" />
                  <span>مطابقة التوقيع مع القاعدة المحلية</span>
                </ImdButton>
                {sigCheckMsg && <ImdNote tone="info">{sigCheckMsg}</ImdNote>}
              </div>
            </ImdPanel>
          )}

          {sec === 'sync' && (
            <div className="space-y-4">
              <ImdPanel title="المزامنة المباشرة على الشبكة المحلية (LAN Sync — HTTPS:8787 / UDP:8788)">
                <div className="space-y-3">
                  <ImdNote tone="info">
                    يعتمد محرك المزامنة على الاقتران عبر ECDH P-256 + رمز 8 أحرف (PBKDF2 100k) وتبادل حزم تفاضلية بـ HLC مشفّرة بـ AES-256-GCM مع التحقق بـ SHA-256 وعزل التعارضات في جدول sync_conflicts.
                  </ImdNote>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <ImdFld label="رمز الاقتران لمرة واحدة (XXXX-XXXX)" value={pairCode} onChange={setPairCode} />
                    <ImdButton
                      variant="secondary"
                      onClick={() => {
                        const rnd = Math.random().toString(36).substring(2, 10).toUpperCase();
                        setPairCode(`${rnd.slice(0, 4)}-${rnd.slice(4, 8)}`);
                        notify('تم توليد رمز اقتران ECDH جديد', 'info');
                      }}
                    >
                      توليد رمز اقتران جديد
                    </ImdButton>
                    <ImdButton variant="primary" onClick={handleExportSyncPacket}>
                      <Download className="w-4 h-4" />
                      <span>تصدير حزمة مزامنة تفاضلية (.imdad-sync)</span>
                    </ImdButton>
                  </div>
                  <ImdDropZone
                    accept=".imdad-sync,.json"
                    label="استيراد ودمج حزمة مزامنة من جهاز قرين (.imdad-sync)"
                    hint="سيتم فك التشفير برمز الاقتران والتحقق من البصمة وعزل أي تعديلات متعارضة"
                    onFile={handleImportSyncPacket}
                  />
                </div>
              </ImdPanel>

              <ImdPanel
                title="لوحة حسم التعارضات (SyncConflictsPanel)"
                subtitle="التضاربات المسجلة بين التعديلات المحلية ونسخ الأجهزة القرينة (الصلاحية متاحة لـ admin و owner)"
                headerRight={
                  unresolvedConflicts.length > 0 && canResolveConflicts ? (
                    <div className="flex items-center gap-2">
                      <ImdButton
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          handleResolveConflicts(
                            unresolvedConflicts.map((c) => c.id),
                            'restore_local'
                          )
                        }
                      >
                        استعادة الكل (المحلي)
                      </ImdButton>
                      <ImdButton
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          handleResolveConflicts(
                            unresolvedConflicts.map((c) => c.id),
                            'accept_peer'
                          )
                        }
                      >
                        اعتماد الكل (القرين)
                      </ImdButton>
                    </div>
                  ) : null
                }
              >
                <ImdTable
                  columns={[
                    { key: 'tbl', header: 'الجدول', render: (r) => <span className="font-mono-num text-xs">{r.table}</span> },
                    { key: 'rid', header: 'معرّف السجل', render: (r) => <span className="font-mono-num text-xs">{r.recordId}</span> },
                    { key: 'peer', header: 'الجهاز القرين', render: (r) => r.peerName },
                    { key: 'dt', header: 'وقت الاكتشاف', numeric: true, render: (r) => r.detectedAt.slice(0, 16).replace('T', ' ') },
                    {
                      key: 'st',
                      header: 'الحالة',
                      render: (r) => (
                        <ImdStatusText
                          label={r.resolved ? 'محسوم' : 'بانتظار الحسم'}
                          tone={r.resolved ? 'success' : 'warn'}
                        />
                      ),
                    },
                    {
                      key: 'act',
                      header: 'الإجراء',
                      render: (r) =>
                        !r.resolved && canResolveConflicts ? (
                          <div className="flex items-center gap-1">
                            <ImdButton
                              size="sm"
                              variant="secondary"
                              onClick={() => handleResolveConflicts([r.id], 'restore_local')}
                            >
                              استعادة
                            </ImdButton>
                            <ImdButton
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResolveConflicts([r.id], 'accept_peer')}
                            >
                              اعتماد القرين
                            </ImdButton>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--imd-muted)]">—</span>
                        ),
                    },
                  ]}
                  rows={db.sync_conflicts}
                  rowKey={(r) => r.id}
                  emptyTitle="لا توجد تعارضات مزامنة حالياً"
                />
              </ImdPanel>
            </div>
          )}

          {sec === 'backup' && (
            <div className="space-y-4">
              <ImdPanel
                title="النسخ الاحتياطي المشفّر (.imdbk — PBKDF2 + AES-256-GCM)"
                subtitle="حفظ واستعادة القاعدة الكاملة مشفّرة مع جدول التدوير التلقائي والترحيل الذكي JSON"
              >
                <div className="space-y-3">
                  <ImdFld
                    label="كلمة مرور التشفير"
                    type="password"
                    value={backupPass}
                    onChange={setBackupPass}
                    className="max-w-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <ImdButton variant="primary" onClick={handleExportEncryptedBackup}>
                      <Download className="w-4 h-4" />
                      <span>تصدير نسخة مشفّرة (.imdbk)</span>
                    </ImdButton>
                    <ImdButton variant="secondary" onClick={handleRunRotatedBackupNow}>
                      <span>حفظ نسخة محلية مدوّرة الآن</span>
                    </ImdButton>
                    <ImdButton variant="secondary" onClick={handleExportMigrationJson}>
                      <Download className="w-4 h-4" />
                      <span>تصدير حزمة الترحيل (JSON المعقّم)</span>
                    </ImdButton>
                  </div>
                  <ImdDropZone
                    accept=".imdbk,.imdad,.json"
                    label="اسحب وأفلت ملف النسخة الاحتياطية المشفّرة (.imdbk / .imdad) للاستعادة الكاملة"
                    hint="يدعم صيغ .imdbk و .imdad المشفّرة بـ AES-256-GCM"
                    onFile={restoreEncryptedFile}
                  />
                  <ImdDropZone
                    accept=".json"
                    label="أو اسحب ملف الترحيل JSON للدمج الذكي (LegacyImporter + عزل التعارضات + حماية الصلاحيات)"
                    hint="يستبعد المفاتيح المحلية الـ 17 ويحل تصادم المفاتيح الطبيعية تلقائياً"
                    onFile={handleSmartImportMigrationJson}
                  />
                </div>
              </ImdPanel>

              <ImdPanel
                title="جدولة النسخ التلقائي والتدوير (BackupScheduler)"
                subtitle={`آخر تشغيل: ${backupSchedule.lastRunAt ? backupSchedule.lastRunAt.slice(0, 16).replace('T', ' ') : 'لم يُشغّل بعد'}`}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <ImdSelect
                    label="دورية النسخ الاحتياطي التلقائي"
                    value={String(backupSchedule.intervalHours)}
                    onChange={(v) => {
                      const next = { ...backupSchedule, intervalHours: Number(v) as BackupIntervalHours };
                      setBackupSchedule(next);
                      saveBackupSchedule(next);
                      notify('تم تحديث جدولة النسخ الاحتياطي', 'info');
                    }}
                    options={[
                      { value: '24', label: 'كل 24 ساعة (يومي)' },
                      { value: '72', label: 'كل 72 ساعة (3 أيام)' },
                      { value: '168', label: 'كل 168 ساعة (أسبوعي)' },
                      { value: '720', label: 'كل 720 ساعة (شهري)' },
                      { value: '0', label: 'إيقاف الجدولة التلقائية' },
                    ]}
                  />
                  <ImdFld
                    label="الاحتفاظ بآخر N نسخ محلية"
                    type="number"
                    value={backupSchedule.retentionCount}
                    onChange={(v) => {
                      const next = { ...backupSchedule, retentionCount: Math.max(1, Math.min(20, Number(v) || 5)) };
                      setBackupSchedule(next);
                      saveBackupSchedule(next);
                    }}
                  />
                </div>
                <ImdTable
                  columns={[
                    { key: 'fn', header: 'اسم اللقطة', render: (r) => <span className="font-mono-num text-xs">{r.fileName}</span> },
                    { key: 'dt', header: 'التوقيت', numeric: true, render: (r) => r.createdAt.slice(0, 16).replace('T', ' ') },
                    { key: 'sz', header: 'الحجم', numeric: true, render: (r) => `${(r.sizeBytes / 1024).toFixed(1)} KB` },
                    { key: 'sh', header: 'SHA-256', render: (r) => <span className="font-mono-num text-[11px]">{r.sha256.slice(0, 14)}...</span> },
                    {
                      key: 'act',
                      header: 'إجراء',
                      render: (r) => (
                        <div className="flex items-center gap-1">
                          <ImdButton
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const blob = new Blob([r.encryptedEnvelope], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = r.fileName;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </ImdButton>
                          <ImdButton
                            size="sm"
                            variant="ghost"
                            onClick={() => setSnapshots(deleteRotatedSnapshot(r.id))}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[var(--imd-danger)]" />
                          </ImdButton>
                        </div>
                      ),
                    },
                  ]}
                  rows={snapshots}
                  rowKey={(r) => r.id}
                  emptyTitle="لا توجد لقطات مدوّرة محفوظة محلياً بعد"
                  reportCountToStatusBar={false}
                />
              </ImdPanel>
            </div>
          )}

          {sec === 'maintenance' && (
            <ImdPanel title="الصيانة والفحص وإعادة التهيئة">
              <div className="space-y-3">
                <ImdNote tone="danger" title="إعادة ضبط قاعدة البيانات المحلية">
                  سيؤدي هذا الإجراء إلى مسح كافة التعديلات المحلية وإعادة تحميل البيانات التأسيسية الافتراضية.
                </ImdNote>
                <ImdButton variant="danger" onClick={resetAllLocalData}>
                  إعادة تهيئة قاعدة البيانات المحلية
                </ImdButton>
              </div>
            </ImdPanel>
          )}

          {sec === 'about' && (
            <ImdPanel title="عن نظام الإمداد والتموين (imdad)">
              <div className="text-xs md:text-sm space-y-2 text-[var(--imd-text2)]">
                <div><strong>إصدار التطبيق المعتمد:</strong> v{APP_VERSION} ({APP_CODENAME})</div>
                <div><strong>إصدار المخطط:</strong> Schema Version 31 (59 جدولاً ومجموعات بيانات محلية)</div>
                <div><strong>النمط التشغيلي:</strong> Offline-First / Local-First ERP & PWA</div>
                <div><strong>المعمارية:</strong> Core · Data (IndexedDB) · Domain (Pure Calculations) · Features (Supply & Fuel)</div>
                <div><strong>التشفير:</strong> PBKDF2-HMAC-SHA256 · ECDSA P-256 · AES-256-GCM · SHA-256</div>
              </div>
            </ImdPanel>
          )}
        </div>
      </div>

      {/* Reset User Password Modal */}
      <ImdModal
        open={Boolean(resetPwdTarget)}
        onClose={() => setResetPwdTarget(null)}
        title={`إعادة تعيين كلمة المرور — ${resetPwdTarget?.name ?? ''}`}
        widthClass="max-w-md"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setResetPwdTarget(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={() => void handleConfirmResetPassword()}>حفظ كلمة المرور الجديدة</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          <ImdFld label="كلمة المرور الجديدة" type="password" value={resetPwdVal} onChange={setResetPwdVal} />
          <ImdFld label="تأكيد كلمة المرور الجديدة" type="password" value={resetPwdConfirm} onChange={setResetPwdConfirm} />
        </div>
      </ImdModal>

      {/* Edit User Role, Template & Warehouse Scope Modal */}
      <ImdModal
        open={Boolean(editUserTarget)}
        onClose={() => setEditUserTarget(null)}
        title={`تعديل الدور ونطاق المستودعات — ${editUserTarget?.name ?? ''}`}
        widthClass="max-w-lg"
        footer={
          <>
            <ImdButton variant="secondary" onClick={() => setEditUserTarget(null)}>إلغاء</ImdButton>
            <ImdButton variant="primary" onClick={handleConfirmEditUser}>حفظ التعديلات</ImdButton>
          </>
        }
      >
        <div className="space-y-3">
          {editUserTarget?.role !== 'owner' && (
            <ImdSelect
              label="الدور الأساسي"
              value={editUserRole}
              onChange={(v) => setEditUserRole(v as UserRole)}
              options={[
                { value: 'user', label: 'مستخدم (حسب القالب والمصفوفة)' },
                { value: 'admin', label: 'مدير نظام (كل الصفحات دون sys.*)' },
              ]}
            />
          )}
          <ImdSelect
            label="قالب الدور / المنصب (16 قالباً)"
            value={editUserTplId}
            onChange={setEditUserTplId}
            options={ROLE_TEMPLATES.map((t) => ({
              value: t.id,
              label: `${t.category === 'military' ? '[منصب] ' : '[وظيفي] '}${t.name}`,
            }))}
          />
          <ImdSelect
            label="نطاق المستودعات"
            value={editUserScopeMode}
            onChange={(v) => setEditUserScopeMode(v as 'ALL' | 'CUSTOM')}
            options={[
              { value: 'ALL', label: 'كافة المستودعات (ALL)' },
              { value: 'CUSTOM', label: 'مستودعات محددة فقط' },
            ]}
          />
          {editUserScopeMode === 'CUSTOM' && (
            <div className="flex flex-wrap gap-2 p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
              {db.warehouses.map((w) => {
                const selected = editUserWarehouses.includes(w.name);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() =>
                      setEditUserWarehouses((prev) =>
                        selected ? prev.filter((x) => x !== w.name) : [...prev, w.name]
                      )
                    }
                    className={`px-2.5 py-1 text-xs border cursor-pointer ${
                      selected
                        ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-bold'
                        : 'border-[var(--imd-line)] bg-[var(--imd-surface)] text-[var(--imd-muted)]'
                    }`}
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    {w.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ImdModal>

      {/* Full SectionBlock Modal (ALL SECTION_BLOCKS) */}
      <ImdModal
        open={Boolean(sectionBlockTarget)}
        onClose={() => setSectionBlockTarget(null)}
        title={`حجب الأقسام (SectionBlock Fail-Closed) — ${sectionBlockTarget?.name ?? ''}`}
        widthClass="max-w-2xl"
        footer={<ImdButton variant="primary" onClick={() => setSectionBlockTarget(null)}>إغلاق</ImdButton>}
      >
        {sectionBlockTarget && (
          <div className="space-y-3">
            <ImdNote tone="info">
              أي قسم يتم حجبه هنا يُمنع المستخدم من الوصول إليه نهائياً (Fail-Closed)، ويتطلب فكّه صلاحية المالك.
            </ImdNote>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SECTION_BLOCKS.map((b) => {
                const blocked = sectionBlockTarget.sectionBlocked.includes(b.key);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => toggleUserSectionBlock(sectionBlockTarget, b.key)}
                    className={`px-3 py-2 text-xs text-right border cursor-pointer transition-colors ${
                      blocked
                        ? 'border-[var(--imd-danger)] bg-[color-mix(in_srgb,var(--imd-danger)_10%,transparent)] text-[var(--imd-danger)] font-bold'
                        : 'border-[var(--imd-line)] bg-[var(--imd-panel-fill)] text-[var(--imd-text2)] hover:border-[var(--imd-line-strong)]'
                    }`}
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <div>{b.label}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">{blocked ? 'محجوب حالياً' : 'متاح حسب الدور'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </ImdModal>
    </ImdPage>
  );
};
