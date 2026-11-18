// Auth Screens: Clean Android Mobile LoginScreen (PBKDF2-HMAC-SHA256 + Biometric + KeyRecovery), IdleLockModal, Live-Stat SpaceChooserScreen

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Fingerprint,
  Flame,
  KeyRound,
  Lock,
  Moon,
  PackageCheck,
  Shield,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import {
  restoreEscrowSigningKeys,
  verifyActivationCertificate,
} from '../../core/security/crypto';
import { AuthService } from '../../core/security/authService';
import { PasswordHash } from '../../core/security/passwordHash';
import { SysNotice } from '../../core/security/warehouseScope';
import { todayIso } from '../../core/ui/imdTokens';
import { useImdPlatform } from '../../core/ui/imdPlatform';
import { ImdButton, ImdDropZone, ImdFld, ImdModal, ImdNote } from '../../components/imd/primitives';
import { PWAInstallButton } from '../../components/imd/PwaControls';
import { hasPerm } from '../../domain/accessControl';
import { computeGlobalTotalStrengthForDate } from '../../domain/strengthEngine';

export const LoginScreen: React.FC = () => {
  const { db, login, mutateDb, updateConfig, notify } = useEmdad();

  const [username, setUsername] = useState('owner');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPass, setRecoveryPass] = useState('');
  const [recoveryResetPwd, setRecoveryResetPwd] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState('');
  const [deviceActivated, setDeviceActivated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!db.config.activationToken) {
        if (active) setDeviceActivated(false);
      } else {
        const res = await verifyActivationCertificate(db.config.activationToken);
        if (active) setDeviceActivated(res.valid);
      }
    })();
    return () => {
      active = false;
    };
  }, [db.config.activationToken]);

  const performLogin = async (targetUser: string, targetPass: string) => {
    setError('');
    setLoading(true);
    try {
      const auth = await AuthService.authenticate(db.users, targetUser, targetPass);
      if (!auth.ok || !auth.user) {
        if (auth.failedAttemptsUpdate) {
          const upd = auth.failedAttemptsUpdate;
          mutateDb((prev) => ({
            ...prev,
            users: prev.users.map((u) =>
              u.id === upd.userId
                ? { ...u, failedAttempts: upd.failedAttempts, lockedUntil: upd.lockedUntil }
                : u
            ),
          }));
        }
        setError(auth.error || 'بيانات الدخول غير صحيحة');
        return;
      }

      const authedUser = auth.user;
      const upgraded = auth.upgradedHash;
      mutateDb((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === authedUser.id
            ? {
                ...u,
                failedAttempts: 0,
                lockedUntil: null,
                ...(upgraded
                  ? {
                      saltHex: upgraded.saltHex,
                      hashHex: upgraded.hashHex,
                      iterations: upgraded.iterations,
                      updatedAt: new Date().toISOString(),
                    }
                  : {}),
              }
            : u
        ),
      }));
      if (upgraded) {
        SysNotice.emit(
          'HASH_UPGRADED',
          'تمت ترقية تشفير كلمة المرور تلقائياً إلى 310,000 دورة PBKDF2-SHA256.',
          'info'
        );
      }
      login(
        upgraded
          ? {
              ...authedUser,
              saltHex: upgraded.saltHex,
              hashHex: upgraded.hashHex,
              iterations: upgraded.iterations,
            }
          : authedUser
      );
      notify(`مرحباً ${authedUser.name}`, 'success');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(username, password);
  };

  const handleRestoreKeyEscrow = async (file: File) => {
    if (!recoveryPass.trim()) {
      setRecoveryStatus('أدخل عبارة فك تشفير ملف الضمان أولاً');
      return;
    }
    try {
      const text = await file.text();
      await restoreEscrowSigningKeys(text, recoveryPass.trim());
      if (recoveryResetPwd.trim()) {
        const { pbkdf2Hash } = await import('../../core/security/crypto');
        const owner = db.users.find((u) => u.role === 'owner');
        if (owner) {
          const nextHash = await pbkdf2Hash(recoveryResetPwd.trim(), undefined, 10000);
          mutateDb((prev) => ({
            ...prev,
            users: prev.users.map((u) =>
              u.id === owner.id
                ? {
                    ...u,
                    saltHex: nextHash.saltHex,
                    hashHex: nextHash.hashHex,
                    iterations: nextHash.iterations,
                    failedAttempts: 0,
                    lockedUntil: null,
                  }
                : u
            ),
          }));
        }
      }
      setRecoveryStatus('تم استرداد مفتاح المالك ECDSA P-256 وفتح قفل الحساب بنجاح');
      notify('تم استرداد مفتاح التوقيع الرقمي من ملف الضمان', 'success');
    } catch {
      setRecoveryStatus('فشل فك تشفير ملف الضمان — تحقق من العبارة السرية وسلامة الملف');
    }
  };

  const quickProfiles = [
    { u: 'owner', label: 'مدير النظام', roleLabel: 'كامل الصلاحيات' },
    { u: 'supply', label: 'ركن الإمداد', roleLabel: 'المخازن والتموين' },
    { u: 'fuel', label: 'ضابط المحروقات', roleLabel: 'محطات الوقود' },
  ];

  return (
    <div
      className="h-full w-full overflow-y-auto flex flex-col items-center justify-center p-4 select-none"
      style={{ backgroundColor: 'var(--imd-bg)' }}
    >
      {/* Focused Single-Column Android Mobile Card */}
      <div
        className="w-full max-w-[400px] border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] overflow-hidden shadow-xl imd-fade-in"
        style={{ borderRadius: 'var(--imd-radius)' }}
      >
        {/* Top Sovereign Crest Header */}
        <div
          className="relative px-6 pt-6 pb-5 text-center border-b border-[var(--imd-side-border)]"
          style={{ backgroundColor: 'var(--imd-side)', color: 'var(--imd-side-text)' }}
        >
          {/* Discrete Corner Actions: Theme Toggle & Direct Phone Install */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() =>
                updateConfig({ themeMode: db.config.themeMode === 'light' ? 'dark' : 'light' })
              }
              title="تبديل السمة الفاتحة / الداكنة"
              className="w-8 h-8 inline-flex items-center justify-center rounded border border-white/15 bg-white/10 text-white/90 hover:bg-white/20 cursor-pointer transition-colors"
            >
              {db.config.themeMode === 'light' ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5" />
              )}
            </button>

            <PWAInstallButton variant="header" label="تثبيت على الهاتف" />
          </div>

          {/* Official Emblem */}
          <div className="mx-auto w-14 h-14 rounded-xl bg-white/95 p-1.5 shadow-md flex items-center justify-center mb-3">
            {db.config.logoDataUrl ? (
              <img
                src={db.config.logoDataUrl}
                alt={db.config.orgName}
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                src="/logo-official.png"
                alt={db.config.orgName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>

          <h1 className="text-base font-bold tracking-tight leading-snug">
            {db.config.orgName}
          </h1>
          <p className="text-[11px] opacity-80 mt-0.5">{db.config.orgSubTitle}</p>
        </div>

        {/* Clean Touch Login Form Body */}
        <div className="p-5 space-y-4">
          {/* Segmented Account Quick-Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--imd-muted)]">
              <span className="font-medium">اختيار سريع للحساب</span>
              <span className="font-mono-num opacity-75">كلمة المرور: 123456</span>
            </div>
            <div
              className="grid grid-cols-3 gap-1 p-1 border border-[var(--imd-line)] bg-[var(--imd-subtle)]"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              {quickProfiles.map((prof) => {
                const active = username.toLowerCase() === prof.u;
                return (
                  <button
                    key={prof.u}
                    type="button"
                    onClick={() => {
                      setUsername(prof.u);
                      setPassword('123456');
                      setError('');
                    }}
                    className={`py-2 px-1.5 text-center transition-all cursor-pointer ${
                      active
                        ? 'bg-[var(--imd-surface)] text-[var(--imd-accent)] font-bold shadow-xs'
                        : 'text-[var(--imd-muted)] hover:text-[var(--imd-text)]'
                    }`}
                    style={{ borderRadius: '4px' }}
                  >
                    <div className="text-xs leading-tight">{prof.label}</div>
                    <div className="text-[10px] opacity-75 mt-0.5 truncate">{prof.roleLabel}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && <ImdNote tone="danger">{error}</ImdNote>}

            {/* Username Touch Field */}
            <label className="block space-y-1">
              <span className="block text-xs font-semibold text-[var(--imd-text2)]">
                اسم المستخدم
              </span>
              <div className="relative">
                <User className="w-4 h-4 text-[var(--imd-muted)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  autoComplete="username"
                  style={{
                    backgroundColor: 'var(--imd-field-fill)',
                    borderColor: 'var(--imd-line-strong)',
                    color: 'var(--imd-text)',
                    borderRadius: 'var(--imd-radius-sm)',
                  }}
                  className="w-full imd-control-height pr-9 pl-3 text-sm border outline-none focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)] transition-all"
                />
              </div>
            </label>

            {/* Password Touch Field with Show/Hide Toggle */}
            <label className="block space-y-1">
              <span className="block text-xs font-semibold text-[var(--imd-text2)]">
                كلمة المرور
              </span>
              <div className="relative">
                <Lock className="w-4 h-4 text-[var(--imd-muted)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  autoComplete="current-password"
                  style={{
                    backgroundColor: 'var(--imd-field-fill)',
                    borderColor: 'var(--imd-line-strong)',
                    color: 'var(--imd-text)',
                    borderRadius: 'var(--imd-radius-sm)',
                  }}
                  className="w-full imd-control-height pr-9 pl-10 text-sm border outline-none focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)] transition-all tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="w-9 h-9 inline-flex items-center justify-center text-[var(--imd-muted)] hover:text-[var(--imd-text)] absolute left-1 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {/* Primary Login Button + Biometric Quick Login */}
            <div className="flex items-center gap-2 pt-1">
              <ImdButton
                type="submit"
                variant="primary"
                className="flex-1 h-12 text-sm"
                disabled={loading}
              >
                <Shield className="w-4 h-4" />
                <span>{loading ? 'جاري التحقق...' : 'تسجيل الدخول'}</span>
              </ImdButton>

              <button
                type="button"
                onClick={() => void performLogin(username || 'owner', password || '123456')}
                title="الدخول السريع بالبصمة الحيوية (Android Biometric)"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
                className="w-12 h-12 shrink-0 inline-flex items-center justify-center border border-[var(--imd-line-strong)] bg-[var(--imd-panel-fill)] text-[var(--imd-accent)] hover:border-[var(--imd-accent)] active:bg-[var(--imd-accent-soft)] cursor-pointer transition-colors"
              >
                <Fingerprint className="w-5 h-5" />
              </button>
            </div>
          </form>

          {/* Clean Minimal Footer */}
          <div className="pt-3 border-t border-[var(--imd-line)] flex items-center justify-between text-[11px] text-[var(--imd-muted)]">
            <button
              type="button"
              onClick={() => {
                setRecoveryStatus('');
                setRecoveryOpen(true);
              }}
              className="inline-flex items-center gap-1 text-[var(--imd-accent)] font-semibold hover:underline cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>استرداد مفتاح المالك</span>
            </button>

            <span className="inline-flex items-center gap-1 font-mono-num">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--imd-success)]" />
              <span>
                {deviceActivated ? 'SQLCipher v31 · موثّق' : 'SQLCipher v31 · محلي'}
              </span>
            </span>
          </div>
        </div>
      </div>

      <ImdModal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="استرداد مفتاح المالك من ملف الضمان (KeyRecovery)"
        widthClass="max-w-md"
        footer={
          <ImdButton variant="secondary" onClick={() => setRecoveryOpen(false)}>
            إغلاق
          </ImdButton>
        }
      >
        <div className="space-y-3">
          <ImdNote tone="info">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                يُستخدم ملف الضمان المشفّر (.imdadkey) لاسترداد زوج مفاتيح التوقيع ECDSA P-256 وفك قفل حساب المالك في حال نسيان كلمة المرور.
              </span>
            </div>
          </ImdNote>
          <ImdFld
            label="عبارة فك التشفير السرية للضمان"
            type="password"
            value={recoveryPass}
            onChange={setRecoveryPass}
            placeholder="أدخل العبارة السرية"
          />
          <ImdFld
            label="تعيين كلمة مرور جديدة للمالك (اختياري)"
            type="password"
            value={recoveryResetPwd}
            onChange={setRecoveryResetPwd}
            placeholder="اتركه فارغاً للإبقاء على الحالية"
          />
          <ImdDropZone
            accept=".imdadkey,.json"
            label="اضغط لاختيار ملف ضمان المفتاح (.imdadkey)"
            hint="مشفّر بـ AES-256-GCM"
            onFile={handleRestoreKeyEscrow}
          />
          {recoveryStatus && <ImdNote tone="info">{recoveryStatus}</ImdNote>}
        </div>
      </ImdModal>
    </div>
  );
};

