import { describe, expect, it } from 'vitest';
import { ImdPalettes, normalizeDigits } from '../src/core/ui/imdTokens';
import { amountToArabicWords } from '../src/core/arabicWords';
import { canAccessWarehouse, hasPerm, hasSysPerm, isSectionBlocked } from '../src/domain/accessControl';
import { formatLabelSize, isValidLabelSize } from '../src/core/print/printEngine';
import type { User } from '../src/domain/types';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('UI Contrast Tokens, A11y Helpers, RBAC Fail-Closed & Arabic Formatting', () => {
  it('contrast_tokens: all 6 color palettes meet WCAG AA contrast (>= 4.5:1 text/surface & onAccent/accent)', () => {
    for (const [name, pal] of Object.entries(ImdPalettes)) {
      expect(contrastRatio(pal.text, pal.surface), `${name} text/surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(pal.onAccent, pal.accent), `${name} onAccent/accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(pal.muted, pal.surface), `${name} muted/surface`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('accessControl: Fail-Closed SectionBlock and SysPerms lock unauthorized users', () => {
    const regularUser: User = {
      id: 'u_test',
      username: 'clerk',
      name: 'موظف',
      email: 'clerk@imdad.local',
      role: 'user',
      roles: ['tpl_data_entry'],
      permissions: ['space.supply', 'supply.dashboard', 'supply.moves.read'],
      warehouseScope: ['المستودع المركزي'],
      saltHex: '',
      hashHex: '',
      iterations: 10000,
      active: true,
      approved: true,
      failedAttempts: 0,
      lockedUntil: null,
      sectionBlocked: ['supply'],
      ownerSig: '',
      createdAt: '',
      updatedAt: '',
    };
    expect(isSectionBlocked(null, 'supply')).toBe(true); // Fail-closed null user
    expect(isSectionBlocked(regularUser, 'supply')).toBe(true);
    expect(hasPerm(regularUser, 'supply.dashboard')).toBe(false); // Blocked section overrides permissions
    expect(hasSysPerm(regularUser, 'sys.users')).toBe(false);
    expect(canAccessWarehouse(regularUser, 'المستودع المركزي')).toBe(true);
    expect(canAccessWarehouse(regularUser, 'مستودع فرعي آخر')).toBe(false);
  });

  it('Arabic digits normalization, Arabic Tafkeet, and LabelSize validation work accurately', () => {
    expect(normalizeDigits('١٢٣٤٥٫٦٧')).toBe('12345.67');
    expect(amountToArabicWords(5000, 'sar')).toContain('خمسة');
    expect(isValidLabelSize(35, 25)).toBe(true);
    expect(isValidLabelSize(5, 25)).toBe(false);
    expect(formatLabelSize({ widthMm: 35, heightMm: 25 })).toBe('35×25 مم');
  });

  it('imdNumbers & imdFormat separate UI Arabic digits from Print Western digits and enforce YYYY-MM-DD without "م"', async () => {
    const { DEFAULT_NUMBER_PREFS } = await import('../src/core/ui/imdNumbers');
    const { nf, nfPrint, nfMoney, fmtDate, arDay, arDigits } = await import('../src/core/ui/imdFormat');

    expect(DEFAULT_NUMBER_PREFS.uiDigits).toBe('arabic');
    expect(DEFAULT_NUMBER_PREFS.printDigits).toBe('western');

    // UI formats Arabic-Indic digits and trims trailing quantity zeros
    expect(nf(1250.5, DEFAULT_NUMBER_PREFS)).toBe('١,٢٥٠.٥');
    expect(nf(1250.0, DEFAULT_NUMBER_PREFS)).toBe('١,٢٥٠');
    // Print formats Western digits cleanly for Excel parity
    expect(nfPrint(1250.5, DEFAULT_NUMBER_PREFS)).toBe('1,250.5');
    // Currency retains fixed 2 decimal places (never trimmed)
    expect(nfMoney(500.5, DEFAULT_NUMBER_PREFS)).toBe('٥٠٠.٥٠');
    // Date always YYYY-MM-DD with zero trailing "م"
    expect(fmtDate('2026-11-15T10:30:00Z م')).toBe('2026-11-15');
    expect(arDay('2026-11-15')).toContain('2026-11-15');
    expect(arDay('2026-11-15')).not.toContain('م ');
    expect(arDigits('2026')).toBe('٢٠٢٦');
  });

  it('ImdTable & ImdBp: switches automatically between Table (>900px) and Cards (<=900px) and sorts columns', async () => {
    const { ImdBp, ImdDensity } = await import('../src/core/ui/imdTokens');
    const {
      IMD_TABLE_BREAKPOINT_PX,
      isCompactTableWidth,
      sortTableRows,
    } = await import('../src/core/ui/tables');

    expect(IMD_TABLE_BREAKPOINT_PX).toBe(900);
    expect(ImdBp.mobileMax).toBe(900);
    expect(ImdBp.wide).toBe(1200);
    expect(isCompactTableWidth(900)).toBe(true);
    expect(isCompactTableWidth(899)).toBe(true);
    expect(isCompactTableWidth(901)).toBe(false);

    expect(ImdDensity.resolve(false).cellPadV).toBe(10);
    expect(ImdDensity.resolve(true).cellPadV).toBe(7);
    expect(ImdDensity.resolve(false).controlHeight).toBe(46);
    expect(ImdDensity.resolve(true).controlHeight).toBe(44);
    expect(ImdDensity.resolve(false).touchMinMobile).toBe(46);

    const sampleRows = [
      { id: '1', name: 'سكر', qty: 40 },
      { id: '2', name: 'أرز', qty: 120 },
      { id: '3', name: 'زيت', qty: 15 },
    ];
    const qtyCol = {
      key: 'qty',
      header: 'الكمية',
      render: (r: (typeof sampleRows)[0]) => r.qty,
      sortValue: (r: (typeof sampleRows)[0]) => r.qty,
    };

    const asc = sortTableRows(sampleRows, qtyCol, 'asc');
    expect(asc.map((r) => r.qty)).toEqual([15, 40, 120]);

    const desc = sortTableRows(sampleRows, qtyCol, 'desc');
    expect(desc.map((r) => r.qty)).toEqual([120, 40, 15]);
  });

  it('imdPlatform: permanently locks to Android Smartphone mode (phone formFactor, 46px controls, 56px AppBar, 58px BottomNav)', async () => {
    const { computePlatformMetrics, detectNativeOs, loadPlatformOverride } = await import('../src/core/ui/imdPlatform');

    expect(detectNativeOs(900, 800)).toBe('android');
    expect(detectNativeOs(412, 915)).toBe('android');
    expect(loadPlatformOverride()).toBe('android_phone');

    // Native Phone screen (<= 520px) fills full width without outer frame
    const nativePhone = computePlatformMetrics('android_phone', 412, 915, false);
    expect(nativePhone.effectiveOs).toBe('android');
    expect(nativePhone.formFactor).toBe('phone');
    expect(nativePhone.isCompactScreen).toBe(true);
    expect(nativePhone.isFramedAndroidPreview).toBe(false);
    expect(nativePhone.viewportWidth).toBe(412);
    expect(nativePhone.topbarHeightPx).toBe(56);
    expect(nativePhone.bottomNavHeightPx).toBe(58);
    expect(nativePhone.statusBarHeightPx).toBe(0);
    expect(nativePhone.controlHeightPx).toBe(46);
    expect(nativePhone.cellPadVPx).toBe(10);

    // Wide monitor preview (> 520px) is always locked to 412x915 Android Phone preview frame
    const androidFramed = computePlatformMetrics('android_phone', 1440, 960, false);
    expect(androidFramed.effectiveOs).toBe('android');
    expect(androidFramed.formFactor).toBe('phone');
    expect(androidFramed.isCompactScreen).toBe(true);
    expect(androidFramed.isFramedAndroidPreview).toBe(true);
    expect(androidFramed.viewportWidth).toBe(412);
    expect(androidFramed.controlHeightPx).toBe(46);
  });
});



