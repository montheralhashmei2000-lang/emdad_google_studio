// Application Boot Security Gates: OwnerKey Release Guard, KeyRecoveryScreen, DeviceActivationScreen / ActivationLockScreen, & First-Run BootstrapScreen

import React, { useState } from 'react';
import { KeyRound, Lock, ShieldAlert, ShieldCheck, Upload, UserPlus } from 'lucide-react';
import {
  DeviceActivation,
  loadDeviceRevocations,
  type ActivationPayload,
  type DeviceRole,
} from '../../core/security/deviceActivation';
import { PasswordHash } from '../../core/security/passwordHash';
import { OwnerSignature } from '../../core/security/ownerSignature';
import { Ids, restoreEscrowSigningKeys } from '../../core/security/crypto';
import { PERM_CATALOG } from '../../domain/accessControl';
import { smartMergeImportJson } from '../../data/migration/dataMigration';
import type { EmdadDbState } from '../../data/db';
import type { User } from '../../domain/types';
import { ImdButton, ImdDropZone, ImdFld, ImdNote, ImdSelect } from '../../components/imd/primitives';

export const BootErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div
    className="min-h-screen flex items-center justify-center p-6"
    style={{ backgroundColor: 'var(--imd-bg)', color: 'var(--imd-text)' }}
  >
    <div
      className="w-full max-w-lg p-6 border border-[var(--imd-danger)] bg-[var(--imd-surface)] space-y-4"
      style={{ borderRadius: 'var(--imd-radius)' }}
    >
      <div className="flex items-center gap-3 text-[var(--imd-danger)]">
        <ShieldAlert className="w-7 h-7 shrink-0" />
        <div>
          <h1 className="text-base font-bold">توقف الإقلاع الأمني (Release Security Guard)</h1>
          <p className="text-xs opacity-80">OwnerKey Failure — الإصدار المحمي</p>
        </div>
      </div>
      <ImdNote tone="danger">{message}</ImdNote>
    </div>
  </div>
);

