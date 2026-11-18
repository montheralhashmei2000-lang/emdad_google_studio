// BiometricService: Platform authenticator availability check & wrapped local quick-unlock binding

const BIOMETRIC_PREF_KEY = 'emdad_biometric_binding_v1';

export interface BiometricBinding {
  enabled: boolean;
  userId: string;
  username: string;
  boundAt: string;
}

export const BiometricService = {
  async isPlatformSupported(): Promise<boolean> {
    if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  getBinding(): BiometricBinding | null {
    try {
      const raw = localStorage.getItem(BIOMETRIC_PREF_KEY);
      return raw ? (JSON.parse(raw) as BiometricBinding) : null;
    } catch {
      return null;
    }
  },

  enableForUser(userId: string, username: string): BiometricBinding {
    const binding: BiometricBinding = {
      enabled: true,
      userId,
      username,
      boundAt: new Date().toISOString(),
    };
    localStorage.setItem(BIOMETRIC_PREF_KEY, JSON.stringify(binding));
    return binding;
  },

  disable(): void {
    localStorage.removeItem(BIOMETRIC_PREF_KEY);
  },
};
