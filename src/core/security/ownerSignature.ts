// OwnerSignature: Cryptographic ECDSA P-256 signatures for sensitive user decisions (r: role, s: section_blocked, c: creds/scope)

import { signFullToken, verifyFullToken } from './crypto';
import type { User } from '../../domain/types';

export interface OwnerSigBundle {
  r?: string; // role elevation: userId|role|updatedAtSec
  s?: string; // section unblock: userId|sectionBlocked|updatedAtSec
  c?: string; // privileged admin/owner credentials + perms + warehouseScope
  v?: number;
}

function toUpdatedAtSec(isoOrSec: string): string {
  if (!isoOrSec) return '0';
  const ms = Date.parse(isoOrSec);
  return Number.isFinite(ms) ? String(Math.floor(ms / 1000)) : '0';
}

function roleCanonical(user: Pick<User, 'id' | 'role' | 'updatedAt'>): string {
  return `r|${user.id}|${user.role}|${toUpdatedAtSec(user.updatedAt)}`;
}

function sectionCanonical(user: Pick<User, 'id' | 'sectionBlocked' | 'updatedAt'>): string {
  const sorted = [...user.sectionBlocked].sort().join(',');
  return `s|${user.id}|${sorted}|${toUpdatedAtSec(user.updatedAt)}`;
}

function credCanonical(
  user: Pick<User, 'id' | 'username' | 'role' | 'permissions' | 'warehouseScope' | 'updatedAt'>
): string {
  const perms = [...user.permissions].sort().join(',');
  const scope = user.warehouseScope === 'ALL' ? 'ALL' : [...user.warehouseScope].sort().join(',');
  return `c|${user.id}|${user.username}|${user.role}|${perms}|${scope}|${toUpdatedAtSec(user.updatedAt)}`;
}

export const OwnerSignature = {
  parse(ownerSigRaw: string): OwnerSigBundle | null {
    if (!ownerSigRaw || !ownerSigRaw.trim().startsWith('{')) return null;
    try {
      return JSON.parse(ownerSigRaw) as OwnerSigBundle;
    } catch {
      return null;
    }
  },

  async signUserDecisions(user: User): Promise<string> {
    const r = await signFullToken(roleCanonical(user));
    const s = await signFullToken(sectionCanonical(user));
    const c =
      user.role === 'owner' || user.role === 'admin'
        ? await signFullToken(credCanonical(user))
        : undefined;
    const bundle: OwnerSigBundle = c ? { v: 2, r, s, c } : { v: 2, r, s };
    return JSON.stringify(bundle);
  },

  async verifyUserDecisions(user: User): Promise<{
    signed: boolean;
    roleValid: boolean;
    sectionValid: boolean;
    credValid: boolean;
  }> {
    const bundle = this.parse(user.ownerSig);
    if (!bundle) {
      return { signed: false, roleValid: false, sectionValid: false, credValid: false };
    }
    const roleValid = bundle.r ? await verifyFullToken(roleCanonical(user), bundle.r) : false;
    const sectionValid = bundle.s ? await verifyFullToken(sectionCanonical(user), bundle.s) : false;
    const credValid =
      user.role === 'owner' || user.role === 'admin'
        ? Boolean(bundle.c && (await verifyFullToken(credCanonical(user), bundle.c)))
        : true;
    return { signed: true, roleValid, sectionValid, credValid };
  },
};
