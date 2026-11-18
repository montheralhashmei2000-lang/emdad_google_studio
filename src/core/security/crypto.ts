// Cryptographic Security Engine (WebCrypto PBKDF2 310k, ECDSA P-256 ESign & Device Activation, AES-256-GCM Backup, SHA-256, Code-128 SVG)

import { constantTimeEquals } from './pbkdf2';

export const Ids = {
  next(prefix = 'id'): string {
    const rnd = crypto.getRandomValues(new Uint8Array(8));
    const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${Date.now().toString(36)}_${hex}`;
  },
  natural(...parts: string[]): string {
    return parts.map((p) => p.trim()).join('__');
  },
};

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}

export async function pbkdf2Hash(
  password: string,
  saltHex?: string,
  iterations = 310000
): Promise<{ saltHex: string; hashHex: string; iterations: number }> {
  const saltBytes = saltHex ? new Uint8Array(fromHex(saltHex)) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return {
    saltHex: toHex(saltBytes),
    hashHex: toHex(derived),
    iterations,
  };
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHashHex: string,
  iterations = 310000
): Promise<boolean> {
  if (!saltHex || !expectedHashHex) return false;
  const { hashHex } = await pbkdf2Hash(password, saltHex, iterations);
  return constantTimeEquals(hashHex, expectedHashHex);
}

// Device ID: 8 chars + 1 checksum digit
export function generateDeviceId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  let body = '';
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const idx = rnd[i] % alphabet.length;
    body += alphabet[idx];
    sum += idx * (i + 1);
  }
  const check = alphabet[sum % alphabet.length];
  return `${body}-${check}`;
}

export function verifyDeviceIdChecksum(deviceId: string): boolean {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = deviceId.trim().toUpperCase().split('-');
  if (parts.length !== 2 || parts[0].length !== 8 || parts[1].length !== 1) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const idx = alphabet.indexOf(parts[0][i]);
    if (idx < 0) return false;
    sum += idx * (i + 1);
  }
  return alphabet[sum % alphabet.length] === parts[1];
}

// ECDSA P-256 Keypair stored locally for ESign (IMD2|...) & Device Activation (IMDACT2...)
const KEYPAIR_STORAGE_KEY = 'emdad_ecdsa_p256_jwk_v1';
const memoryStorage = new Map<string, string>();

function readSafeStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {
    // fallback
  }
  return memoryStorage.get(key) ?? null;
}

function writeSafeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // fallback
  }
  memoryStorage.set(key, value);
}

interface StoredKeyPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

export async function getOrCreateOwnerSigningKeys(): Promise<StoredKeyPair> {
  const existing = readSafeStorage(KEYPAIR_STORAGE_KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as StoredKeyPair;
    } catch {
      // regenerate
    }
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const stored = { publicJwk, privateJwk };
  writeSafeStorage(KEYPAIR_STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

export async function exportEscrowSigningKeys(passphrase: string): Promise<string> {
  const keys = await getOrCreateOwnerSigningKeys();
  const payload = JSON.stringify({
    kind: 'IMDAD_KEY_ESCROW_V1',
    exportedAt: new Date().toISOString(),
    keys,
  });
  return encryptBackupJson(payload, passphrase);
}

export async function restoreEscrowSigningKeys(
  envelopeStr: string,
  passphrase: string
): Promise<{ publicJwk: JsonWebKey }> {
  const plain = await decryptBackupJson(envelopeStr, passphrase);
  const parsed = JSON.parse(plain) as {
    kind?: string;
    keys?: StoredKeyPair;
  };
  if (parsed.kind !== 'IMDAD_KEY_ESCROW_V1' || !parsed.keys?.publicJwk || !parsed.keys?.privateJwk) {
    throw new Error('ملف استرداد المفتاح غير صالح');
  }
  writeSafeStorage(KEYPAIR_STORAGE_KEY, JSON.stringify(parsed.keys));
  return { publicJwk: parsed.keys.publicJwk };
}

export async function signDocumentPayload(payload: {
  refNo: string;
  date: string;
  warehouse: string;
  totalQty: number;
  signer: string;
}): Promise<string> {
  const keys = await getOrCreateOwnerSigningKeys();
  const privKey = await crypto.subtle.importKey(
    'jwk',
    keys.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const canonical = `${payload.refNo}|${payload.date}|${payload.warehouse}|${payload.totalQty}|${payload.signer}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(canonical)
  );
  const sigHex = toHex(sig).slice(0, 32).toUpperCase();
  return `IMD2|${canonical}|${sigHex}`;
}

