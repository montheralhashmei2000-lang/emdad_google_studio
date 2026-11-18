// ESign: Isolated commander ECDSA P-256 signing keypair & IMD2|<docRef>|<ts>|<sig> QR verification

import { bytesToHex } from './pbkdf2';

const ESIGN_STORAGE_KEY = 'imdad_esign_p256_jwk_v1';
const esignMem = new Map<string, string>();

interface StoredESignPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  createdAt: string;
}

export async function getOrCreateESignPair(): Promise<StoredESignPair> {
  const raw =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(ESIGN_STORAGE_KEY)
      : esignMem.get(ESIGN_STORAGE_KEY) ?? null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredESignPair;
      if (parsed.publicJwk && parsed.privateJwk) return parsed;
    } catch {
      // regenerate cleanly
    }
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const stored: StoredESignPair = {
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    createdAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(stored);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ESIGN_STORAGE_KEY, serialized);
  } else {
    esignMem.set(ESIGN_STORAGE_KEY, serialized);
  }
  return stored;
}

export const ESign = {
  async hasKey(): Promise<boolean> {
    return typeof localStorage !== 'undefined'
      ? Boolean(localStorage.getItem(ESIGN_STORAGE_KEY))
      : esignMem.has(ESIGN_STORAGE_KEY);
  },

  async resetKey(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ESIGN_STORAGE_KEY);
    } else {
      esignMem.delete(ESIGN_STORAGE_KEY);
    }
    await getOrCreateESignPair();
  },

  /**
   * Signs an official voucher/document and issues IMD2|<docRef>|<ts>|<sig> QR token
   */
  async signVoucher(params: {
    docRef: string;
    date?: string;
    warehouse?: string;
    totalQty?: number;
    ts?: number;
  }): Promise<string> {
    const pair = await getOrCreateESignPair();
    const privKey = await crypto.subtle.importKey(
      'jwk',
      pair.privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const ts = params.ts ?? Math.floor(Date.now() / 1000);
    const canonical = `${params.docRef}|${params.date ?? ''}|${params.warehouse ?? ''}|${params.totalQty ?? 0}|${ts}`;
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privKey,
      new TextEncoder().encode(canonical)
    );
    const sigHex = bytesToHex(sig).slice(0, 32).toUpperCase();
    return `IMD2|${params.docRef}|${ts}|${sigHex}|${params.date ?? ''}|${params.warehouse ?? ''}|${params.totalQty ?? 0}`;
  },

  parseQrToken(token: string): {
    validFormat: boolean;
    docRef: string;
    ts: number;
    sig: string;
    date: string;
    warehouse: string;
    totalQty: number;
  } {
    const parts = token.trim().split('|');
    if (parts[0] !== 'IMD2' || parts.length < 4) {
      return { validFormat: false, docRef: '', ts: 0, sig: '', date: '', warehouse: '', totalQty: 0 };
    }
    return {
      validFormat: true,
      docRef: parts[1] ?? '',
      ts: Number(parts[2] ?? 0),
      sig: parts[3] ?? '',
      date: parts[4] ?? '',
      warehouse: parts[5] ?? '',
      totalQty: Number(parts[6] ?? 0),
    };
  },
};
