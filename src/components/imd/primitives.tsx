// Core ImdDesign System Primitives: ImdPage, ImdStickyActions, ImdPanel, ImdICard, ImdKpiCard, ImdFld, ImdSelect, ImdItemPicker, ImdUnitPicker, ImdBarcodeInput, ImdDropZone, ImdButton, ImdModal, ImdTabs, ImdNote, ImdStatusText, ImdBarcodeSvg

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpLeft, Barcode, Camera, ChevronLeft, Search, UploadCloud, X } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import { generateBarcodeBars } from '../../core/security/crypto';
import { normalizeDigits } from '../../core/ui/imdTokens';
import { getWarehouseItemStock } from '../../domain/stockLedger';
import type { Item } from '../../domain/types';

export const ImdPage: React.FC<{
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, breadcrumb, actions, children }) => {
  const { activeSpace } = useEmdad();
  const rootCrumb = activeSpace === 'fuel' ? 'قسم المحروقات والوقود' : 'قسم الإمداد والتموين';
  const crumbs = breadcrumb && breadcrumb.length > 0 ? breadcrumb : [rootCrumb, title];

  return (
    <div className="space-y-4 imd-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3.5 border-b border-[var(--imd-line)]">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--imd-muted)]">
            {crumbs.map((c, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronLeft className="w-3 h-3 opacity-60 shrink-0" />}
                <span className={idx === crumbs.length - 1 ? 'text-[var(--imd-accent)] font-semibold' : ''}>
                  {c}
                </span>
              </React.Fragment>
            ))}
          </div>
          <h1 className="text-lg md:text-[22px] font-bold tracking-tight text-[var(--imd-text)] leading-snug">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs md:text-[13px] text-[var(--imd-muted)] leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
};

export const ImdStickyActions: React.FC<{
  left?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ left, right }) => {
  return (
    <div
      className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)]"
      style={{
        borderRadius: 'var(--imd-radius-sm)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--imd-muted)]">{left}</div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">{right}</div>
    </div>
  );
};