export async function signFullToken(canonical: string): Promise<string> {
  const keys = await getOrCreateOwnerSigningKeys();
  const privKey = await crypto.subtle.importKey(
    'jwk',
    keys.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(canonical)
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64;
}

export async function verifyFullToken(canonical: string, sigB64: string): Promise<boolean> {
  try {
    const keys = await getOrCreateOwnerSigningKeys();
    const pubKey = await crypto.subtle.importKey(
      'jwk',
      keys.publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const bin = atob(sigB64);
    const sigBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) sigBytes[i] = bin.charCodeAt(i);
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pubKey,
      sigBytes,
      new TextEncoder().encode(canonical)
    );
  } catch {
    return false;
  }
}

export async function createActivationCertificate(deviceId: string, issuedTo: string): Promise<string> {
  const issuedAt = new Date().toISOString().slice(0, 10);
  const body = `${deviceId}|${issuedTo}|${issuedAt}`;
  const sig = await signFullToken(body);
  return `IMDACT2.${btoa(unescape(encodeURIComponent(body)))}.${sig}`;
}

export async function verifyActivationCertificate(token: string): Promise<{
  valid: boolean;
  deviceId?: string;
  issuedTo?: string;
  issuedAt?: string;
}> {
  if (!token.startsWith('IMDACT2.')) return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };
  try {
    const body = decodeURIComponent(escape(atob(parts[1])));
    const ok = await verifyFullToken(body, parts[2]);
    const [deviceId, issuedTo, issuedAt] = body.split('|');
    return { valid: ok, deviceId, issuedTo, issuedAt };
  } catch {
    return { valid: false };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

// AES-256-GCM Encrypted Backup
export async function encryptBackupJson(jsonString: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(jsonString)
  );
  return JSON.stringify({
    format: 'IMDAD_BACKUP_AES256GCM_V1',
    saltHex: toHex(salt),
    ivHex: toHex(iv),
    cipherB64: bytesToBase64(new Uint8Array(ct)),
  });
}

export async function decryptBackupJson(envelopeStr: string, passphrase: string): Promise<string> {
  const env = JSON.parse(envelopeStr) as {
    format: string;
    saltHex: string;
    ivHex: string;
    cipherB64: string;
  };
  if (env.format !== 'IMDAD_BACKUP_AES256GCM_V1') {
    throw new Error('تنسيق ملف النسخة الاحتياطية غير مدعوم');
  }
  const salt = new Uint8Array(fromHex(env.saltHex));
  const iv = new Uint8Array(fromHex(env.ivHex));
  const bin = atob(env.cipherB64);
  const ct = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) ct[i] = bin.charCodeAt(i);

  const keyMat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(plain);
}

// Deterministic visual Code-128 style bar pattern generator for thermal labels
export function generateBarcodeBars(code: string): number[] {
  const bars: number[] = [2, 1, 2, 2, 1, 1]; // start guard
  for (let i = 0; i < code.length; i++) {
    const ch = code.charCodeAt(i);
    bars.push((ch % 3) + 1, ((ch >> 2) % 2) + 1, ((ch >> 4) % 3) + 1, 1);
  }
  bars.push(2, 1, 1, 2, 2); // stop guard
  return bars;
}
