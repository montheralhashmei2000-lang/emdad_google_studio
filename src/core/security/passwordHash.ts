// PasswordHash: Non-blocking WebCrypto PBKDF2 verification & transparent legacy hash upgrade to 310,000 iterations

import { constantTimeEquals, Pbkdf2, PBKDF2_DEFAULT_ITERATIONS, PBKDF2_LEGACY_THRESHOLD } from './pbkdf2';

export const PasswordHash = {
  targetIterations: PBKDF2_DEFAULT_ITERATIONS,

  needsUpgrade(iterations: number | undefined): boolean {
    return !iterations || iterations < PBKDF2_LEGACY_THRESHOLD;
  },

  async hash(
    password: string,
    iterations = PBKDF2_DEFAULT_ITERATIONS
  ): Promise<{ saltHex: string; hashHex: string; iterations: number }> {
    return Pbkdf2.derive(password, undefined, iterations);
  },

  async verify(
    password: string,
    saltHex: string,
    expectedHashHex: string,
    iterations = PBKDF2_DEFAULT_ITERATIONS
  ): Promise<boolean> {
    if (!saltHex || !expectedHashHex) return false;
    const { hashHex } = await Pbkdf2.derive(password, saltHex, iterations);
    return constantTimeEquals(hashHex, expectedHashHex);
  },

  /**
   * Verifies password and returns upgraded 310k-iteration hash credentials if account used a legacy count (e.g. 10k or 45k)
   */
  async verifyAndMaybeUpgrade(
    password: string,
    saltHex: string,
    expectedHashHex: string,
    iterations: number
  ): Promise<{
    valid: boolean;
    upgraded?: { saltHex: string; hashHex: string; iterations: number };
  }> {
    const valid = await this.verify(password, saltHex, expectedHashHex, iterations);
    if (!valid) return { valid: false };
    if (this.needsUpgrade(iterations)) {
      const upgraded = await this.hash(password, PBKDF2_DEFAULT_ITERATIONS);
      return { valid: true, upgraded };
    }
    return { valid: true };
  },
};
