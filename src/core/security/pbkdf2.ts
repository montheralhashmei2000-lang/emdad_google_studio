// Pbkdf2: PBKDF2-HMAC-SHA256 (310,000 iterations default) & Constant-Time XOR Comparison

export const PBKDF2_DEFAULT_ITERATIONS = 310000;
export const PBKDF2_LEGACY_THRESHOLD = 310000;

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Constant-time string / byte comparison preventing timing side-channel leaks
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export const Pbkdf2 = {
  defaultIterations: PBKDF2_DEFAULT_ITERATIONS,

  async derive(
    password: string,
    saltHex?: string,
    iterations = PBKDF2_DEFAULT_ITERATIONS
  ): Promise<{ saltHex: string; hashHex: string; iterations: number }> {
    const saltBytes = saltHex
      ? new Uint8Array(hexToBytes(saltHex))
      : crypto.getRandomValues(new Uint8Array(16));
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
      saltHex: bytesToHex(saltBytes),
      hashHex: bytesToHex(derived),
      iterations,
    };
  },

  constantTimeEquals,
};
