// WarehouseScope & SysNotice: Warehouse-scoped query helpers and centralized security notices

import { canAccessWarehouse, filterAllowedWarehouses } from '../../domain/accessControl';
import type { User } from '../../domain/types';

export const WarehouseScope = {
  canAccess: canAccessWarehouse,
  filterList: filterAllowedWarehouses,
  filterRecordsByWarehouse<T extends { warehouse: string }>(user: User | null, rows: T[]): T[] {
    if (!user) return [];
    if (user.role === 'owner' || user.warehouseScope === 'ALL') return rows;
    return rows.filter((r) => !r.warehouse || user.warehouseScope.includes(r.warehouse));
  },
};

export interface SecurityNoticeItem {
  id: string;
  code: 'HASH_UPGRADED' | 'USER_VERSION_SYNCED' | 'OWNER_SIG_WARN' | 'ACTIVATION_EXPIRY';
  message: string;
  tone: 'info' | 'warn' | 'danger';
  createdAt: string;
}

const noticeListeners = new Set<(item: SecurityNoticeItem) => void>();

export const SysNotice = {
  emit(
    code: SecurityNoticeItem['code'],
    message: string,
    tone: SecurityNoticeItem['tone'] = 'info'
  ): void {
    const item: SecurityNoticeItem = {
      id: `sn_${Date.now().toString(36)}`,
      code,
      message,
      tone,
      createdAt: new Date().toISOString(),
    };
    noticeListeners.forEach((fn) => fn(item));
  },

  subscribe(listener: (item: SecurityNoticeItem) => void): () => void {
    noticeListeners.add(listener);
    return () => {
      noticeListeners.delete(listener);
    };
  },
};
