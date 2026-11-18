// Official Print Engine: A4/A5/Thermal (58mm/80mm/112mm), VoucherCopy copies, SignerPositions with {المستودع}, QR ECDSA & Auto-Archive

import QRCode from 'qrcode';
import type {
  AppSpace,
  ArchiveFile,
  PrintFormConfig,
  PrintPaperSize,
  SignerPositionEntry,
  SystemConfig,
  VoucherCopyType,
} from '../../domain/types';
import { Ids, sha256Hex, signDocumentPayload } from '../security/crypto';
import { renderCode128SvgHtml } from './barcode128';
import { fmtDate, nfPrint } from '../ui/imdFormat';

export interface PrintableDocument {
  formKey: string;
  space: AppSpace;
  title: string;
  refNo: string;
  date: string;
  warehouse: string;
  partyLabel: string;
  partyValue: string;
  receiverName?: string;
  notes?: string;
  opType: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  totalQty: number;
  actorName: string;
  thermal?: boolean;
  paperSize?: PrintPaperSize;
  copyType?: VoucherCopyType;
}

export const PAPER_SIZE_LABELS: Record<PrintPaperSize, string> = {
  A4_P: 'A4 رسمي (عمودي)',
  A4_L: 'A4 رسمي (أفقي)',
  A5: 'A5 نصفي',
  THERMAL_58: 'حراري 58 مم',
  THERMAL_80: 'حراري 80 مم',
  THERMAL_112: 'حراري 112 مم',
};

export const VOUCHER_COPY_OPTIONS: Record<'issue' | 'transfer', Array<{ value: VoucherCopyType; label: string }>> = {
  issue: [
    { value: 'issue_order', label: 'أمر صرف (نسخة المستودع)' },
    { value: 'issue_receipt', label: 'إشعار استلام (يوقّعه المستلم)' },
    { value: 'issue_recipient', label: 'نسخة المستلم (الجهة المستفيدة)' },
  ],
  transfer: [
    { value: 'transfer_source', label: 'نسخة المستودع المحوِّل' },
    { value: 'transfer_dest', label: 'نسخة المستودع المستلم' },
    { value: 'transfer_driver', label: 'نسخة السائق / المندوب' },
  ],
};

export const DEFAULT_SIGNER_POSITIONS: SignerPositionEntry[] = [
  { id: 'sp_1', roleKey: 'supply_officer', roleLabel: 'ركن الإمداد', warehouse: '*', personName: 'الرائد / خالد الحارثي', rank: 'رائد' },
  { id: 'sp_2', roleKey: 'store_manager', roleLabel: 'مدير المخزن ({المستودع})', warehouse: '*', personName: 'أمين مخزن {المستودع}', rank: 'رقيب أول' },
  { id: 'sp_3', roleKey: 'approver', roleLabel: 'المصادقة والاعتماد', warehouse: '*', personName: 'العقيد / منصور الهاشمي', rank: 'عقيد' },
  { id: 'sp_4', roleKey: 'fuel_officer', roleLabel: 'مسؤول المحروقات', warehouse: '*', personName: 'النقيب / سالم العولقي', rank: 'نقيب' },
  { id: 'sp_5', roleKey: 'audit', roleLabel: 'المراجعة والتدقيق', warehouse: '*', personName: 'مراجع الشعبة', rank: 'ملازم أول' },
  { id: 'sp_6', roleKey: 'inspection', roleLabel: 'الرقابة والتفتيش', warehouse: '*', personName: 'لجنة التفتيش', rank: 'ضابط رقابة' },
];

export const DEFAULT_PRINT_FORM: PrintFormConfig = {
  id: 'default',
  name: 'النموذج الرسمي القياسي',
  rightLines: [
    'الجمهورية / القيادة العسكرية العليا',
    'شعبة الإمداد والتموين والمحروقات',
    'إدارة المخازن والحركة الميدانية',
  ],
  leftFields: [
    { label: 'التاريخ', key: 'date' },
    { label: 'رقم السند', key: 'refNo' },
    { label: 'المستودع', key: 'warehouse' },
  ],
  tableAlign: 'center',
  fontSize: 12,
  fontFamily: 'Amiri',
  showAuthBox: true,
  showQr: true,
  footerRoles: ['أمين المستودع ({المستودع})', 'المستلم / المندوب', 'الاعتماد والتصديق'],
  footerNames: ['', '', ''],
  showLogo: true,
};

