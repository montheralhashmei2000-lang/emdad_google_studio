// AuthService: Session authentication, brute-force lockout, auto-upgrade PBKDF2 to 310k iterations, and live userVersion sync

import { PasswordHash } from './passwordHash';
import type { User } from '../../domain/types';

export interface AuthAttemptResult {
  ok: boolean;
  error?: string;
  user?: User;
  upgradedHash?: { saltHex: string; hashHex: string; iterations: number };
  failedAttemptsUpdate?: { userId: string; failedAttempts: number; lockedUntil: string | null };
}

export function computeUserVersion(user: User | null): string {
  if (!user) return 'none';
  return [
    user.id,
    user.role,
    String(user.active),
    String(user.approved),
    [...user.permissions].sort().join(','),
    [...user.sectionBlocked].sort().join(','),
    user.warehouseScope === 'ALL' ? 'ALL' : [...user.warehouseScope].sort().join(','),
  ].join('|');
}

export const AuthService = {
  needsBootstrap(users: User[]): boolean {
    return users.length === 0;
  },

  computeUserVersion,

  hasUserVersionChanged(prev: User | null, next: User | null): boolean {
    if (!prev || !next) return false;
    return computeUserVersion(prev) !== computeUserVersion(next);
  },

  async authenticate(users: User[], usernameRaw: string, password: string): Promise<AuthAttemptResult> {
    const uname = usernameRaw.trim().toLowerCase();
    if (!uname) {
      return { ok: false, error: 'أدخل اسم المستخدم أولاً' };
    }
    const user = users.find((u) => u.username.toLowerCase() === uname);
    if (!user) {
      return { ok: false, error: 'اسم المستخدم غير موجود في السجل المحلي' };
    }
    if (!user.active || !user.approved) {
      return { ok: false, error: 'هذا الحساب موقوف أو بانتظار اعتماد المالك' };
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      return { ok: false, error: 'الحساب مقفل مؤقتاً بسبب محاولات دخول متكررة خاطئة' };
    }

    const res = await PasswordHash.verifyAndMaybeUpgrade(
      password,
      user.saltHex,
      user.hashHex,
      user.iterations
    );
    if (!res.valid) {
      const attempts = user.failedAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60000).toISOString() : null;
      return {
        ok: false,
        error: `كلمة المرور غير صحيحة (محاولة ${attempts} من 5)`,
        failedAttemptsUpdate: { userId: user.id, failedAttempts: attempts, lockedUntil },
      };
    }

    return {
      ok: true,
      user,
      upgradedHash: res.upgraded,
    };
  },
};