export const KeyRecoveryBootScreen: React.FC<{
  reason: string;
  onRecovered: () => void;
}> = ({ reason, onRecovered }) => {
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');

  const handleRestore = async (file: File) => {
    setErr('');
    setStatus('');
    if (!passphrase.trim()) {
      setErr('أدخل عبارة فك التشفير السرية لملف الضمان أولاً');
      return;
    }
    try {
      const txt = await file.text();
      await restoreEscrowSigningKeys(txt, passphrase.trim());
      setStatus('تم استرداد مفاتيح التوقيع والتشفير بنجاح دون المساس بالبيانات');
      window.setTimeout(onRecovered, 400);
    } catch {
      setErr('تعذّر فك تشفير ملف الضمان (.imdadkey) — تحقق من العبارة السرية');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--imd-bg)', color: 'var(--imd-text)' }}
    >
      <div
        className="w-full max-w-lg p-6 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] space-y-4 shadow-md"
        style={{ borderRadius: 'var(--imd-radius)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center bg-[var(--imd-warn-soft)] text-[var(--imd-warn)]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          >
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold">شاشة استرداد مفاتيح القاعدة (KeyRecovery)</h1>
            <p className="text-xs text-[var(--imd-muted)]">
              البيانات محفوظة بأمان ولن يتم مسح القاعدة — استعد ملف الضمان للمتابعة
            </p>
          </div>
        </div>
        {reason && <ImdNote tone="note">{reason}</ImdNote>}
        {err && <ImdNote tone="danger">{err}</ImdNote>}
        {status && <ImdNote tone="success">{status}</ImdNote>}
        <ImdFld
          label="عبارة فك التشفير السرية للضمان"
          type="password"
          value={passphrase}
          onChange={setPassphrase}
          placeholder="أدخل العبارة السرية لملف .imdadkey"
        />
        <ImdDropZone
          accept=".imdadkey,.json"
          label="اسحب وأفلت ملف ضمان المفتاح (.imdadkey) هنا"
          hint="AES-256-GCM Key Escrow"
          onFile={handleRestore}
        />
      </div>
    </div>
  );
};

export const DeviceActivationBootScreen: React.FC<{
  db: EmdadDbState;
  status: ActivationPayload;
  lockedMode: boolean;
  onActivate: (token: string) => void;
}> = ({ db, status, lockedMode, onActivate }) => {
  const [tokenInput, setTokenInput] = useState(db.config.activationToken || '');
  const [role, setRole] = useState<DeviceRole>(status.role || 'master');
  const [branch, setBranch] = useState(status.branch || 'المركز الرئيسي');
  const [expiresAt, setExpiresAt] = useState(status.expiresAt || '');
  const [err, setErr] = useState('');

  const handleApplyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const verified = await DeviceActivation.verifyToken(tokenInput.trim(), loadDeviceRevocations());
    if (!verified.valid) {
      setErr(verified.reason || 'شهادة التفعيل غير صالحة أو منتهية أو ملغاة');
      return;
    }
    if (verified.deviceId.toUpperCase() !== db.config.deviceId.toUpperCase()) {
      setErr(`شهادة التفعيل صادرة لجهاز آخر (${verified.deviceId}) ولا تطابق معرف هذا الجهاز`);
      return;
    }
    onActivate(tokenInput.trim());
  };

  const handleIssueStandaloneOwnerCert = async () => {
    setErr('');
    const tok = await DeviceActivation.issueCertificate({
      deviceId: db.config.deviceId,
      issuedTo: db.config.orgName,
      role,
      branch,
      expiresAt,
    });
    setTokenInput(tok);
    onActivate(tok);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--imd-bg)', color: 'var(--imd-text)' }}
    >
      <div
        className="w-full max-w-xl p-6 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] space-y-4 shadow-md"
        style={{ borderRadius: 'var(--imd-radius)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 flex items-center justify-center bg-[var(--imd-accent-soft)] text-[var(--imd-accent)]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          >
            {lockedMode ? <Lock className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-base font-bold">
              {lockedMode ? 'قفل التفعيل الإلزامي (ActivationLock)' : 'بوابة تفعيل الجهاز (DeviceActivation)'}
            </h1>
            <p className="text-xs text-[var(--imd-muted)]">
              {db.config.orgName} · معرّف الجهاز الثابت:{' '}
              <span className="font-mono-num font-bold text-[var(--imd-text)]">{db.config.deviceId}</span>
            </p>
          </div>
        </div>

        <ImdNote tone={lockedMode ? 'danger' : 'info'}>
          {status.reason || 'هذا الجهاز بحاجة إلى بطاقة تفعيل رقمية موقّعة (IMDACT2) قبل تسجيل الدخول.'}
        </ImdNote>
        {err && <ImdNote tone="danger">{err}</ImdNote>}

        <form onSubmit={handleApplyToken} className="space-y-3">
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[var(--imd-text2)]">بطاقة التفعيل الموقّعة (IMDACT2)</span>
            <textarea
              rows={3}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="الصق شهادة التفعيل IMDACT2... هنا"
              className="w-full p-2.5 text-xs font-mono-num border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] text-[var(--imd-text)]"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ImdButton type="submit" variant="primary">
              التحقق وتفعيل الجهاز
            </ImdButton>
            {!lockedMode && (
              <ImdButton type="button" variant="secondary" onClick={handleIssueStandaloneOwnerCert}>
                تفعيل جهاز الإدارة (Master) بمفتاح المالك المحلي
              </ImdButton>
            )}
          </div>
        </form>

        {!lockedMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-3 border-t border-[var(--imd-line)]">
            <ImdSelect
              label="دور الجهاز"
              value={role}
              onChange={(v) => setRole(v as DeviceRole)}
              options={[
                { value: 'master', label: 'رئيسي (Master)' },
                { value: 'branch', label: 'فرعي (Branch)' },
              ]}
            />
            <ImdFld label="اسم الفرع / القطاع" value={branch} onChange={setBranch} />
            <ImdFld label="تاريخ انتهاء التفعيل (اختياري)" type="date" value={expiresAt} onChange={setExpiresAt} />
          </div>
        )}
      </div>
    </div>
  );
};

export const BootstrapScreen: React.FC<{
  db: EmdadDbState;
  deviceRole: DeviceRole;
  onComplete: (nextDb: EmdadDbState) => void;
}> = ({ db, deviceRole, onComplete }) => {
  const [name, setName] = useState('المالك والمشرف العام');
  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!username.trim() || password.length < 6) {
      setErr('أدخل اسم مستخدم وكلمة مرور لا تقل عن 6 أحرف');
      return;
    }
    if (password !== confirmPwd) {
      setErr('كلمتا المرور غير متطابقتين');
      return;
    }
    setBusy(true);
    try {
      const derived = await PasswordHash.hash(password);
      const now = new Date().toISOString();
      const baseUser: User = {
        id: Ids.next('usr'),
        username: username.trim().toLowerCase(),
        name: name.trim() || 'المالك',
        email: `${username.trim().toLowerCase()}@imdad.local`,
        role: 'owner',
        roles: ['owner'],
        permissions: PERM_CATALOG.map((p) => p.key),
        warehouseScope: 'ALL',
        saltHex: derived.saltHex,
        hashHex: derived.hashHex,
        iterations: derived.iterations,
        active: true,
        approved: true,
        failedAttempts: 0,
        lockedUntil: null,
        sectionBlocked: [],
        ownerSig: '',
        createdAt: now,
        updatedAt: now,
      };
      baseUser.ownerSig = await OwnerSignature.signUserDecisions(baseUser);
      onComplete({
        ...db,
        users: [baseUser],
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSyncImportAccounts = async (file: File) => {
    setErr('');
    try {
      const raw = await file.text();
      const res = await smartMergeImportJson(db, raw, {
        id: 'bootstrap',
        username: 'bootstrap',
        name: 'Bootstrap',
        email: '',
        role: 'owner',
        roles: [],
        permissions: [],
        warehouseScope: 'ALL',
        saltHex: '',
        hashHex: '',
        iterations: 310000,
        active: true,
        approved: true,
        failedAttempts: 0,
        lockedUntil: null,
        sectionBlocked: [],
        ownerSig: '',
        createdAt: '',
        updatedAt: '',
      });
      if (res.nextState.users.length === 0) {
        setErr('ملف المزامنة المستورد لا يحتوي على أي حسابات مستخدمين');
        return;
      }
      onComplete(res.nextState);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'تعذّر استيراد حزمة المزامنة');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--imd-bg)', color: 'var(--imd-text)' }}
    >
      <div
        className="w-full max-w-2xl p-6 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] space-y-5 shadow-md"
        style={{ borderRadius: 'var(--imd-radius)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 flex items-center justify-center bg-[var(--imd-accent-soft)] text-[var(--imd-accent)]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          >
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold">التهيئة الأولية للحسابات (System Bootstrap)</h1>
            <p className="text-xs text-[var(--imd-muted)]">
              القاعدة خالية من المستخدمين · وضع الجهاز الحالي:{' '}
              {deviceRole === 'master' ? 'جهاز الإدارة الرئيسي (Master)' : 'جهاز الفرع (Branch)'}
            </p>
          </div>
        </div>

        {err && <ImdNote tone="danger">{err}</ImdNote>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <form onSubmit={handleCreateOwner} className="space-y-3 p-4 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
            <div className="text-xs font-bold text-[var(--imd-text)]">١. إنشاء حساب المدير/المالك الأول (Master)</div>
            <ImdFld label="الاسم الكامل والرتبة" value={name} onChange={setName} />
            <ImdFld label="اسم المستخدم" value={username} onChange={setUsername} />
            <ImdFld label="كلمة المرور (PBKDF2 310k)" type="password" value={password} onChange={setPassword} />
            <ImdFld label="تأكيد كلمة المرور" type="password" value={confirmPwd} onChange={setConfirmPwd} />
            <ImdButton type="submit" variant="primary" className="w-full" disabled={busy}>
              اعتماد حساب المالك والبدء
            </ImdButton>
          </form>

          <div className="space-y-3 p-4 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] flex flex-col justify-between" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--imd-text)]">
                <Upload className="w-4 h-4 text-[var(--imd-accent)]" />
                <span>٢. استقبال الحسابات بالمزامنة (Branch Sync)</span>
              </div>
              <p className="text-xs text-[var(--imd-muted)] leading-relaxed">
                لأجهزة الفروع الجديدة: استورد حزمة الترحيل أو المزامنة الموقّعة من الجهاز الرئيسي لتحميل المستخدمين والصلاحيات تلقائياً.
              </p>
            </div>
            <ImdDropZone
              accept=".json,.imdad"
              label="اسحب ملف المزامنة من الجهاز الرئيسي هنا"
              hint="SHA-256 + OwnerSignature Verified"
              onFile={handleSyncImportAccounts}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
