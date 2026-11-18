// DeviceActivation: Master/Branch device roles, branch scoping, expiry, and signed revocations synced across devices

import {
  generateDeviceId,
  signFullToken,
  verifyActivationCertificate,
  verifyDeviceIdChecksum,
  verifyFullToken,
} from './crypto';

export type DeviceRole = 'master' | 'branch';

export interface ActivationPayload {
  valid: boolean;
  deviceId: string;
  issuedTo: string;
  issuedAt: string;
  role: DeviceRole;
  branch: string;
  expiresAt: string; // '' = perpetual
  expired: boolean;
  revoked: boolean;
  reason?: string;
}

export interface DeviceRevocationRecord {
  id: string;
  deviceId: string;
  reason: string;
  revokedAt: string;
  revokedBy: string;
  sig: string;
}

const REVOCATIONS_STORAGE_KEY = 'emdad_device_revocations_v1';
let revocationsMem: DeviceRevocationRecord[] = [];

export function loadDeviceRevocations(): DeviceRevocationRecord[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(REVOCATIONS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DeviceRevocationRecord[]) : [];
    }
  } catch {
    // ignore
  }
  return revocationsMem;
}

export function saveDeviceRevocations(list: DeviceRevocationRecord[]): void {
  revocationsMem = list;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(REVOCATIONS_STORAGE_KEY, JSON.stringify(list));
  }
}

export const DeviceActivation = {
  generateDeviceId,
  verifyDeviceIdChecksum,

  /**
   * Issues an IMDACT2 signed activation token encoding DeviceID, org, date, role (master|branch), branch, expiresAt
   */
  async issueCertificate(params: {
    deviceId: string;
    issuedTo: string;
    role?: DeviceRole;
    branch?: string;
    expiresAt?: string;
  }): Promise<string> {
    const issuedAt = new Date().toISOString().slice(0, 10);
    const role: DeviceRole = params.role ?? 'master';
    const branch = (params.branch ?? '').trim();
    const expiresAt = (params.expiresAt ?? '').trim();
    const body = `${params.deviceId}|${params.issuedTo}|${issuedAt}|${role}|${branch}|${expiresAt}`;
    const sig = await signFullToken(body);
    return `IMDACT2.${btoa(unescape(encodeURIComponent(body)))}.${sig}`;
  },

  async verifyToken(
    token: string,
    revocations: DeviceRevocationRecord[] = loadDeviceRevocations()
  ): Promise<ActivationPayload> {
    if (!token || !token.startsWith('IMDACT2.')) {
      return {
        valid: false,
        deviceId: '',
        issuedTo: '',
        issuedAt: '',
        role: 'branch',
        branch: '',
        expiresAt: '',
        expired: false,
        revoked: false,
        reason: 'لا توجد شهادة تفعيل صالحة',
      };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return {
        valid: false,
        deviceId: '',
        issuedTo: '',
        issuedAt: '',
        role: 'branch',
        branch: '',
        expiresAt: '',
        expired: false,
        revoked: false,
        reason: 'صيغة شهادة التفعيل غير مكتملة',
      };
    }

    try {
      const body = decodeURIComponent(escape(atob(parts[1])));
      const ok = await verifyFullToken(body, parts[2]);
      if (!ok) {
        // Fallback to legacy verifier helper for compatibility
        const legacy = await verifyActivationCertificate(token);
        if (!legacy.valid) {
          return {
            valid: false,
            deviceId: '',
            issuedTo: '',
            issuedAt: '',
            role: 'branch',
            branch: '',
            expiresAt: '',
            expired: false,
            revoked: false,
            reason: 'توقيع شهادة التفعيل غير صالح',
          };
        }
      }

      const [deviceId = '', issuedTo = '', issuedAt = '', rawRole = 'master', branch = '', expiresAt = ''] =
        body.split('|');
      const role: DeviceRole = rawRole === 'branch' ? 'branch' : 'master';
      const today = new Date().toISOString().slice(0, 10);
      const expired = Boolean(expiresAt && expiresAt < today);
      const rev = revocations.find((r) => r.deviceId.toUpperCase() === deviceId.toUpperCase());
      const revoked = Boolean(rev);

      return {
        valid: !expired && !revoked,
        deviceId,
        issuedTo,
        issuedAt,
        role,
        branch,
        expiresAt,
        expired,
        revoked,
        reason: revoked
          ? `تم إلغاء تفعيل الجهاز: ${rev?.reason || 'بقرار المالك'}`
          : expired
          ? `انتهت صلاحية تفعيل الجهاز بتاريخ ${expiresAt}`
          : undefined,
      };
    } catch {
      return {
        valid: false,
        deviceId: '',
        issuedTo: '',
        issuedAt: '',
        role: 'branch',
        branch: '',
        expiresAt: '',
        expired: false,
        revoked: false,
        reason: 'تعذّر قراءة شهادة التفعيل',
      };
    }
  },

  async createRevocation(params: {
    deviceId: string;
    reason: string;
    revokedBy: string;
  }): Promise<DeviceRevocationRecord> {
    const revokedAt = new Date().toISOString();
    const canonical = `REVOKE|${params.deviceId.toUpperCase()}|${revokedAt}|${params.reason}`;
    const sig = await signFullToken(canonical);
    const rec: DeviceRevocationRecord = {
      id: `rev_${Date.now().toString(36)}`,
      deviceId: params.deviceId.toUpperCase(),
      reason: params.reason.trim() || 'إلغاء إداري',
      revokedAt,
      revokedBy: params.revokedBy,
      sig,
    };
    const next = [rec, ...loadDeviceRevocations().filter((x) => x.deviceId !== rec.deviceId)];
    saveDeviceRevocations(next);
    return rec;
  },
};
