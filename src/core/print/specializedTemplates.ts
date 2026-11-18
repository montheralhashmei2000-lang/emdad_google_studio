// Specialized Print Format Builders: MilitaryPrint, CablePrint, CustodySheetPrint, ContractPrint, MoneyReceiptPrint, DestructionPrint

import { amountToArabicWords } from '../arabicWords';
import type { PrintableDocument } from './printEngine';
import type {
  Cable,
  Destruction,
  LinkCustodySheet,
  LinkCustodySheetRow,
  LinkMoneyReceipt,
  LinkPurchaseContract,
} from '../../domain/types';

/**
 * MilitaryPrint: Official unit/camp strength, entitlement, or periodic movement report with command header
 */
export function buildMilitaryStrengthReportDoc(params: {
  title: string;
  refNo: string;
  date: string;
  warehouse: string;
  partyLabel?: string;
  partyValue: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  totalQty: number;
  notes?: string;
  actorName: string;
}): PrintableDocument {
  return {
    formKey: 'military_report',
    space: 'supply',
    title: params.title,
    refNo: params.refNo,
    date: params.date,
    warehouse: params.warehouse,
    partyLabel: params.partyLabel ?? 'الوحدة / القطاع',
    partyValue: params.partyValue,
    opType: 'كشف عسكري رسمي',
    columns: params.columns,
    rows: params.rows,
    totalQty: params.totalQty,
    notes: params.notes,
    actorName: params.actorName,
    paperSize: 'A4_P',
  };
}

/**
 * CablePrint: Military official cable form with recipient routing table & communications center box
 */
export function buildCableOfficialDoc(cable: Cable, actorName: string): PrintableDocument {
  return {
    formKey: 'cable',
    space: 'supply',
    title: cable.direction === 'in' ? 'نموذج برقية رسمية واردة' : 'نموذج برقية رسمية صادرة',
    refNo: cable.cableNo,
    date: `${cable.cableDate} ${cable.cableTime || ''}`.trim(),
    warehouse: cable.fromParty,
    partyLabel: 'المرسل إليهم',
    partyValue: cable.recipientsJson.length > 0 ? cable.recipientsJson.join('، ') : cable.toParty,
    opType: 'برقية عسكرية',
    columns: ['الحقل', 'البيان'],
    rows: [
      ['رقم القيد التسلسلي', cable.serialNo || '—'],
      ['الجهة المرسلة', cable.fromParty],
      ['الجهة المستلمة الرئيسية', cable.toParty],
      ['كافة المرسل إليهم', cable.recipientsJson.join('، ') || cable.toParty],
      ['صورة مع التحية (CC)', cable.ccParty || '—'],
      ['درجة السرية / الأولوية', `${cable.classification} / ${cable.priority}`],
      ['الموضوع', cable.subject],
      ['نص البرقية', cable.body],
      ['وسيلة الإرسال والاستعمال', `${cable.sendMethod || 'شبكة مغلقة'} — ${cable.sendDateTime.slice(0, 16).replace('T', ' ')}`],
      ['المحرر والموقّع', `${cable.editorRank} ${cable.editorName} (${cable.editorJob})`.trim()],
    ],
    totalQty: 1,
    notes: cable.attachSha256 ? `مرفق موثق (${cable.attachName}) SHA-256: ${cable.attachSha256}` : cable.notes,
    actorName,
    paperSize: 'A4_P',
  };
}

/**
 * CustodySheetPrint: Horizontal custody sheet (A4_L) highlighting duplicate invoices
 */
export function buildCustodySheetHorizontalDoc(params: {
  sheet: LinkCustodySheet;
  rows: LinkCustodySheetRow[];
  dupInvoices: Set<string>;
  actorName: string;
}): PrintableDocument {
  const { sheet, rows, dupInvoices, actorName } = params;
  const totalSpent = rows.reduce((s, r) => s + r.spentSar, 0);
  return {
    formKey: 'custody_sheet',
    space: 'supply',
    title: `مسير العهدة المالية — ${sheet.title}`,
    refNo: sheet.sheetNo,
    date: sheet.updatedAt.slice(0, 10),
    warehouse: 'الشؤون المالية والعهد',
    partyLabel: 'أمين العهدة',
    partyValue: sheet.holderName || '—',
    opType: 'مسير عهدة مالية',
    columns: ['م', 'التاريخ', 'رقم الفاتورة', 'البيان', 'التاجر / المتجر', 'المستلم (SAR)', 'المنصرف (SAR)'],
    rows: rows.map((r) => [
      r.seq,
      r.date,
      dupInvoices.has(r.invoiceNo.trim()) ? `${r.invoiceNo} (مكررة!)` : r.invoiceNo || '—',
      r.statement,
      r.shop || '—',
      r.grantSar,
      r.spentSar,
    ]),
    totalQty: totalSpent,
    notes: dupInvoices.size > 0 ? `تنبيه رقابي: يوجد (${dupInvoices.size}) أرقام فواتير مكررة في المسير.` : sheet.notes,
    actorName,
    paperSize: 'A4_L',
  };
}

