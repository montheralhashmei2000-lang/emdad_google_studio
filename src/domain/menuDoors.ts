// Pure AppSpace, MenuDoors & VoucherCopies Metadata Engine (Zero Dependencies)

import type { AppSpace, VoucherCopyType } from './types';

export interface DoorMeta {
  id: string;
  space: AppSpace;
  label: string;
  perm: string;
}

export const SUPPLY_DOORS_META: DoorMeta[] = [
  { id: 'dashboard', space: 'supply', label: 'لوحة التشغيل', perm: 'supply.dashboard' },
  { id: 'supplyMoves', space: 'supply', label: 'حركة المخزون والعمليات', perm: 'supply.moves.read' },
  { id: 'supplyOrders', space: 'supply', label: 'طلبيات التوريد', perm: 'supply.orders' },
  { id: 'documents', space: 'supply', label: 'السندات والوثائق', perm: 'supply.documents' },
  { id: 'supplyDaily', space: 'supply', label: 'التشغيل اليومي والاستحقاق', perm: 'supply.daily' },
  { id: 'stocktake', space: 'supply', label: 'الجرد والتسويات', perm: 'supply.stocktake' },
  { id: 'campAccounts', space: 'supply', label: 'حساب المعسكر', perm: 'supply.campAccounts' },
  { id: 'supplyReports', space: 'supply', label: 'التقارير والأرصدة والتنبيهات', perm: 'supply.reports' },
  { id: 'supplyData', space: 'supply', label: 'البيانات الأساسية', perm: 'supply.data' },
  { id: 'cables', space: 'supply', label: 'البرقيات', perm: 'supply.cables' },
  { id: 'archive', space: 'supply', label: 'الأرشيف الإلكتروني', perm: 'supply.archive' },
  { id: 'personnel', space: 'supply', label: 'القوة البشرية', perm: 'supply.personnel' },
  { id: 'linkages', space: 'supply', label: 'الارتباطات المالية والتسليح', perm: 'supply.linkages' },
  { id: 'supplyAudit', space: 'supply', label: 'الرقابة والتدقيق', perm: 'supply.audit' },
  { id: 'settings', space: 'supply', label: 'الإعدادات والتصميم', perm: 'supply.settings' },
];

export const FUEL_DOORS_META: DoorMeta[] = [
  { id: 'fuelDashboard', space: 'fuel', label: 'لوحة المحروقات', perm: 'fuel.dashboard' },
  { id: 'fuelMoves', space: 'fuel', label: 'حركة المحروقات', perm: 'fuel.moves' },
  { id: 'fuelAllocations', space: 'fuel', label: 'التفريدات والمخصصات', perm: 'fuel.allocations' },
  { id: 'fuelStocktake', space: 'fuel', label: 'جرد المحروقات', perm: 'fuel.stocktake' },
  { id: 'fuelReports', space: 'fuel', label: 'تقارير المحروقات والمركبات', perm: 'fuel.reports' },
  { id: 'fuelData', space: 'fuel', label: 'البيانات الأساسية للمحروقات', perm: 'fuel.data' },
  { id: 'fuelSettings', space: 'fuel', label: 'إعدادات المحروقات', perm: 'fuel.settings' },
];

export function getDoorsForSpace(space: AppSpace): DoorMeta[] {
  return space === 'fuel' ? FUEL_DOORS_META : SUPPLY_DOORS_META;
}

export const VOUCHER_COPIES_SPEC: Record<VoucherCopyType, { op: 'issue' | 'transfer' | 'all'; title: string; roleNote: string }> = {
  default: { op: 'all', title: 'النسخة القياسية', roleNote: 'النموذج المعتمد العام' },
  issue_order: { op: 'issue', title: 'أمر صرف مستودعي', roleNote: 'نسخة محاسبة المستودع' },
  issue_receipt: { op: 'issue', title: 'إيصال استلام كميات', roleNote: 'إقرار استلام المندوب' },
  issue_recipient: { op: 'issue', title: 'نسخة الجهة المستفيدة', roleNote: 'للحفظ لدى الوحدة / المطبخ' },
  transfer_source: { op: 'transfer', title: 'نسخة المستودع المرسِل', roleNote: 'تُحفظ في ملف الصادر' },
  transfer_dest: { op: 'transfer', title: 'نسخة المستودع المستلم', roleNote: 'للمطابقة وتأكيد الاستلام' },
  transfer_driver: { op: 'transfer', title: 'بوليصة السائق / الناقل', roleNote: 'مرافقة للشحنة في الطريق' },
};
