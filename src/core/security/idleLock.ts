// IdleLock: Inactivity watcher controller preserving underlying workspace state during lock

export type IdleLockListener = (locked: boolean) => void;

export class IdleLockController {
  private timerId: number | null = null;
  private timeoutMs: number;
  private onLockChange: IdleLockListener;
  private boundReset: () => void;
  private active = false;

  constructor(minutes: number, onLockChange: IdleLockListener) {
    this.timeoutMs = Math.max(0, minutes) * 60 * 1000;
    this.onLockChange = onLockChange;
    this.boundReset = () => this.resetTimer();
  }

  start(): void {
    if (this.timeoutMs <= 0 || this.active || typeof window === 'undefined') return;
    this.active = true;
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    for (const ev of events) {
      window.addEventListener(ev, this.boundReset, { passive: true });
    }
    this.resetTimer();
  }

  resetTimer(): void {
    if (typeof window === 'undefined') return;
    if (this.timerId !== null) window.clearTimeout(this.timerId);
    if (this.timeoutMs > 0 && this.active) {
      this.timerId = window.setTimeout(() => {
        this.onLockChange(true);
      }, this.timeoutMs);
    }
  }

  stop(): void {
    if (!this.active || typeof window === 'undefined') return;
    this.active = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    for (const ev of events) {
      window.removeEventListener(ev, this.boundReset);
    }
  }
}