/**
 * ContractPrint: Official Supply Purchase Contract format
 */
export function buildContractOfficialDoc(contract: LinkPurchaseContract, actorName: string): PrintableDocument {
  return {
    formKey: 'purchase_contract',
    space: 'supply',
    title: 'عقد شراء وتوريد تمويني رسمي',
    refNo: contract.contractNo,
    date: contract.listDate,
    warehouse: 'قسم العقود والمشتريات',
    partyLabel: 'المورد المتعاقد',
    partyValue: contract.supplier,
    opType: 'عقد شراء',
    columns: ['البيان', 'التفاصيل'],
    rows: [
      ['عنوان العقد', contract.title],
      ['قيمة العقد', `${contract.amount} ${contract.currency.toUpperCase()}`],
      ['المبلغ بالحروف', amountToArabicWords(contract.amount, contract.currency)],
      ['تاريخ السريان / الانتهاء', `${contract.listDate} ← ${contract.endDate || 'مفتوح'}`],
      ['حالة العقد', contract.status === 'active' ? 'ساري المفعول' : contract.status],
      ['شروط التسليم', 'التسليم في مخازن الشعبة وفق المواصفات والفحص الفني'],
    ],
    totalQty: contract.amount,
    notes: contract.notes,
    actorName,
    paperSize: 'A4_P',
  };
}

/**
 * MoneyReceiptPrint: Official Cash Receipt Voucher with Arabic Tafkeet
 */
export function buildMoneyReceiptDoc(receipt: LinkMoneyReceipt, actorName: string): PrintableDocument {
  const tafkeet = amountToArabicWords(receipt.amount, receipt.currency);
  return {
    formKey: 'money_receipt',
    space: 'supply',
    title: 'سند استلام مبلغ مالي (بالتفقيط الرسمي)',
    refNo: `MR-${receipt.id.slice(-6).toUpperCase()}`,
    date: receipt.receiptDate,
    warehouse: 'الصندوق المالي',
    partyLabel: 'المستلم',
    partyValue: `${receipt.receiverName} (${receipt.capacity})`,
    receiverName: receipt.receiverName,
    opType: 'سند استلام مبلغ',
    columns: ['البند', 'التفاصيل'],
    rows: [
      ['المبلغ رقماً', `${receipt.amount} ${receipt.currency.toUpperCase()}`],
      ['المبلغ كتابةً (التفقيط)', tafkeet],
      ['المُسلِّم / أمين الصندوق', receipt.delivererName || 'أمين الصندوق'],
      ['طريقة التسليم', receipt.method === 'cash' ? 'نقداً' : receipt.transferNo || receipt.method],
      ['الغرض / مقابل', receipt.purpose],
    ],
    totalQty: receipt.amount,
    actorName,
    paperSize: 'A5',
  };
}

/**
 * DestructionPrint: Multi-member destruction committee minutes & witness signatures
 */
export function buildDestructionProtocolDoc(
  dest: Destruction,
  actorName: string,
  lines: Array<{ itemName: string; itemCode: string; qty: number; unitName: string; baseQty: number }> = []
): PrintableDocument {
  const committeeRows = dest.committee.map((m, idx) => [
    `عضو لجنة (${idx + 1})`,
    `${m.rank} ${m.name}`.trim(),
    m.role,
    'توقيع العضو: ....................',
  ]);
  const itemRows = lines.map((ln) => [
    'صنف متلَف',
    `${ln.itemName} (${ln.itemCode})`,
    `${ln.qty} ${ln.unitName} (= ${ln.baseQty} أساس)`,
    dest.status,
  ]);
  const totalBase = lines.reduce((s, l) => s + l.baseQty, 0);
  return {
    formKey: 'destruction',
    space: 'supply',
    title: 'محضر إتلاف مواد تالفة / منتهية الصلاحية',
    refNo: dest.refNo,
    date: dest.date,
    warehouse: dest.warehouse,
    partyLabel: 'طريقة ومكان الإتلاف',
    partyValue: `${dest.method || 'إتلاف ميداني'} — ${dest.place || 'الموقع المعتمد'} (${dest.reason || 'تلف'})`,
    opType: 'محضر إتلاف',
    columns: ['البند / الصفة', 'الصنف / الاسم', 'الكمية / الدور', 'الاعتماد'],
    rows: [...itemRows, ...committeeRows],
    totalQty: totalBase || lines.length,
    notes: dest.orderRef ? `أمر الإتلاف: ${dest.orderRef}${dest.notes ? ' — ' + dest.notes : ''}` : dest.notes,
    actorName,
    paperSize: 'A4_P',
  };
}
