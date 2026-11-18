// Perm: Screen-level ergonomic permission and scope guard facade

import {
  canAccessWarehouse,
  hasPerm,
  hasSysPerm,
  isSectionBlocked,
  type SectionBlockKey,
  type SysPerm,
} from '../../domain/accessControl';
import type { User } from '../../domain/types';

export const Perm = {
  has(user: User | null, perm: string): boolean {
    return hasPerm(user, perm);
  },

  writable(user: User | null, writePerm: string): boolean {
    return Boolean(user && user.active && user.approved && hasPerm(user, writePerm));
  },

  sys(user: User | null, perm: SysPerm): boolean {
    return hasSysPerm(user, perm);
  },

  blocked(user: User | null, section: SectionBlockKey): boolean {
    return isSectionBlocked(user, section);
  },

  guard(user: User | null, perm: string, onDeny?: (msg: string) => void): boolean {
    if (this.has(user, perm)) return true;
    onDeny?.(`صلاحية مطلوبة (${perm}): ليس لديك إذن لتنفيذ هذا الإجراء.`);
    return false;
  },

  guardSys(user: User | null, perm: SysPerm, onDeny?: (msg: string) => void): boolean {
    if (this.sys(user, perm)) return true;
    onDeny?.(`عملية محصورة بالمالك (${perm}).`);
    return false;
  },

  canWh(user: User | null, warehouseName: string): boolean {
    return canAccessWarehouse(user, warehouseName);
  },
};
