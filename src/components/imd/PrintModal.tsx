// Print Preview Modal: Paper Size Selector (A4_P/A4_L/A5/58mm/80mm/112mm), VoucherCopy Selector, QR ESign & Auto-Archive Confirmation

import React, { useEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, Printer, ShieldCheck } from 'lucide-react';
import { useEmdad } from '../../data/EmdadProvider';
import { useImdPlatform } from '../../core/ui/imdPlatform';
import {
  buildPrintableHtmlAndArchive,
  PAPER_SIZE_LABELS,
  VOUCHER_COPY_OPTIONS,
} from '../../core/print/printEngine';
import type { PrintPaperSize, VoucherCopyType } from '../../domain/types';
import { ImdButton, ImdModal } from './primitives';

export const PrintModalHost: React.FC = () => {
  const { db, printPreview, closePrintPreview } = useEmdad();
  const { metrics } = useImdPlatform();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  const [paperSize, setPaperSize] = useState<PrintPaperSize>('A4_P');
  const [copyType, setCopyType] = useState<VoucherCopyType>('default');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [wrapWidth, setWrapWidth] = useState<number>(metrics.viewportWidth);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const measure = () => setWrapWidth(el.clientWidth || window.innerWidth);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [printPreview]);

  useEffect(() => {
    if (!printPreview) return;
    const defaultPaper: PrintPaperSize =
      printPreview.doc.paperSize ??
      (printPreview.doc.thermal ? 'THERMAL_80' : db.config.paperSize ?? 'A4_P');
    const isIssue = printPreview.doc.formKey === 'issue' || printPreview.doc.formKey === 'issues';
    const isTransfer =
      printPreview.doc.formKey === 'transfer' || printPreview.doc.formKey === 'transfers';
    const defaultCopy: VoucherCopyType =
      printPreview.doc.copyType ??
      (isIssue ? 'issue_order' : isTransfer ? 'transfer_source' : 'default');

    setPaperSize(defaultPaper);
    setCopyType(defaultCopy);
    setRenderedHtml(printPreview.html);
  }, [printPreview, db.config.paperSize]);

  useEffect(() => {
    if (!printPreview) return;
    let active = true;
    (async () => {
      const rebuilt = await buildPrintableHtmlAndArchive({
        doc: {
          ...printPreview.doc,
          paperSize,
          copyType,
          thermal: paperSize.startsWith('THERMAL_'),
        },
        config: { ...db.config, autoArchiveOnPrint: false },
      });
      if (active) setRenderedHtml(rebuilt.html);
    })();
    return () => {
      active = false;
    };
  }, [paperSize, copyType, printPreview, db.config]);

  if (!printPreview) return null;

  const isIssue = printPreview.doc.formKey === 'issue' || printPreview.doc.formKey === 'issues';
  const isTransfer =
    printPreview.doc.formKey === 'transfer' || printPreview.doc.formKey === 'transfers';
  const copyOptions = isIssue
    ? VOUCHER_COPY_OPTIONS.issue
    : isTransfer
    ? VOUCHER_COPY_OPTIONS.transfer
    : null;

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleDownloadHtml = () => {
    const html = renderedHtml || printPreview.html;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${printPreview.doc.refNo}_${paperSize}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const targetPagePx =
    paperSize === 'THERMAL_58'
      ? 240
      : paperSize === 'THERMAL_80'
      ? 320
      : paperSize === 'THERMAL_112'
      ? 430
      : paperSize === 'A5'
      ? 560
      : paperSize === 'A4_L'
      ? 1122
      : 794;

  const availWidth = Math.max(250, wrapWidth - 16);
  const scaleFactor =
    autoFit && availWidth < targetPagePx
      ? Math.max(0.38, Number((availWidth / targetPagePx).toFixed(3)))
      : 1;

  return (
    <ImdModal
      open={Boolean(printPreview)}
      onClose={closePrintPreview}
      title={`معاينة الطباعة الرسمية — ${printPreview.doc.refNo}`}
      widthClass="max-w-5xl"
      footer={
        <>
          <div className="flex-1 flex items-center gap-1.5 text-xs text-[var(--imd-success)]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>موقّع إلكترونياً بـ ECDSA P-256 ومؤرشف تلقائياً</span>
          </div>
          <ImdButton variant="secondary" onClick={handleDownloadHtml}>
            <Download className="w-4 h-4" />
            <span>تنزيل نسخة HTML</span>
          </ImdButton>
          <ImdButton variant="secondary" onClick={closePrintPreview}>
            إغلاق
          </ImdButton>
          <ImdButton variant="primary" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            <span>طباعة الآن</span>
          </ImdButton>
        </>
      }
    >
      <div className="space-y-3">
        {/* Print Controls Bar: Paper Size, Auto-Fit & Voucher Copies */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 p-2.5 border border-[var(--imd-line)] bg-[var(--imd-panel-fill)]"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--imd-text2)]">مقاس الورق:</span>
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PrintPaperSize)}
              className="h-8 px-2 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-field-fill)]"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              {(Object.entries(PAPER_SIZE_LABELS) as Array<[PrintPaperSize, string]>).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setAutoFit((v) => !v)}
              title="ملاءمة عرض ورقة A4 تلقائياً على شاشات الجوال"
              className="h-8 px-2.5 text-xs border border-[var(--imd-line-strong)] bg-[var(--imd-surface)] hover:border-[var(--imd-accent)] flex items-center gap-1 font-semibold text-[var(--imd-text)] cursor-pointer"
              style={{ borderRadius: 'var(--imd-radius-sm)' }}
            >
              {autoFit ? (
                <Minimize2 className="w-3.5 h-3.5 text-[var(--imd-accent)]" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span>{autoFit ? `ملاءمة تلقائية (${Math.round(scaleFactor * 100)}%)` : 'الحجم الفعلي 100%'}</span>
            </button>
          </div>

          {copyOptions && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--imd-text2)]">نسخة السند:</span>
              {copyOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCopyType(opt.value)}
                  className={`px-2.5 py-1 text-xs border cursor-pointer transition-colors ${
                    copyType === opt.value
                      ? 'border-[var(--imd-accent)] bg-[var(--imd-accent-soft)] text-[var(--imd-accent)] font-bold'
                      : 'border-[var(--imd-line)] bg-[var(--imd-surface)] text-[var(--imd-text2)]'
                  }`}
                  style={{ borderRadius: 'var(--imd-radius-sm)' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          ref={previewWrapRef}
          className="border border-[var(--imd-line-strong)] bg-zinc-700/80 overflow-auto flex justify-center p-2"
          style={{ borderRadius: 'var(--imd-radius-sm)' }}
        >
          <div
            className="bg-white shadow-xl origin-top transition-all"
            style={{
              width: `${targetPagePx}px`,
              zoom: scaleFactor < 1 ? scaleFactor : undefined,
            }}
          >
            <iframe
              ref={iframeRef}
              title="معاينة الطباعة"
              srcDoc={renderedHtml || printPreview.html}
              className="w-full h-[60vh] bg-white border-0"
            />
          </div>
        </div>
      </div>
    </ImdModal>
  );
};