function resolvePlaceholders(text: string, doc: PrintableDocument): string {
  return text
    .replaceAll('{المستودع}', doc.warehouse || 'المستودع')
    .replaceAll('{التاريخ}', doc.date)
    .replaceAll('{المرجع}', doc.refNo);
}

function resolveCopyMeta(doc: PrintableDocument, form: PrintFormConfig, signers: SignerPositionEntry[]): {
  copyBanner: string;
  roles: [string, string, string];
  names: [string, string, string];
  ackText: string;
} {
  const findSigner = (key: string) =>
    signers.find((s) => s.roleKey === key && s.warehouse === doc.warehouse) ??
    signers.find((s) => s.roleKey === key && s.warehouse === '*');

  const storeMgr = findSigner('store_manager');
  const approver = findSigner('approver');
  const supplyOff = findSigner('supply_officer');

  const copy = doc.copyType ?? 'default';
  if (copy === 'issue_order') {
    return {
      copyBanner: 'أمر صرف — نسخة المستودع',
      roles: [
        resolvePlaceholders(storeMgr?.roleLabel || 'مدير المخزن ({المستودع})', doc),
        supplyOff?.roleLabel || 'ركن الإمداد',
        approver?.roleLabel || 'المصادقة والاعتماد',
      ],
      names: [
        resolvePlaceholders(storeMgr?.personName || '', doc),
        supplyOff?.personName || '',
        approver?.personName || '',
      ],
      ackText: '',
    };
  }
  if (copy === 'issue_receipt') {
    return {
      copyBanner: 'إشعار استلام — إقرار المستلم',
      roles: [
        'اسم المستلم وتوقيعه',
        resolvePlaceholders(storeMgr?.roleLabel || 'أمين المستودع المسلم', doc),
        'المراجعة والتدقيق',
      ],
      names: [
        doc.receiverName || doc.partyValue || '',
        resolvePlaceholders(storeMgr?.personName || '', doc),
        findSigner('audit')?.personName || '',
      ],
      ackText: `أقر أنا الموقع أدناه (${doc.receiverName || doc.partyValue}) باستلام المواد الموضحة أعلاه كاملة وسليمة من ${doc.warehouse}.`,
    };
  }
  if (copy === 'issue_recipient') {
    return {
      copyBanner: 'نسخة المستلم — الجهة المستفيدة',
      roles: ['مندوب الجهة المستلمة', resolvePlaceholders(storeMgr?.roleLabel || 'أمين المستودع', doc), 'ركن الإمداد'],
      names: [doc.receiverName || '', resolvePlaceholders(storeMgr?.personName || '', doc), supplyOff?.personName || ''],
      ackText: '',
    };
  }
  if (copy === 'transfer_source') {
    return {
      copyBanner: 'نسخة المستودع المحوِّل',
      roles: [resolvePlaceholders('أمين {المستودع} (المصدر)', doc), 'السائق / المندوب', approver?.roleLabel || 'المصادقة'],
      names: [resolvePlaceholders(storeMgr?.personName || '', doc), '', approver?.personName || ''],
      ackText: '',
    };
  }
  if (copy === 'transfer_dest') {
    return {
      copyBanner: 'نسخة المستودع المستلم',
      roles: [`أمين ${doc.partyValue} (المستلم)`, 'لجنة الاستلام', approver?.roleLabel || 'المراجعة'],
      names: ['', '', approver?.personName || ''],
      ackText: '',
    };
  }
  if (copy === 'transfer_driver') {
    return {
      copyBanner: 'نسخة السائق / المندوب (ترافق الإرسالية)',
      roles: ['توقيع السائق بالاستلام للنقل', resolvePlaceholders('أمين {المستودع}', doc), 'نقطة التسليم بالوجهة'],
      names: ['', resolvePlaceholders(storeMgr?.personName || '', doc), ''],
      ackText: '',
    };
  }

  return {
    copyBanner: '',
    roles: form.footerRoles.map((r) => resolvePlaceholders(r, doc)) as [string, string, string],
    names: form.footerNames.map((n, i) => {
      if (n) return resolvePlaceholders(n, doc);
      if (i === 0 && storeMgr) return resolvePlaceholders(storeMgr.personName, doc);
      if (i === 2 && approver) return resolvePlaceholders(approver.personName, doc);
      return '';
    }) as [string, string, string],
    ackText: '',
  };
}

