import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink, QrCode, Smartphone, WifiOff } from 'lucide-react';
import QRCode from 'qrcode';
import { ImdButton, ImdModal, ImdNote } from './primitives';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC<{
  compact?: boolean;
  variant?: 'primary' | 'secondary' | 'header';
  label?: string;
}> = ({ compact = false, variant = 'secondary', label }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const installUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    if (!showInstallModal || !installUrl) return;
    let active = true;
    QRCode.toDataURL(installUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#0B3D3A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        // ignore QR generation errors
      });
    return () => {
      active = false;
    };
  }, [showInstallModal, installUrl]);

  if (isInstalled) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowInstallModal(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback ignored
    }
  };

  const buttonText = label ?? (compact ? 'تثبيت' : 'تثبيت على الهاتف');

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          title="تثبيت التطبيق على الهاتف للعمل بدون إنترنت"
          className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded border border-emerald-400/40 bg-emerald-600/90 text-[11px] font-bold text-white hover:bg-emerald-500 cursor-pointer transition-colors shadow-xs"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{buttonText}</span>
        </button>
      ) : (
        <ImdButton
          size="sm"
          variant={variant === 'primary' ? 'primary' : 'secondary'}
          onClick={() => void handleInstallClick()}
          title="تثبيت التطبيق على الهاتف للعمل دون اتصال (Android APK / PWA)"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{buttonText}</span>
        </ImdButton>
      )}

      <ImdModal
        open={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        title="تثبيت تطبيق الإمداد والتموين على الهاتف"
        widthClass="max-w-sm"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <ImdButton variant="ghost" size="sm" onClick={() => setShowInstallModal(false)}>
              إغلاق
            </ImdButton>
            {isInstallable ? (
              <ImdButton
                variant="primary"
                size="sm"
                onClick={() => {
                  void install().then((ok) => {
                    if (ok) setShowInstallModal(false);
                  });
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>تثبيت مباشر الآن</span>
              </ImdButton>
            ) : (
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs font-bold bg-[var(--imd-accent)] text-[var(--imd-on-accent)] inline-flex items-center gap-1.5"
                style={{ borderRadius: 'var(--imd-radius-sm)' }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح نافذة التثبيت المباشر</span>
              </a>
            )}
          </div>
        }
      >
        <div className="space-y-3 text-xs text-[var(--imd-text2)] leading-relaxed">
          <ImdNote tone="info">
            يعمل النظام كتطبيق هاتف محلي بالكامل بدون إنترنت (Offline-First) مع حفظ مشفر للبيانات على جهازك.
          </ImdNote>

          {/* Direct Install / Breakout from Preview Iframe */}
          <div
            className="p-3 border border-[var(--imd-line-strong)] bg-[var(--imd-panel-fill)] space-y-2"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          >
            <div className="font-bold text-[var(--imd-text)] flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[var(--imd-accent)]" />
              <span>١. التثبيت الفوري على هذا الجهاز أو الهاتف</span>
            </div>

            {isInstallable ? (
              <ImdButton
                variant="primary"
                className="w-full"
                onClick={() => {
                  void install().then((ok) => {
                    if (ok) setShowInstallModal(false);
                  });
                }}
              >
                <Download className="w-4 h-4" />
                <span>تثبيت التطبيق على الهاتف الآن</span>
              </ImdButton>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--imd-muted)]">
                  لتفعيل نافذة التثبيت التلقائية في المتصفح خارج إطار المعاينة، افتح الرابط المباشر ثم اختر <strong>«تثبيت التطبيق»</strong>:
                </p>
                <div className="flex items-center gap-1.5">
                  <a
                    href={installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-h-[40px] px-3 py-2 text-xs font-bold bg-[var(--imd-accent)] text-[var(--imd-on-accent)] inline-flex items-center justify-center gap-1.5"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح رابط التثبيت المباشر</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl()}
                    className="min-h-[40px] px-2.5 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] text-[var(--imd-text)] inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                    style={{ borderRadius: 'var(--imd-radius-sm)' }}
                    title="نسخ رابط التطبيق لإرساله إلى الهاتف"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[var(--imd-success)]" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ الرابط</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* QR Code for scanning directly with Smartphone Camera */}
          {qrDataUrl && (
            <div
              className="p-3 border border-[var(--imd-line)] bg-[var(--imd-surface)] flex flex-col items-center text-center space-y-1.5"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              <div className="text-[11px] font-bold text-[var(--imd-text)] flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-[var(--imd-accent)]" />
                <span>٢. امسح رمز QR بكاميرا هاتفك لتثبيت التطبيق مباشرة</span>
              </div>
              <img
                src={qrDataUrl}
                alt="QR Code لتثبيت التطبيق على الهاتف"
                className="w-36 h-36 border border-[var(--imd-line)] p-1.5 bg-white rounded"
              />
              <span className="text-[10px] text-[var(--imd-muted)]">
                وجّه كاميرا هاتف الأندرويد إلى الرمز لفتح التطبيق وتثبيته على الشاشة الرئيسية
              </span>
            </div>
          )}

          {/* Step-by-step Mobile Browser Guide */}
          <div
            className="p-3 border border-[var(--imd-line)] bg-[var(--imd-subtle)] space-y-1.5 text-[11px]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          >
            <div className="font-bold text-[var(--imd-text)]">
              {isIOS
                ? 'خطوات التثبيت على الآيفون (Safari):'
                : 'خطوات التثبيت في متصفح الهاتف (Android Chrome):'}
            </div>
            {isIOS ? (
              <>
                <p>1. اضغط على زر <strong>المشاركة (Share)</strong> أسفل المتصفح.</p>
                <p>2. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</p>
              </>
            ) : (
              <>
                <p>1. افتح قائمة المتصفح العلوية <strong>(⋮)</strong> في Chrome على هاتفك.</p>
                <p>2. اضغط على <strong>«تثبيت التطبيق» (Install App)</strong> أو <strong>«الإضافة إلى الشاشة الرئيسية»</strong>.</p>
                <p>3. سيظهر تطبيق <strong>«الإمداد والتموين»</strong> بأيقونته الرسمية على شاشة هاتفك ويعمل بدون إنترنت.</p>
              </>
            )}
          </div>
        </div>
      </ImdModal>
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      className="no-print fixed bottom-16 lg:bottom-10 left-4 z-50 flex items-center gap-2 border border-[var(--imd-warn)] bg-[var(--imd-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--imd-warn)] shadow-md"
      style={{ borderRadius: 'var(--imd-radius-sm)' }}
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>وضع العمل المحلي (دون إنترنت) — البيانات محفوظة في IndexedDB</span>
    </div>
  );
};