export const ImdPanel: React.FC<{
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}> = ({ title, subtitle, icon, headerRight, children, className = '', padded = true }) => {
  const { db } = useEmdad();
  const dense = db.config.highDensity;
  return (
    <section
      className={`bg-[var(--imd-surface)] border border-[var(--imd-line)] transition-colors ${className}`}
      style={{
        borderRadius: 'var(--imd-radius)',
        boxShadow: 'var(--imd-shadow)',
      }}
    >
      {(title || headerRight) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-[var(--imd-line)] bg-[var(--imd-panel-fill)] ${
            dense ? 'px-3.5 py-2' : 'px-4 py-3'
          }`}
          style={{ borderTopLeftRadius: 'var(--imd-radius)', borderTopRightRadius: 'var(--imd-radius)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className="w-7 h-7 flex items-center justify-center shrink-0 bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] border border-[var(--imd-line)]" style={{ borderRadius: 'var(--imd-radius-sm)' }}>
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-sm font-bold text-[var(--imd-text)] truncate">{title}</h2>
              )}
              {subtitle && (
                <p className="text-[11px] text-[var(--imd-muted)] mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {headerRight && <div className="flex items-center gap-2 shrink-0">{headerRight}</div>}
        </div>
      )}
      <div className={padded ? (dense ? 'p-3.5' : 'p-4') : ''}>{children}</div>
    </section>
  );
};

export const ImdICard: React.FC<{
  title: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'accent' | 'danger' | 'success';
}> = ({ title, value, hint, tone = 'default' }) => {
  const colorMap = {
    default: 'var(--imd-text)',
    accent: 'var(--imd-accent)',
    danger: 'var(--imd-danger)',
    success: 'var(--imd-success)',
  };
  return (
    <div
      className="border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] p-3"
      style={{ borderRadius: 'var(--imd-radius-sm)' }}
    >
      <div className="text-[11px] font-medium text-[var(--imd-muted)]">{title}</div>
      <div className="text-base md:text-lg font-bold mt-1 tabular-nums" style={{ color: colorMap[tone] }}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-[var(--imd-muted)] mt-0.5">{hint}</div>}
    </div>
  );
};

export const ImdKpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warn' | 'danger' | 'info';
  onClick?: () => void;
}> = ({ label, value, meta, icon, tone = 'accent', onClick }) => {
  const toneColor: Record<string, { text: string; bg: string }> = {
    default: { text: 'var(--imd-text)', bg: 'var(--imd-subtle)' },
    accent: { text: 'var(--imd-accent)', bg: 'var(--imd-accent-soft)' },
    success: { text: 'var(--imd-success)', bg: 'var(--imd-success-soft)' },
    warn: { text: 'var(--imd-warn)', bg: 'var(--imd-warn-soft)' },
    danger: { text: 'var(--imd-danger)', bg: 'var(--imd-danger-soft)' },
    info: { text: 'var(--imd-info)', bg: 'var(--imd-info-soft)' },
  };
  const pal = toneColor[tone] ?? toneColor.accent;
  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`text-right w-full border border-[var(--imd-line)] bg-[var(--imd-surface)] p-4 transition-colors ${
        onClick ? 'cursor-pointer hover:border-[var(--imd-accent)] hover:bg-[var(--imd-panel-fill)] group' : ''
      }`}
      style={{ borderRadius: 'var(--imd-radius)', boxShadow: 'var(--imd-shadow)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-[var(--imd-muted)] leading-snug">{label}</span>
        {icon && (
          <span
            className="w-8 h-8 flex items-center justify-center shrink-0"
            style={{ backgroundColor: pal.bg, color: pal.text, borderRadius: 'var(--imd-radius-sm)' }}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className="text-2xl font-bold mt-2 tabular-nums tracking-tight leading-none"
        style={{ color: tone === 'default' ? 'var(--imd-text)' : pal.text }}
      >
        {value}
      </div>
      {(meta || onClick) && (
        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-[var(--imd-table-row-line)] text-[11px] text-[var(--imd-muted)]">
          <span className="truncate">{meta}</span>
          {onClick && (
            <ArrowUpLeft className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100 group-hover:text-[var(--imd-accent)] transition-opacity" />
          )}
        </div>
      )}
    </Comp>
  );
};

export const ImdButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'orange' | 'danger' | 'ghost';
    size?: 'sm' | 'md';
  }
> = ({ variant = 'secondary', size = 'md', className = '', style, children, ...rest }) => {
  const { db } = useEmdad();
  const dense = db.config.highDensity;
  const heightCls =
    size === 'sm'
      ? 'min-h-[30px] px-2.5 py-1 text-xs'
      : dense
      ? 'imd-control-height px-3 text-xs'
      : 'imd-control-height px-3.5 text-xs md:text-[13px]';

  const styleMap: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--imd-accent)',
      color: 'var(--imd-on-accent)',
      borderColor: 'var(--imd-accent)',
    },
    orange: {
      backgroundColor: '#F39C12',
      color: '#2B1A00',
      borderColor: '#E08E0B',
    },
    danger: {
      backgroundColor: 'var(--imd-danger)',
      color: '#FFFFFF',
      borderColor: 'var(--imd-danger)',
    },
    secondary: {
      backgroundColor: 'var(--imd-surface)',
      color: 'var(--imd-text)',
      borderColor: 'var(--imd-line-strong)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--imd-text2)',
      borderColor: 'transparent',
    },
  };

  return (
    <button
      type="button"
      {...rest}
      style={{ ...styleMap[variant], borderRadius: 'var(--imd-radius-sm)', ...style }}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold border transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95 ${heightCls} ${className}`}
    >
      {children}
    </button>
  );
};

export const ImdFld: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    label?: string;
    value: string | number;
    onChange: (val: string) => void;
    hint?: string;
  }
> = ({ label, value, onChange, hint, className = '', type = 'text', ...rest }) => {
  const { db } = useEmdad();
  const dense = db.config.highDensity;
  return (
    <label className={`block space-y-1 ${className}`}>
      {label && (
        <span className="block text-xs font-medium text-[var(--imd-text2)]">{label}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(type === 'number' ? normalizeDigits(raw) : raw);
        }}
        {...rest}
        style={{
          backgroundColor: 'var(--imd-field-fill)',
          borderColor: 'var(--imd-line-strong)',
          color: 'var(--imd-text)',
          borderRadius: 'var(--imd-radius-sm)',
        }}
        className={`w-full border px-2.5 transition-all tabular-nums focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)] outline-none imd-control-height ${
          dense ? 'text-xs' : 'text-sm'
        } disabled:opacity-60`}
      />
      {hint && <span className="block text-[11px] text-[var(--imd-muted)]">{hint}</span>}
    </label>
  );
};

