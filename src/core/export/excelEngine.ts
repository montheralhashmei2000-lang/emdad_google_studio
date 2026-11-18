// Excel (.xlsx) Export & 7-Template Import Engine with Instructions Sheet & Arabic Digit Normalization

import * as XLSX from 'xlsx';
import { normalizeDigits } from '../ui/imdTokens';

export type ExcelTemplateId =
  | 'items'
  | 'units'
  | 'entitlements'
  | 'strength'
  | 'openingBalances'
  | 'stocktakeCount'
  | 'fuelAllocations';

export interface ExcelTemplateSpec {
  id: ExcelTemplateId;
  label: string;
  fileName: string;
  headers: string[];
  sampleRow: string[];
  instructions: string[];
}

export const EXCEL_TEMPLATES: ExcelTemplateSpec[] = [
  {
    id: 'items',
    label: '1. دليل الأصناف الأساسي',
    fileName: 'template_01_items.xlsx',
    headers: ['الكود', 'اسم الصنف', 'التصنيف', 'الوحدة الأساسية', 'الحد الأدنى', 'الباركود', 'السعر التقديري'],
    sampleRow: ['ITM-901', 'فاصولياء جافة', 'حبوب وبقوليات', 'كجم', '100', '6281001122', '12.5'],
    instructions: [
      'أدخل بيانات الأصناف في ورقة (البيانات) بدءاً من الصف الثاني دون تغيير أسماء الأعمدة.',
      'الأرقام العربية والهندية تُطبّع تلقائياً عند الاستيراد.',
      'وضع (merge): يضيف الأصناف الجديدة فقط أو يحدّث المتطابق بالكود.',
      'وضع (replace): يستبدل الحقول الداعمة وفق السياسة المعتمدة.',
    ],
  },
  {
    id: 'units',
    label: '2. الوحدات المرفقة ومعاملات التحويل',
    fileName: 'template_02_units.xlsx',
    headers: ['كود الصنف', 'اسم الوحدة', 'معامل التحويل للأساس', 'وحدة أساسية (نعم/لا)'],
    sampleRow: ['ITM-901', 'كيس 50 كجم', '50', 'لا'],
    instructions: [
      'اربط كل وحدة بكود الصنف المسجل في الدليل.',
      'معامل التحويل للأساس يحدد عدد الوحدات الأساسية داخل العبوة.',
    ],
  },
  {
    id: 'entitlements',
    label: '3. معدلات الاستحقاق التموينية',
    fileName: 'template_03_entitlements.xlsx',
    headers: ['كود الصنف', 'المعدل الشهري للفرد', 'أيام الدورة (30/31)', 'صنف حرج (نعم/لا)'],
    sampleRow: ['ITM-101', '9.3', '31', 'نعم'],
    instructions: [
      'المعدل الشهري للفرد يُقسم على أيام الدورة لحساب الاستحقاق اليومي تلقائياً.',
    ],
  },
  {
    id: 'strength',
    label: '4. كشف القوة والتفريدة اليومية',
    fileName: 'template_04_strength.xlsx',
    headers: ['التاريخ (YYYY-MM-DD)', 'اسم الوحدة / المعسكر', 'القوة الفعلية', 'ملاحظات'],
    sampleRow: ['2026-11-15', 'معسكر النصر', '420', 'تفريدة الصباح'],
    instructions: [
      'يجب كتابة التاريخ بصيغة YYYY-MM-DD.',
      'تُستخدم القوة في احتساب استحقاق الوجبات وأيام الكفاية.',
    ],
  },
  {
    id: 'openingBalances',
    label: '5. الأرصدة الافتتاحية للمستودعات',
    fileName: 'template_05_opening_balances.xlsx',
    headers: ['تاريخ القيد', 'المستودع', 'كود الصنف', 'الكمية بالأساس', 'تاريخ الصلاحية'],
    sampleRow: ['2026-11-01', 'المستودع المركزي', 'ITM-101', '2500', '2027-06-30'],
    instructions: [
      'المستودع وكود الصنف يجب أن يطابقا الأسماء والأكواد المعتمدة بالنظام.',
      'يُحل تصادم المفتاح الطبيعي (المستودع + الصنف + التاريخ) تلقائياً.',
    ],
  },
  {
    id: 'stocktakeCount',
    label: '6. نتائج العدّ الجردي الفعلي',
    fileName: 'template_06_stocktake_count.xlsx',
    headers: ['رقم جلسة الجرد', 'كود الصنف', 'الكمية المعدودة فعلياً', 'سبب الفرق'],
    sampleRow: ['STK-2026-001', 'ITM-101', '2480', 'جرد دوري معتمد'],
    instructions: [
      'يُستخدم لتحديث كميات العدّ الفعلي داخل جلسة جرد مفتوحة.',
    ],
  },
  {
    id: 'fuelAllocations',
    label: '7. تفريدات ومخصصات المحروقات',
    fileName: 'template_07_fuel_allocations.xlsx',
    headers: ['اسم الوحدة', 'نوع الوقود (diesel/petrol)', 'الدورة (daily/weekly/monthly)', 'الكمية لكل فترة (لتر)'],
    sampleRow: ['سرية الإمداد الأولى', 'diesel', 'weekly', '600'],
    instructions: [
      'نوع الوقود: diesel أو petrol فقط.',
      'الدورة: daily أو weekly أو monthly.',
    ],
  },
];

export function exportRowsToXlsx(
  filename: string,
  sheetName: string,
  columns: Array<{ header: string; key: string }>,
  rows: Array<Record<string, unknown>>
): void {
  const data = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      out[col.header] = row[col.key] ?? '';
    }
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export async function importXlsxFile(file: File): Promise<Array<Record<string, string>>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const preferredSheet =
    wb.SheetNames.find((n) => n === 'البيانات' || n.toLowerCase() === 'data') ?? wb.SheetNames[0];
  if (!preferredSheet) return [];
  const ws = wb.Sheets[preferredSheet];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map((row) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      clean[k.trim()] = normalizeDigits(String(v ?? '').trim());
    }
    return clean;
  });
}

export function downloadExcelTemplate(
  filename: string,
  headers: string[],
  sampleRow?: string[],
  instructions?: string[]
): void {
  const wb = XLSX.utils.book_new();
  const aoa: string[][] = [headers];
  if (sampleRow) aoa.push(sampleRow);
  const dataSheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, dataSheet, 'البيانات');

  const instrRows: string[][] = [
    ['دليل وتعليمات تعبئة القالب الرسمي — نظام الإمداد والتموين'],
    [''],
    ...(instructions ?? [
      'أدخل السجلات في ورقة (البيانات) بدءاً من الصف الثاني.',
      'تأكد من عدم تعديل أسماء أعمدة الرأس في الصف الأول.',
    ]).map((line, i) => [`${i + 1}. ${line}`]),
  ];
  const instrSheet = XLSX.utils.aoa_to_sheet(instrRows);
  XLSX.utils.book_append_sheet(wb, instrSheet, 'التعليمات');

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function downloadOfficialExcelTemplate(templateId: ExcelTemplateId): void {
  const spec = EXCEL_TEMPLATES.find((t) => t.id === templateId) ?? EXCEL_TEMPLATES[0];
  downloadExcelTemplate(spec.fileName, spec.headers, spec.sampleRow, spec.instructions);
}