export async function buildPrintableHtmlAndArchive(params: {
  doc: PrintableDocument;
  config: SystemConfig;
}): Promise<{ html: string; signatureCode: string; qrDataUrl: string; archiveEntry?: ArchiveFile }> {
  const { doc, config } = params;
  const formCfg = config.printForms?.[doc.formKey] ?? config.printForms?.default ?? DEFAULT_PRINT_FORM;
  const paper: PrintPaperSize =
    doc.paperSize ?? (doc.thermal ? 'THERMAL_80' : config.paperSize ?? 'A4_P');

  const signatureCode = await signDocumentPayload({
    refNo: doc.refNo,
    date: doc.date,
    warehouse: doc.warehouse,
    totalQty: doc.totalQty,
    signer: doc.actorName,
  });

  const qrDataUrl = formCfg.showQr
    ? await QRCode.toDataURL(signatureCode, { width: 112, margin: 1 })
    : '';

  const fontCss =
    formCfg.fontFamily === 'Amiri'
      ? '"Amiri", "IBM Plex Sans Arabic", serif'
      : `"${formCfg.fontFamily}", "IBM Plex Sans Arabic", sans-serif`;

  const isThermal = paper === 'THERMAL_58' || paper === 'THERMAL_80' || paper === 'THERMAL_112';
  const html = isThermal
    ? buildThermalHtml(doc, config, formCfg, qrDataUrl, signatureCode, fontCss, paper)
    : buildSheetHtml(doc, config, formCfg, qrDataUrl, signatureCode, fontCss, paper);

  let archiveEntry: ArchiveFile | undefined;
  if (config.autoArchiveOnPrint) {
    const bytes = new TextEncoder().encode(html);
    const sha256 = await sha256Hex(bytes);
    const now = new Date().toISOString();
    archiveEntry = {
      id: Ids.next('arc'),
      space: doc.space,
      title: `${doc.title} — ${doc.refNo}`,
      category: doc.opType,
      tags: ['أرشفة-تلقائية', doc.opType, doc.warehouse].filter(Boolean),
      docRef: doc.refNo,
      warehouse: doc.warehouse,
      docDate: doc.date,
      fileName: `${doc.refNo}.html`,
      storedPath: `auto_archive/${doc.space}/${doc.refNo}.html`,
      mime: 'text/html',
      sizeBytes: bytes.byteLength,
      sha256,
      source: 'auto',
      opType: doc.opType,
      notes: `أرشفة تلقائية (${PAPER_SIZE_LABELS[paper]}) (${doc.partyValue})`,
      pinned: false,
      createdBy: doc.actorName,
      createdAt: now,
      updatedAt: now,
    };
  }

  return { html, signatureCode, qrDataUrl, archiveEntry };
}

function escapeHtml(val: string | number): string {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSheetHtml(
  doc: PrintableDocument,
  config: SystemConfig,
  form: PrintFormConfig,
  qrDataUrl: string,
  sig: string,
  fontCss: string,
  paper: PrintPaperSize
): string {
  const signers = config.signerPositions ?? DEFAULT_SIGNER_POSITIONS;
  const copyMeta = resolveCopyMeta(doc, form, signers);
  const rightLines = (form.rightLines.length ? form.rightLines : [config.orgName, config.orgSubTitle]).map((l) =>
    resolvePlaceholders(l, doc)
  );
  const tableRowsHtml = doc.rows
    .map(
      (r, idx) =>
        `<tr><td style="text-align:center;">${nfPrint(idx + 1)}</td>${r
          .map((c) => `<td style="text-align:${form.tableAlign};">${escapeHtml(typeof c === 'number' ? nfPrint(c) : c)}</td>`)
          .join('')}</tr>`
    )
    .join('');

  const sheetMaxWidth = paper === 'A4_L' ? '1080px' : paper === 'A5' ? '560px' : '790px';
  const pageRule =
    paper === 'A4_L'
      ? '@page { size: A4 landscape; margin: 10mm; }'
      : paper === 'A5'
      ? '@page { size: A5 portrait; margin: 8mm; }'
      : '@page { size: A4 portrait; margin: 12mm; }';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.title)} - ${escapeHtml(doc.refNo)}</title>