export const ImdSelect: React.FC<{
  label?: string;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
}> = ({ label, value, onChange, options, className = '', disabled, searchable }) => {
  const { db } = useEmdad();
  const dense = db.config.highDensity;
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!searchable || !filter.trim()) return options;
    const q = filter.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, searchable, filter]);

  return (
    <div className={`block space-y-1 ${className}`}>
      {label && (
        <span className="block text-xs font-medium text-[var(--imd-text2)]">{label}</span>
      )}
      {searchable && options.length > 6 && (
        <div className="relative">
          <Search className="w-3 h-3 text-[var(--imd-muted)] absolute right-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="تصفية سريعة..."
            className="w-full h-7 pr-6 pl-2 text-[11px] border border-[var(--imd-line)] bg-[var(--imd-panel-fill)] mb-1 outline-none focus:border-[var(--imd-accent)]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          />
        </div>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: 'var(--imd-field-fill)',
          borderColor: 'var(--imd-line-strong)',
          color: 'var(--imd-text)',
          borderRadius: 'var(--imd-radius-sm)',
        }}
        className={`w-full border px-2.5 transition-all focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)] outline-none imd-control-height ${
          dense ? 'text-xs' : 'text-sm'
        }`}
      >
        {filtered.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// Smart Item Picker searching by code, name, or barcode + live warehouse stock indicator
export const ImdItemPicker: React.FC<{
  label?: string;
  value: string;
  onChange: (itemId: string) => void;
  warehouse?: string;
  items?: Item[];
  className?: string;
}> = ({ label = 'الصنف', value, onChange, warehouse, items, className = '' }) => {
  const { db, ledger, fmt } = useEmdad();
  const list = items ?? db.items;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalizeDigits(query).trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q)
    );
  }, [list, query]);

  const selected = list.find((i) => i.id === value);
  const stock = warehouse && selected ? getWarehouseItemStock(ledger, warehouse, selected.id) : null;

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--imd-text2)]">{label}</span>
        {stock !== null && selected && (
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: stock > 0 ? 'var(--imd-accent)' : 'var(--imd-danger)' }}
          >
            المتاح: {fmt(stock)} {selected.baseUnit}
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            const exact = list.find((i) => i.barcode === val.trim() || i.code === val.trim());
            if (exact) onChange(exact.id);
          }}
          placeholder="كود/باركود"
          className="col-span-2 imd-control-height px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] outline-none focus:border-[var(--imd-accent)]"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="col-span-3 imd-control-height px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] outline-none focus:border-[var(--imd-accent)]"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        >
          {filtered.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} — {i.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

// Unit Picker with automatic factor & baseQty calculation badge
export const ImdUnitPicker: React.FC<{
  item?: Item;
  unitName: string;
  onChange: (unitName: string, factor: number) => void;
  qty?: number;
  label?: string;
}> = ({ item, unitName, onChange, qty, label = 'الوحدة' }) => {
  const { fmt } = useEmdad();
  const units = item?.units ?? [];
  const selected = units.find((u) => u.name === unitName) ?? units[0];
  const factor = selected?.factor ?? 1;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--imd-text2)]">{label}</span>
        {typeof qty === 'number' && item && (
          <span className="text-[11px] text-[var(--imd-muted)] tabular-nums">
            = {fmt(qty * factor)} {item.baseUnit}
          </span>
        )}
      </div>
      <select
        value={unitName}
        onChange={(e) => {
          const u = units.find((x) => x.name === e.target.value);
          onChange(e.target.value, u?.factor ?? 1);
        }}
        className="w-full imd-control-height px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] outline-none focus:border-[var(--imd-accent)]"
        style={{ borderRadius: 'var(--imd-radius-sm)' }}
      >
        {units.map((u) => (
          <option key={u.name} value={u.name}>
            {u.name} (×{u.factor})
          </option>
        ))}
      </select>
    </div>
  );
};

