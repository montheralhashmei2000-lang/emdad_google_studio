/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Smartphone } from 'lucide-react';
import { EmdadProvider, useEmdad } from './data/EmdadProvider';
import { OwnerKey } from './core/security/ownerKey';
import { AuthService } from './core/security/authService';
import { useImdPlatform } from './core/ui/imdPlatform';
import { PWAInstallButton } from './components/imd/PwaControls';
import { LoginScreen, SpaceChooserScreen } from './features/auth/AuthScreens';
import {
  BootErrorScreen,
  BootstrapScreen,
  DeviceActivationBootScreen,
  KeyRecoveryBootScreen,
} from './features/auth/BootScreens';
import { HomeShell } from './features/home/HomeShell';

const ToastOverlay: React.FC = () => {
  const { toasts, dismissToast } = useEmdad();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-16 left-4 right-4 sm:right-auto z-[70] space-y-2 sm:max-w-sm no-print">
      {toasts.map((t) => {
        const bg =
          t.tone === 'success'
            ? 'var(--imd-success)'
            : t.tone === 'danger'
            ? 'var(--imd-danger)'
            : t.tone === 'warn'
            ? 'var(--imd-warn)'
            : 'var(--imd-text)';
        return (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            style={{ backgroundColor: bg, borderRadius: 'var(--imd-radius-sm)' }}
            className="text-white text-xs px-4 py-3 shadow-md cursor-pointer"
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
};

const RootRouter: React.FC = () => {
  const {
    db,
    currentUser,
    activeSpace,
    updateConfig,
    replaceDbState,
    activationStatus,
    refreshActivationStatus,
    keyRecoveryRequired,
    setKeyRecoveryRequired,
  } = useEmdad();

  const { metrics: platformMetrics } = useImdPlatform(db.config.highDensity);

  const renderScreen = () => {
    // 1. Release OwnerKey Guard
    if (import.meta.env.PROD && !OwnerKey.isConfigured()) {
      return (
        <BootErrorScreen message="حارس الإقلاع الأمني: المفتاح العام للمالك (OwnerKey.publicKey) غير مهيأ في إصدار الإنتاج." />
      );
    }

    // 2. KeyRecovery Screen before opening workspace if escrow/key recovery flagged
    if (keyRecoveryRequired) {
      return (
        <KeyRecoveryBootScreen
          reason="تم طلب استرداد مفاتيح التشفير أو اكتُشف تلف في مفتاح التوقيع المحلي."
          onRecovered={() => setKeyRecoveryRequired(false)}
        />
      );
    }

    // 3. Pre-Login Security Gate A: DeviceActivation / ActivationLock
    if (activationStatus && !activationStatus.valid) {
      return (
        <DeviceActivationBootScreen
          db={db}
          status={activationStatus}
          lockedMode={activationStatus.revoked || activationStatus.expired}
          onActivate={(token) => {
            updateConfig({ activationToken: token });
            void refreshActivationStatus();
          }}
        />
      );
    }

    // 4. Pre-Login Security Gate B: System Bootstrap when users table is empty
    if (AuthService.needsBootstrap(db.users)) {
      return (
        <BootstrapScreen
          db={db}
          deviceRole={activationStatus?.role ?? 'master'}
          onComplete={(nextDb) => {
            void replaceDbState(nextDb);
          }}
        />
      );
    }

    // 5. Auth & Workspace Shell
    if (!currentUser) {
      return <LoginScreen />;
    }
    if (!activeSpace) {
      return <SpaceChooserScreen />;
    }
    return <HomeShell />;
  };

  // Permanent 412×915 Android Smartphone Frame when previewing on a screen wider than 520px
  if (platformMetrics.isFramedAndroidPreview) {
    return (
      <div className="h-screen w-screen bg-[#111413] flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden select-none">
        <div className="w-full max-w-[420px] mb-2 px-3 py-1.5 bg-[#1B2220] border border-[#2C3734] text-[#E2ECE9] rounded-lg flex items-center justify-between text-xs select-text">
          <div className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="font-bold">جهاز المعاينة: هاتف (412×915)</span>
          </div>
          <PWAInstallButton variant="header" label="تثبيت التطبيق على الهاتف" />
        </div>

        {/* Android 412px Device Frame */}
        <div
          style={{
            width: '412px',
            height: `${platformMetrics.viewportHeight}px`,
            maxHeight: 'calc(100vh - 56px)',
          }}
          className="border-[6px] border-[#262B29] rounded-[24px] overflow-hidden shadow-2xl flex flex-col bg-[var(--imd-bg)] select-text relative"
        >
          {/* Android System Status Strip */}
          <div className="h-6 px-4 bg-[#0B3D3A] text-[#F0FDFA] text-[10px] font-mono-num flex items-center justify-between shrink-0">
            <span>Android APK · SQLCipher v31</span>
            <span>412×{platformMetrics.viewportHeight} · Offline</span>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col relative">{renderScreen()}</div>
        </div>
      </div>
    );
  }

  return <div className="h-screen w-screen overflow-hidden flex flex-col">{renderScreen()}</div>;
};

export default function App() {
  return (
    <EmdadProvider>
      <RootRouter />
      <ToastOverlay />
    </EmdadProvider>
  );
}