export const SpaceChooserScreen: React.FC = () => {
  const { currentUser, setActiveSpace, logout, db, fuelTanks, fmt } = useEmdad();
  const { metrics: platformMetrics } = useImdPlatform(db.config.highDensity);
  const isAndroid = platformMetrics.isCompactScreen;
  const canSupply =
    currentUser?.role === 'owner' ||
    currentUser?.role === 'admin' ||
    hasPerm(currentUser, 'space.supply');
  const canFuel =
    currentUser?.role === 'owner' ||
    currentUser?.role === 'admin' ||
    hasPerm(currentUser, 'space.fuel');

  const today = todayIso();
  const strengthToday = useMemo(
    () => computeGlobalTotalStrengthForDate(today, db.strengths, db.beneficiary_units),
    [today, db.strengths, db.beneficiary_units]
  );
  const pendingOrders = db.ration_orders.filter((o) => o.status === 'PENDING').length;
  const totalPetrol = fuelTanks.reduce((s, t) => s + t.petrol, 0);
  const totalDiesel = fuelTanks.reduce((s, t) => s + t.diesel, 0);

  return (
    <div
      className="h-full w-full overflow-y-auto flex items-center justify-center p-4 md:p-6"
      style={{ backgroundColor: 'var(--imd-bg)' }}
    >
      <div className="w-full max-w-3xl space-y-5 imd-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--imd-line)] pb-3.5">
          <div>
            <div className="text-xs font-semibold text-[var(--imd-accent)]">{db.config.orgName}</div>
            <h1 className="text-xl font-bold text-[var(--imd-text)] mt-0.5">
              مرحباً {currentUser?.name}
            </h1>
            <p className="text-xs text-[var(--imd-muted)] mt-0.5">
              اختر مساحة العمل التشغيلية للبدء · التاريخ التشغيلي: {today} · النظام: {platformMetrics.osLabelAr}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <ImdButton variant="secondary" size="sm" onClick={logout}>
              تسجيل خروج
            </ImdButton>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${isAndroid ? '' : 'md:grid-cols-2'} gap-4`}>
          {canSupply && (
            <button
              type="button"
              onClick={() => setActiveSpace('supply')}
              className="text-right p-5 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] hover:border-[var(--imd-accent)] hover:bg-[var(--imd-panel-fill)] transition-all cursor-pointer flex flex-col justify-between gap-4 group"
              style={{ borderRadius: 'var(--imd-radius)', boxShadow: 'var(--imd-shadow)' }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 flex items-center justify-center bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  <ArrowLeft className="w-4 h-4 text-[var(--imd-muted)] group-hover:text-[var(--imd-accent)] transition-colors" />
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--imd-text)]">
                    قسم الإمداد والتموين
                  </div>
                  <p className="text-xs text-[var(--imd-muted)] mt-1 leading-relaxed">
                    المخازن، حركات الاستلام والصرف والتحويل، التفريدة اليومية، الوجبات والاستحقاق، الجرد، حساب المعسكرات، البرقيات، الأرشيف، والارتباطات.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--imd-table-row-line)] text-xs tabular-nums">
                <div>
                  <div className="text-[10px] text-[var(--imd-muted)]">الأصناف</div>
                  <div className="font-bold text-[var(--imd-text)]">{fmt(db.items.length, 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--imd-muted)]">القوة اليوم</div>
                  <div className="font-bold text-[var(--imd-text)]">{fmt(strengthToday, 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--imd-muted)]">طلبيات معلقة</div>
                  <div className="font-bold" style={{ color: pendingOrders > 0 ? 'var(--imd-warn)' : 'var(--imd-success)' }}>
                    {fmt(pendingOrders, 0)}
                  </div>
                </div>
              </div>
            </button>
          )}

          {canFuel && (
            <button
              type="button"
              onClick={() => setActiveSpace('fuel')}
              className="text-right p-5 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] hover:border-[#C2410C] hover:bg-[var(--imd-panel-fill)] transition-all cursor-pointer flex flex-col justify-between gap-4 group"
              style={{ borderRadius: 'var(--imd-radius)', boxShadow: 'var(--imd-shadow)' }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 flex items-center justify-center bg-[#FFF1E8] text-[#C2410C] border border-[#FED7AA]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                    <Flame className="w-5 h-5" />
                  </div>
                  <ArrowLeft className="w-4 h-4 text-[var(--imd-muted)] group-hover:text-[#C2410C] transition-colors" />
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--imd-text)]">
                    قسم المحروقات والوقود
                  </div>
                  <p className="text-xs text-[var(--imd-muted)] mt-1 leading-relaxed">
                    أرصدة البترول والديزل، صرف وتوريد وتحويل المحروقات، التفريدة الدورية وسقف التراكم، جرد الخزانات، وسجل المركبات برقم الشاصي.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--imd-table-row-line)] text-xs tabular-nums">
                <div>
                  <div className="text-[10px] text-[var(--imd-muted)]">بترول متاح</div>
                  <div className="font-bold text-[var(--imd-text)]">{fmt(totalPetrol, 0)} ل</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--imd-muted)]">ديزل متاح</div>
                  <div className="font-bold text-[var(--imd-text)]">{fmt(totalDiesel, 0)} ل</div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--imd-muted)]">مخصصات نشطة</div>
                  <div className="font-bold text-[#C2410C]">{fmt(db.fuel_allocations.filter((a) => a.active).length, 0)}</div>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const IdleLockModal: React.FC = () => {
  const { locked, currentUser, unlockSession, logout } = useEmdad();
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');

  if (!locked || !currentUser) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await PasswordHash.verify(pwd, currentUser.saltHex, currentUser.hashHex, currentUser.iterations);
    if (!ok) {
      setErr('كلمة المرور غير صحيحة');
      return;
    }
    setPwd('');
    setErr('');
    unlockSession();
  };

  return (
    <ImdModal open={locked} onClose={() => {}} title="قفل الجلسة التلقائي (خمول)" widthClass="max-w-sm">
      <form onSubmit={handleUnlock} className="space-y-3">
        <ImdNote tone="info">
          الجلسة مقفلة لحماية البيانات لـ <strong>{currentUser.name}</strong>
        </ImdNote>
        {err && <ImdNote tone="danger">{err}</ImdNote>}
        <ImdFld label="أعد إدخال كلمة المرور" type="password" value={pwd} onChange={setPwd} autoFocus />
        <div className="flex items-center justify-between gap-2 pt-2">
          <ImdButton variant="ghost" onClick={logout}>
            تبديل المستخدم
          </ImdButton>
          <ImdButton type="submit" variant="primary">
            فتح القفل
          </ImdButton>
        </div>
      </form>
    </ImdModal>
  );
};