<style>
  ${pageRule}
  body { font-family: ${fontCss}; font-size: ${form.fontSize}px; color: #000; background: #fff; margin: 0; padding: 18px; }
  .sheet { max-width: ${sheetMaxWidth}; margin: 0 auto; border: 1.5px solid #000; padding: 18px 22px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 12px; }
  .head-right { line-height: 1.65; font-weight: 700; font-size: 13px; }
  .head-center { text-align: center; }
  .head-left { border: 1px solid #000; padding: 6px 10px; font-size: 12px; min-width: 190px; }
  .copy-badge { text-align: center; font-size: 12px; font-weight: 700; border: 1px solid #000; display: inline-block; padding: 2px 12px; margin-bottom: 6px; background: #f2f2f2; }
  .title { text-align: center; font-size: 18px; font-weight: 700; margin: 6px 0 12px; text-decoration: underline; }
  .meta-bar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 8px 10px; background: #f8f8f8; border: 1px solid #333; margin-bottom: 12px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #000; padding: 6px 8px; font-size: ${form.fontSize}px; }
  th { background: #efefef; font-weight: 700; }
  .ack { border: 1px solid #000; padding: 8px 10px; margin-bottom: 12px; font-weight: 700; background: #fafafa; font-size: 12px; }
  .auth-box { border: 1px dashed #333; padding: 8px 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 20px; text-align: center; font-size: 12px; }
  .sig-line { margin-top: 32px; border-top: 1px solid #000; padding-top: 4px; font-weight: 700; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="head-right">${rightLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</div>
      <div class="head-center">
        ${form.showLogo ? `<img src="${config.logoDataUrl || '/logo-official.png'}" style="height:52px;object-fit:contain;" />` : ''}
        ${copyMeta.copyBanner ? `<div class="copy-badge">${escapeHtml(copyMeta.copyBanner)}</div>` : ''}
        <div style="font-size:11px;margin-top:2px;">${escapeHtml(config.orgCity)} · ${escapeHtml(PAPER_SIZE_LABELS[paper])}</div>
      </div>
      <div class="head-left">
        <div><strong>رقم السند:</strong> ${escapeHtml(doc.refNo)}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(fmtDate(doc.date))}</div>
        <div><strong>المستودع:</strong> ${escapeHtml(doc.warehouse)}</div>
      </div>
    </div>
    <div class="title">${escapeHtml(doc.title)}</div>
    <div class="meta-bar">
      <div><strong>${escapeHtml(doc.partyLabel)}:</strong> ${escapeHtml(doc.partyValue)}</div>
      ${doc.receiverName ? `<div><strong>المستلم المباشر:</strong> ${escapeHtml(doc.receiverName)}</div>` : ''}
      <div><strong>الإجمالي:</strong> ${escapeHtml(nfPrint(doc.totalQty))}</div>
      <div><strong>المحرر:</strong> ${escapeHtml(doc.actorName)}</div>
    </div>
    <table>
      <thead>
        <tr><th style="width:36px;">م</th>${doc.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
      </thead>
      <tbody>${tableRowsHtml}</tbody>
    </table>
    ${copyMeta.ackText ? `<div class="ack">${escapeHtml(copyMeta.ackText)}</div>` : ''}
    ${doc.notes ? `<div style="margin-bottom:10px;font-size:12px;"><strong>ملاحظات:</strong> ${escapeHtml(doc.notes)}</div>` : ''}
    ${
      form.showAuthBox
        ? `<div class="auth-box">
             <div>
               <div style="font-weight:700;font-size:12px;">توثيق إلكتروني (ECDSA P-256)</div>
               <div style="font-family:monospace;font-size:10px;word-break:break-all;margin-top:4px;">${escapeHtml(sig)}</div>
             </div>
             ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:76px;height:76px;" />` : ''}
           </div>`
        : ''
    }
    <div class="sigs">
      ${copyMeta.roles
        .map(
          (role, idx) =>
            `<div><div>${escapeHtml(role)}</div><div class="sig-line">${escapeHtml(copyMeta.names[idx] || 'التوقيع والختم')}</div></div>`
        )
        .join('')}
    </div>
  </div>
</body>
</html>`;
}

function buildThermalHtml(
  doc: PrintableDocument,
  config: SystemConfig,
  _form: PrintFormConfig,
  qrDataUrl: string,
  sig: string,
  fontCss: string,
  paper: PrintPaperSize
): string {
  const widthPx = paper === 'THERMAL_58' ? 210 : paper === 'THERMAL_112' ? 400 : 290;
  const rows = doc.rows
    .map(
      (r) =>
        `<div style="display:flex;justify-content:space-between;border-bottom:1px dotted #999;padding:4px 0;font-size:11px;"><span>${escapeHtml(r[0] ?? '')}</span><strong>${escapeHtml(r[1] ?? '')} ${escapeHtml(r[2] ?? '')}</strong></div>`
    )
    .join('');

  // Thermal receipts intentionally omit signature footer boxes per Part 2 spec
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>إيصال حراري - ${escapeHtml(doc.refNo)}</title>
<style>
  body { font-family: ${fontCss}; width: ${widthPx}px; margin: 0 auto; padding: 8px; color: #000; background: #fff; font-size: 12px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 7px 0; }
</style>
</head>
<body>
  <div class="center" style="font-weight:700;">${escapeHtml(config.orgName)}</div>
  <div class="center" style="font-size:11px;">${escapeHtml(doc.title)} (${escapeHtml(PAPER_SIZE_LABELS[paper])})</div>
  <div class="divider"></div>
  <div><strong>السند:</strong> ${escapeHtml(doc.refNo)}</div>
  <div><strong>التاريخ:</strong> ${escapeHtml(doc.date)}</div>
  <div><strong>المستودع:</strong> ${escapeHtml(doc.warehouse)}</div>
  <div><strong>${escapeHtml(doc.partyLabel)}:</strong> ${escapeHtml(doc.partyValue)}</div>
  ${doc.receiverName ? `<div><strong>المستلم:</strong> ${escapeHtml(doc.receiverName)}</div>` : ''}
  <div class="divider"></div>
  ${rows}
  <div class="divider"></div>
  <div style="display:flex;justify-content:space-between;font-weight:700;"><span>الإجمالي</span><span>${escapeHtml(doc.totalQty)}</span></div>
  ${qrDataUrl ? `<div class="center" style="margin-top:8px;"><img src="${qrDataUrl}" style="width:88px;height:88px;" /></div>` : ''}
  <div class="center" style="font-size:9px;font-family:monospace;word-break:break-all;margin-top:4px;">${escapeHtml(sig.slice(0, 48))}</div>
</body>
</html>`;
}

// ───────────────────────── LabelSize Settings (barcode_labels.dart parity)

export interface LabelSize {
  widthMm: number;
  heightMm: number;
}

export const LABEL_SIZE_PRESETS: LabelSize[] = [
  { widthMm: 35, heightMm: 25 },
  { widthMm: 50, heightMm: 30 },
  { widthMm: 60, heightMm: 40 },
];

export const LABEL_SIZE_PREFS_KEY = 'imdad.labelSize';
export const DEFAULT_LABEL_SIZE: LabelSize = { widthMm: 35, heightMm: 25 };

export function isValidLabelSize(w: number, h: number): boolean {
  return Number.isFinite(w) && Number.isFinite(h) && w >= 15 && w <= 200 && h >= 15 && h <= 200;
}

export function loadLabelSize(): LabelSize {
  try {
    const raw = window.localStorage.getItem(LABEL_SIZE_PREFS_KEY) ?? '';
    const [wStr, hStr] = raw.split('x');
    const w = Number(wStr);
    const h = Number(hStr);
    if (isValidLabelSize(w, h)) return { widthMm: w, heightMm: h };
  } catch {
    // ignore storage errors
  }
  return DEFAULT_LABEL_SIZE;
}

export function saveLabelSize(s: LabelSize): void {
  try {
    window.localStorage.setItem(LABEL_SIZE_PREFS_KEY, `${s.widthMm}x${s.heightMm}`);
  } catch {
    // ignore
  }
}

export function formatLabelSize(s: LabelSize): string {
  return `${s.widthMm}×${s.heightMm} مم`;
}

export function buildBarcodeSheetHtml(
  labels: Array<{ name: string; code: string; barcode: string }>,
  size: LabelSize,
  orgName: string
): string {
  const cards = labels
    .map((lb) => {
      const codeVal = lb.barcode || lb.code;
      const svg = renderCode128SvgHtml(codeVal, { heightPx: 30, quietZone: 6 });
      return `<div class="lbl">
        <div class="org">${escapeHtml(orgName)}</div>
        <div class="nm">${escapeHtml(lb.name)}</div>
        <div class="bars">${svg}</div>
        <div class="cd">${escapeHtml(codeVal)}</div>
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>ملصقات الباركود (${formatLabelSize(size)})</title>
<style>
  @page { margin: 8mm; }
  body { font-family: "IBM Plex Sans Arabic", sans-serif; color: #000; background: #fff; margin: 0; padding: 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, ${size.widthMm}mm); gap: 4mm; justify-content: center; }
  .lbl { width: ${size.widthMm}mm; min-height: ${size.heightMm}mm; border: 1px solid #222; padding: 2mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; page-break-inside: avoid; }
  .org { font-size: 7pt; color: #444; }
  .nm { font-size: 8.5pt; font-weight: 700; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
  .bars { display: flex; align-items: center; justify-content: center; margin: 2px 0; }
  .cd { font-family: monospace; font-size: 7.5pt; letter-spacing: 0.5px; }
</style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`;
}

// ───────────────────────── Daily Movement Form Signatures (daily_movement_form_dialog.dart parity)

export interface DailySignerSlot {
  role: string;
  name: string;
}

export interface DailyFormVars {
  mainSigns: DailySignerSlot[];
  subSigns: DailySignerSlot[];
  warehouseSigns: Record<string, DailySignerSlot[]>;
}

export const DAILY_FORM_VARS_KEY = 'imdad.dailyFormVars';

export const DEFAULT_DAILY_FORM_VARS: DailyFormVars = {
  mainSigns: [
    { role: 'أمين المخزن الرئيسي', name: '' },
    { role: 'رئيس شعبة الإمداد', name: '' },
    { role: 'الاعتماد والتصديق', name: '' },
  ],
  subSigns: [
    { role: 'أمين مخزن المعسكر', name: '' },
    { role: 'قائد المعسكر / الشؤون الإدارية', name: '' },
    { role: 'مراجع الإمداد', name: '' },
  ],
  warehouseSigns: {},
};

export function loadDailyFormVars(): DailyFormVars {
  try {
    const raw = window.localStorage.getItem(DAILY_FORM_VARS_KEY);
    if (!raw) return DEFAULT_DAILY_FORM_VARS;
    const parsed = JSON.parse(raw) as Partial<DailyFormVars>;
    return {
      mainSigns: parsed.mainSigns ?? DEFAULT_DAILY_FORM_VARS.mainSigns,
      subSigns: parsed.subSigns ?? DEFAULT_DAILY_FORM_VARS.subSigns,
      warehouseSigns: parsed.warehouseSigns ?? {},
    };
  } catch {
    return DEFAULT_DAILY_FORM_VARS;
  }
}

export function saveDailyFormVars(vars: DailyFormVars): void {
  try {
    window.localStorage.setItem(DAILY_FORM_VARS_KEY, JSON.stringify(vars));
  } catch {
    // ignore
  }
}

