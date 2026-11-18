// Pure AccessControl, PermCatalog, 6 SysPerms, 7 SectionBlocks (Fail-Closed), 16 Role Templates, WarehouseScope

import type { User } from './types';

export const SYS_PERMS = [
  'sys.permissions',
  'sys.users',
  'sys.backup',
  'sys.devices',
  'sys.sync',
  'sys.settingsSensitive',
] as const;

export type SysPerm = (typeof SYS_PERMS)[number];

export const SECTION_BLOCKS = [
  { key: 'supply', label: 'قسم الإمداد والتموين' },
  { key: 'fuel', label: 'قسم المحروقات' },
  { key: 'admin.settings', label: 'إعدادات النظام' },
  { key: 'admin.users', label: 'المستخدمون والصلاحيات' },
  { key: 'admin.audit', label: 'الرقابة والتدقيق' },
  { key: 'admin.sync', label: 'المزامنة المحلية' },
  { key: 'admin.devices', label: 'تفعيل الأجهزة' },
] as const;

export type SectionBlockKey = (typeof SECTION_BLOCKS)[number]['key'];

export const PERM_CATALOG: Array<{ key: string; label: string; group: string }> = [
  { key: 'space.supply', label: 'الدخول إلى مساحة الإمداد والتموين', group: 'المساحات' },
  { key: 'space.fuel', label: 'الدخول إلى مساحة المحروقات', group: 'المساحات' },
  { key: 'supply.dashboard', label: 'لوحة التشغيل الرئيسية', group: 'الإمداد' },
  { key: 'supply.moves.read', label: 'عرض حركات المخزون', group: 'الإمداد' },
  { key: 'supply.moves.write', label: 'إنشاء وتعديل حركات المخزون (استلام/صرف/تحويل/مرتجع/إتلاف)', group: 'الإمداد' },
  { key: 'supply.orders', label: 'طلبيات الإعاشة وأوامر التوريد', group: 'الإمداد' },
  { key: 'supply.documents', label: 'سجل المستندات والطباعة', group: 'الإمداد' },
  { key: 'supply.daily', label: 'التفريدة اليومية وصرف الوجبات ونسب الاستحقاق', group: 'الإمداد' },
  { key: 'supply.stocktake', label: 'الجرد المخزني والتسويات', group: 'الإمداد' },
  { key: 'supply.campAccounts', label: 'حساب المعسكر وتصفية الشهر', group: 'الإمداد' },
  { key: 'supply.reports', label: 'التقارير والأرصدة والتنبيهات', group: 'الإمداد' },
  { key: 'supply.data', label: 'البيانات الأساسية (أصناف/مستودعات/وحدات/أصول)', group: 'الإمداد' },
  { key: 'supply.cables', label: 'البرقيات الصادرة والواردة', group: 'الإمداد' },
  { key: 'supply.archive', label: 'الأرشيف الإلكتروني', group: 'الإمداد' },
  { key: 'supply.personnel', label: 'القوة البشرية للإمداد', group: 'الارتباطات' },
  { key: 'supply.linkages', label: 'المالية والعهد والعقود والتسليح', group: 'الارتباطات' },
  { key: 'supply.audit', label: 'سجل النشاط ومركز القيادة والرقابة', group: 'الرقابة' },
  { key: 'supply.settings', label: 'الإعدادات العامة وتصميم النماذج', group: 'النظام' },
  { key: 'fuel.dashboard', label: 'لوحة المحروقات', group: 'المحروقات' },
  { key: 'fuel.moves', label: 'حركة المحروقات (صرف/توريد/تحويل)', group: 'المحروقات' },
  { key: 'fuel.allocations', label: 'تفريدة المحروقات والمخصصات', group: 'المحروقات' },
  { key: 'fuel.stocktake', label: 'جرد المحروقات', group: 'المحروقات' },
  { key: 'fuel.reports', label: 'تقارير المحروقات والمركبات', group: 'المحروقات' },
  { key: 'fuel.data', label: 'البيانات الأساسية للمحروقات', group: 'المحروقات' },
  { key: 'fuel.settings', label: 'إعدادات قسم المحروقات', group: 'المحروقات' },
];

