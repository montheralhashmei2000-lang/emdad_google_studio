// OwnerKey: Embedded compiled-in ECDSA P-256 public key + compromised key revocation guard

export const OWNER_PUBLIC_KEY_B64 =
  'IMDAD-P256-OWNER-ROOT-V1-MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEimdadRootSupplyKey2026AuthVerifyP256==';

// Revoked / compromised legacy public keys blocked from verifying new activations or owner decisions
export const COMPROMISED_OWNER_KEYS: ReadonlySet<string> = new Set([
  'IMDAD-COMPROMISED-DEV-TEST-KEY-2024',
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0000000000000000000000000000000000',
]);

export const OwnerKey = {
  publicKey: OWNER_PUBLIC_KEY_B64,

  isConfigured(): boolean {
    return this.publicKey.trim().length > 0 && !this.isCompromised(this.publicKey);
  },

  isCompromised(key: string): boolean {
    return COMPROMISED_OWNER_KEYS.has(key.trim());
  },

  assertReleaseConfigured(isProd: boolean): void {
    if (isProd && !this.isConfigured()) {
      throw new Error(
        'حارس الإقلاع الأمني: المفتاح العام للمالك (OwnerKey.publicKey) غير مهيأ أو محظور في إصدار الإنتاج.'
      );
    }
  },
};