// Barcode Scanner Input (supports USB/Bluetooth scanner Enter suffix + Android/Web Camera BarcodeDetector)
export const ImdBarcodeInput: React.FC<{
  label?: string;
  onScan: (code: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ label = 'قارئ الباركود', onScan, placeholder = 'امسح الباركود أو اكتب الكود ثم Enter...', className = '' }) => {
  const { db } = useEmdad();
  const [val, setVal] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!cameraOpen) return;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('الكاميرا غير متاحة في هذه البيئة — يمكنك اختيار باركود الصنف مباشرة أدناه.');
        return;
      }
      try {
        setCameraStatus('جارٍ تشغيل الكاميرا الخلفية...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts?: { formats?: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setCameraStatus('الكاميرا نشطة — وجّه نحو الباركود أو اختر الصنف مباشرة من القائمة السريعة.');
          return;
        }

        const detector = new BarcodeDetectorCtor({
          formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'code_39', 'upc_a'],
        });
        setCameraStatus('وجّه الكاميرا نحو الباركود للمسح التلقائي...');

        const scanLoop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (videoRef.current.readyState >= 2) {
              const codes = await detector.detect(videoRef.current);
              const hit = codes.find((c) => c.rawValue && c.rawValue.trim().length > 0);
              if (hit?.rawValue) {
                const cleaned = normalizeDigits(hit.rawValue.trim());
                onScan(cleaned);
                setCameraOpen(false);
                return;
              }
            }
          } catch {
            // ignore transient frame error
          }
          rafId = window.requestAnimationFrame(() => {
            void scanLoop();
          });
        };
        rafId = window.requestAnimationFrame(() => {
          void scanLoop();
        });
      } catch {
        setCameraStatus('تعذر الوصول إلى الكاميرا — استخدم الإدخال السريع أو اختر من القائمة أدناه.');
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOpen, onScan]);

  return (
    <div className={`space-y-1 ${className}`}>
      <span className="block text-xs font-medium text-[var(--imd-text2)]">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Barcode className="w-4 h-4 text-[var(--imd-muted)] absolute right-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={val}
            onChange={(e) => setVal(normalizeDigits(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && val.trim()) {
                e.preventDefault();
                onScan(val.trim());
                setVal('');
              }
            }}
            placeholder={placeholder}
            className="w-full imd-control-height pr-8 pl-2.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)] font-mono-num outline-none focus:border-[var(--imd-accent)]"
            style={{ borderRadius: 'var(--imd-radius-sm)' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          title="مسح الباركود بالكاميرا (Android / USB)"
          className="imd-control-height px-2.5 border border-[var(--imd-line-strong)] bg-[var(--imd-surface2)] hover:border-[var(--imd-accent)] text-[var(--imd-text)] flex items-center gap-1 text-xs font-semibold shrink-0"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        >
          <Camera className="w-3.5 h-3.5 text-[var(--imd-accent)]" />
          <span className="hidden sm:inline">كاميرا</span>
        </button>
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <div
            className="w-full max-w-md border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] p-3.5 space-y-3 shadow-2xl"
            style={{ borderRadius: 'var(--imd-radius)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--imd-line)] pb-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[var(--imd-accent)]" />
                <span className="text-xs font-bold text-[var(--imd-text)]">
                  ماسح الباركود بالكاميرا (Code-128 / EAN-13 / QR)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className="p-1 text-[var(--imd-muted)] hover:text-[var(--imd-danger)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative bg-black rounded overflow-hidden aspect-video flex items-center justify-center border border-[var(--imd-line)]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="pointer-events-none absolute inset-6 border-2 border-emerald-400/80 rounded flex items-center justify-center">
                <div className="w-full h-0.5 bg-emerald-400/90 animate-pulse" />
              </div>
            </div>

            <div className="text-[11px] text-[var(--imd-muted)] text-center">{cameraStatus}</div>

            <div className="space-y-1.5 pt-1 border-t border-[var(--imd-line)]">
              <div className="text-[11px] font-semibold text-[var(--imd-text2)]">
                اختيار سريع من باركودات الأصناف المسجلة:
              </div>
              <div className="max-h-36 overflow-y-auto grid grid-cols-1 gap-1">
                {db.items.slice(0, 12).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onScan(item.barcode || item.code);
                      setCameraOpen(false);
                    }}
                    className="flex items-center justify-between px-2.5 py-1.5 text-right text-xs border border-[var(--imd-line)] bg-[var(--imd-surface2)] hover:border-[var(--imd-accent)] rounded"
                  >
                    <span className="font-semibold text-[var(--imd-text)] truncate">{item.name}</span>
                    <span className="font-mono-num text-[11px] text-[var(--imd-accent)] shrink-0">
                      {item.barcode || item.code}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Android Touch File Picker (.xlsx, .json, .imdbk, .pdf) — replaces desktop drag-and-drop with mobile file_picker
export const ImdDropZone: React.FC<{
  accept: string;
  label: string;
  hint?: string;
  onFile: (file: File) => void;
}> = ({ accept, label, hint, onFile }) => {
  return (
    <label
      className="min-h-[72px] flex flex-col items-center justify-center gap-1.5 p-4 border-2 border-dashed border-[var(--imd-line-strong)] bg-[var(--imd-panel-fill)] active:bg-[var(--imd-accent-soft)] active:border-[var(--imd-accent)] hover:border-[var(--imd-accent)] cursor-pointer transition-colors text-center select-none"
      style={{ borderRadius: 'var(--imd-radius-sm)' }}
    >
      <UploadCloud className="w-5 h-5 text-[var(--imd-accent)]" />
      <span className="text-xs font-semibold text-[var(--imd-text)]">{label}</span>
      {hint && <span className="text-[11px] text-[var(--imd-muted)]">{hint}</span>}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
};

export const ImdFilePicker = ImdDropZone;

export const ImdTabs: React.FC<{
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => {
  const { fmt } = useEmdad();
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto p-1 border border-[var(--imd-line)] bg-[var(--imd-toolbar-fill)]"
      style={{ borderRadius: 'var(--imd-radius-sm)' }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              backgroundColor: isActive ? 'var(--imd-surface)' : 'transparent',
              color: isActive ? 'var(--imd-accent)' : 'var(--imd-muted)',
              borderColor: isActive ? 'var(--imd-line-strong)' : 'transparent',
              borderRadius: 'var(--imd-radius-sm)',
              boxShadow: isActive ? 'var(--imd-shadow)' : 'none',
            }}
            className={`px-3 py-1.5 text-xs md:text-[13px] font-medium border whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              isActive ? 'font-bold' : 'hover:text-[var(--imd-text)] hover:bg-[var(--imd-hover)]'
            }`}
          >
            <span>{t.label}</span>
            {typeof t.count === 'number' && (
              <span className="mr-1.5 text-[11px] opacity-75 tabular-nums">
                ({fmt(t.count, 0)})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const ImdNote: React.FC<{
  title?: string;
  children: React.ReactNode;
  tone?: 'note' | 'danger' | 'info' | 'success';
}> = ({ title, children, tone = 'note' }) => {
  const styles: Record<string, React.CSSProperties> = {
    note: {
      backgroundColor: 'var(--imd-note-bg)',
      borderColor: 'var(--imd-note-border)',
      color: 'var(--imd-note-text)',
    },
    danger: {
      backgroundColor: 'var(--imd-danger-soft)',
      borderColor: 'var(--imd-danger)',
      color: 'var(--imd-danger)',
    },
    info: {
      backgroundColor: 'var(--imd-info-soft)',
      borderColor: 'var(--imd-info)',
      color: 'var(--imd-info)',
    },
    success: {
      backgroundColor: 'var(--imd-success-soft)',
      borderColor: 'var(--imd-success)',
      color: 'var(--imd-success)',
    },
  };
  return (
    <div
      style={{ ...styles[tone], borderRadius: 'var(--imd-radius-sm)' }}
      className="border px-3.5 py-2.5 text-xs md:text-[13px] leading-relaxed"
    >
      {title && <div className="font-bold mb-0.5">{title}</div>}
      <div>{children}</div>
    </div>
  );
};

// Zero-pill semantic status display (clean text, never boxed capsule)
export const ImdStatusText: React.FC<{
  label: string;
  tone?: 'success' | 'danger' | 'warn' | 'info' | 'muted';
}> = ({ label, tone = 'muted' }) => {
  const colorMap = {
    success: 'var(--imd-success)',
    danger: 'var(--imd-danger)',
    warn: 'var(--imd-warn)',
    info: 'var(--imd-info)',
    muted: 'var(--imd-muted)',
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap"
      style={{ color: colorMap[tone] }}
    >
      <span>{label}</span>
    </span>
  );
};

export const ImdModal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  widthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, onClose, title, widthClass = 'max-w-2xl', children, footer }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClass} max-h-[92vh] sm:max-h-[90vh] flex flex-col border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] text-[var(--imd-text)] imd-fade-in shadow-xl`}
        style={{ borderRadius: 'var(--imd-radius)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--imd-line)] bg-[var(--imd-panel-fill)]">
          <h3 className="text-sm md:text-base font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 text-[var(--imd-muted)] hover:text-[var(--imd-text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-[var(--imd-line)] flex items-center justify-end gap-2 bg-[var(--imd-panel-fill)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const ImdBarcodeSvg: React.FC<{ code: string; label?: string }> = ({ code, label }) => {
  const bars = generateBarcodeBars(code || '000000');
  let x = 8;
  const rects: Array<{ x: number; w: number }> = [];
  bars.forEach((w, idx) => {
    if (idx % 2 === 0) {
      rects.push({ x, w: w * 2 });
    }
    x += w * 2;
  });
  const totalWidth = x + 8;
  return (
    <div className="inline-flex flex-col items-center bg-white text-black p-2 border border-neutral-300">
      {label && <div className="text-[10px] font-bold mb-1 text-center">{label}</div>}
      <svg width={totalWidth} height={42} viewBox={`0 0 ${totalWidth} 42`}>
        <rect x="0" y="0" width={totalWidth} height="42" fill="#FFFFFF" />
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={2} width={r.w} height={36} fill="#000000" />
        ))}
      </svg>
      <div className="font-mono text-[10px] tracking-widest mt-0.5">{code}</div>
    </div>
  );
};

// Phase 1 Canonical Shared UI Primitives & Aliases (lib/core/ui/ parity)

export const ImdStickyPage = ImdPage;

export const ImdPageTitle: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--imd-line)]">
    <div>
      <h1 className="text-base md:text-lg font-bold text-[var(--imd-text)]">{title}</h1>
      {subtitle && <p className="text-xs text-[var(--imd-muted)] mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

export const ImdGrid: React.FC<{
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}> = ({ cols = 3, children, className = '' }) => {
  const gridCls =
    cols === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : cols === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  return <div className={`grid ${gridCls} gap-3 ${className}`}>{children}</div>;
};

export const ImdGrid2: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${className}`}>{children}</div>
);

export const ImdTabsShell: React.FC<{
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
  children: React.ReactNode;
}> = ({ tabs, active, onChange, children }) => (
  <div className="space-y-3">
    <ImdTabs tabs={tabs} active={active} onChange={onChange} />
    <div>{children}</div>
  </div>
);

export const ImdIconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: React.ReactNode;
    label?: string;
  }
> = ({ icon, label, className = '', ...rest }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    {...rest}
    style={{ borderRadius: 'var(--imd-radius-sm)' }}
    className={`inline-flex items-center justify-center w-8 h-8 border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] text-[var(--imd-text2)] hover:text-[var(--imd-accent)] hover:border-[var(--imd-accent)] transition-colors cursor-pointer ${className}`}
  >
    {icon}
  </button>
);

// Zero-pill compliant semantic text indicator (never boxed pill/capsule)
export const ImdChip = ImdStatusText;

export const ImdCheckbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--imd-text)] cursor-pointer select-none">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-[var(--imd-accent)] cursor-pointer"
    />
    <span>{label}</span>
  </label>
);

export const ImdSearchBar: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'بحث سريع...', className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="w-3.5 h-3.5 text-[var(--imd-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        backgroundColor: 'var(--imd-field-fill)',
        borderColor: 'var(--imd-line-strong)',
        color: 'var(--imd-text)',
        borderRadius: 'var(--imd-radius-sm)',
      }}
      className="w-full imd-control-height pr-8 pl-2.5 text-xs border outline-none focus:border-[var(--imd-accent)] focus:ring-2 focus:ring-[var(--imd-ring)]"
    />
  </div>
);

export const ImdTypeAhead: React.FC<{
  label?: string;
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder?: string;
}> = ({ label, value, onChange, suggestions, placeholder }) => {
  const listId = useMemo(() => `imd-ta-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="space-y-1">
      {label && <span className="block text-xs font-medium text-[var(--imd-text2)]">{label}</span>}
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          backgroundColor: 'var(--imd-field-fill)',
          borderColor: 'var(--imd-line-strong)',
          color: 'var(--imd-text)',
          borderRadius: 'var(--imd-radius-sm)',
        }}
        className="w-full imd-control-height px-2.5 text-xs border outline-none focus:border-[var(--imd-accent)]"
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
};