export interface RoleTemplate {
  id: string;
  name: string;
  category: 'functional' | 'military';
  description: string;
  permissions: string[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  // 7 Functional Templates
  {
    id: 'tpl_data_entry',
    name: 'مدخل بيانات',
    category: 'functional',
    description: 'تسجيل الحركات اليومية والتفريدة والبرقيات دون اعتماد أو إعدادات',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.moves.write', 'supply.daily', 'supply.documents'],
  },
  {
    id: 'tpl_storekeeper',
    name: 'أمين مخزن',
    category: 'functional',
    description: 'إدارة الاستلام والصرف والتحويل والجرد وتقارير الأرصدة',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.moves.write', 'supply.orders', 'supply.documents', 'supply.stocktake', 'supply.reports'],
  },
  {
    id: 'tpl_supply_officer',
    name: 'ركن إمداد',
    category: 'functional',
    description: 'إشراف كامل على الإمداد والتموين والوجبات وحساب المعسكرات',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.moves.write', 'supply.orders', 'supply.documents', 'supply.daily', 'supply.stocktake', 'supply.campAccounts', 'supply.reports', 'supply.data', 'supply.cables', 'supply.archive'],
  },
  {
    id: 'tpl_fuel_keeper',
    name: 'أمين محروقات',
    category: 'functional',
    description: 'صرف وتوريد وجرد المحروقات ومتابعة المركبات',
    permissions: ['space.fuel', 'fuel.dashboard', 'fuel.moves', 'fuel.allocations', 'fuel.stocktake', 'fuel.reports', 'fuel.data'],
  },
  {
    id: 'tpl_finance',
    name: 'المالية',
    category: 'functional',
    description: 'إدارة العهد المالية والإخلاءات وعقود الشراء ومسير العهد وسندات القبض',
    permissions: ['space.supply', 'supply.dashboard', 'supply.linkages', 'supply.reports', 'supply.archive', 'supply.documents'],
  },
  {
    id: 'tpl_office_mgr',
    name: 'مدير مكتب',
    category: 'functional',
    description: 'إدارة البرقيات والأرشيف والقوة البشرية والمستندات',
    permissions: ['space.supply', 'supply.dashboard', 'supply.cables', 'supply.archive', 'supply.personnel', 'supply.documents', 'supply.reports'],
  },
  {
    id: 'tpl_viewer',
    name: 'مطّلع',
    category: 'functional',
    description: 'قراءة الأرصدة والتقارير والمستندات دون صلاحية تعديل',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.documents', 'supply.reports'],
  },
  // 9 Military Position Templates
  {
    id: 'mil_chief',
    name: 'رئيس الشعبة',
    category: 'military',
    description: 'صلاحيات قيادية كاملة على الإمداد والمحروقات والرقابة والارتباطات',
    permissions: PERM_CATALOG.map((p) => p.key),
  },
  {
    id: 'mil_deputy',
    name: 'نائب رئيس الشعبة',
    category: 'military',
    description: 'صلاحيات تنفيذية ورقابية شاملة للإمداد والمحروقات',
    permissions: PERM_CATALOG.filter((p) => p.key !== 'supply.settings').map((p) => p.key),
  },
  {
    id: 'mil_camp_supply',
    name: 'ركن إمداد معسكر',
    category: 'military',
    description: 'متابعة تفريدة المعسكر والاستحقاق والوجبات وحساب المعسكر',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.moves.write', 'supply.orders', 'supply.daily', 'supply.campAccounts', 'supply.reports', 'supply.documents'],
  },
  {
    id: 'mil_div_fuel',
    name: 'مسؤول محروقات الفرقة',
    category: 'military',
    description: 'إشراف كامل على قطاع المحروقات وتفريدات الوحدات وإعدادات المحروقات',
    permissions: ['space.fuel', 'fuel.dashboard', 'fuel.moves', 'fuel.allocations', 'fuel.stocktake', 'fuel.reports', 'fuel.data', 'fuel.settings'],
  },
  {
    id: 'mil_camp_fuel',
    name: 'أمين محروقات معسكر',
    category: 'military',
    description: 'صرف وتوريد وجرد محروقات المعسكر المخصص',
    permissions: ['space.fuel', 'fuel.dashboard', 'fuel.moves', 'fuel.stocktake', 'fuel.reports'],
  },
  {
    id: 'mil_main_wh',
    name: 'أمين مخازن الإمداد الرئيسي',
    category: 'military',
    description: 'إدارة المخزن الرئيسي والاستلام من الموردين والتحويل للمعسكرات',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.moves.write', 'supply.orders', 'supply.documents', 'supply.stocktake', 'supply.reports', 'supply.data'],
  },
  {
    id: 'mil_branch_wh',
    name: 'أمين مخزن فرعي',
    category: 'military',
    description: 'تشغيل المخزن الفرعي واستلام التحويلات وصرفها للوحدات',
    permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read', 'supply.moves.write', 'supply.documents', 'supply.stocktake', 'supply.reports'],
  },
  {
    id: 'mil_branch_office',
    name: 'مدير مكتب الشعبة',
    category: 'military',
    description: 'إدارة البرقيات والأرشيف الإلكتروني والقوة البشرية والتسليح',
    permissions: ['space.supply', 'supply.dashboard', 'supply.cables', 'supply.archive', 'supply.personnel', 'supply.linkages', 'supply.documents'],
  },
  {
    id: 'mil_sub_office',
    name: 'مدير مكتب فرع',
    category: 'military',
    description: 'البرقيات والأرشيف ومتابعة الأفراد على مستوى الفرع',
    permissions: ['space.supply', 'supply.dashboard', 'supply.cables', 'supply.archive', 'supply.personnel', 'supply.documents'],
  },
];

export function hasSysPerm(user: User | null, perm: SysPerm): boolean {
  if (!user || !user.active || !user.approved) return false;
  return user.role === 'owner' && Boolean(perm);
}

export function isSectionBlocked(user: User | null, section: SectionBlockKey): boolean {
  if (!user) return true; // Fail-Closed
  if (user.role === 'owner') return false;
  return user.sectionBlocked.includes(section);
}

export function hasPerm(user: User | null, perm: string): boolean {
  if (!user || !user.active || !user.approved) return false;
  if (user.role === 'owner') return true;
  if (perm.startsWith('sys.')) return false;

  // Check section blocks (Fail-Closed)
  if (perm.startsWith('space.supply') || perm.startsWith('supply.')) {
    if (isSectionBlocked(user, 'supply')) return false;
  }
  if (perm.startsWith('space.fuel') || perm.startsWith('fuel.')) {
    if (isSectionBlocked(user, 'fuel')) return false;
  }
  if (perm === 'supply.audit' && isSectionBlocked(user, 'admin.audit')) return false;
  if (perm === 'supply.settings' && isSectionBlocked(user, 'admin.settings')) return false;

  if (user.role === 'admin') return true;
  return user.permissions.includes(perm);
}

export function canAccessWarehouse(user: User | null, warehouseName: string): boolean {
  if (!user) return false;
  if (user.role === 'owner' || user.warehouseScope === 'ALL') return true;
  return user.warehouseScope.includes(warehouseName);
}

export function filterAllowedWarehouses<T extends { name: string }>(
  user: User | null,
  warehouses: T[]
): T[] {
  if (!user) return [];
  if (user.role === 'owner' || user.warehouseScope === 'ALL') return warehouses;
  return warehouses.filter((w) => user.warehouseScope.includes(w.name));
}

/**
 * MakerChecker: prevents document/order creator from approving their own record
 * unless user is explicitly acting in Owner emergency override.
 */
export function validateMakerChecker(params: {
  createdBy: string;
  actorName: string;
  actorRole: User['role'];
  allowOwnerSelfApprove?: boolean;
}): { allowed: boolean; reason: string } {
  const creator = params.createdBy.trim();
  const actor = params.actorName.trim();
  if (!creator || !actor) return { allowed: true, reason: '' };
  if (creator === actor) {
    if (params.actorRole === 'owner' && params.allowOwnerSelfApprove) {
      return { allowed: true, reason: '' };
    }
    return {
      allowed: false,
      reason: 'سياسة الفصل بين المهام (Maker-Checker): لا يجوز لمنشئ السند أو الطلبية اعتماده لنفسه.',
    };
  }
  return { allowed: true, reason: '' };
}

export function requiresOwnerESign(params: {
  eSignEnabled: boolean;
  risk: 'normal' | 'sensitive' | 'high' | 'critical';
}): boolean {
  return params.eSignEnabled && (params.risk === 'high' || params.risk === 'critical');
}
