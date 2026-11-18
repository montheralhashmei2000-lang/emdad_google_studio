// imdFormat: Unified nf(n), nfMoney(n), nfPrint(n), fmtDate(d) [YYYY-MM-DD], arDay(iso), arDigits(s)

import { ImdNumbers, type DigitSystem, type ImdNumberPrefs } from './imdNumbers';

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

const ARABIC_WEEKDAYS = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

export function arDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

function formatCoreNumber(
  n: number,
  decimals: number,
  trimTrailingZeros: boolean,
  digitSystem: DigitSystem,
  prefs: ImdNumberPrefs
): string {
  const safeVal = Number.isFinite(n) ? n : 0;
  const negative = safeVal < 0;
  const abs = Math.abs(safeVal);

  let fixed = abs.toFixed(decimals);
  if (trimTrailingZeros && decimals > 0 && fixed.includes('.')) {
    fixed = fixed.replace(/\.?0+$/, '');
  }

  const [intPartRaw, decPart] = fixed.split('.');
  const intPart = prefs.thousandsSep
    ? intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, prefs.thousandsSep)
    : intPartRaw;

  const combined = decPart !== undefined ? `${intPart}${prefs.decimalSep}${decPart}` : intPart;
  const signed = negative && combined !== '0' ? `-${combined}` : combined;
  return digitSystem === 'arabic' ? arDigits(signed) : signed;
}

/**
 * Formats supply/fuel quantities using qtyDecimals (default 3) with trailing zeros trimmed
 */
export function nf(n: number, customPrefs?: ImdNumberPrefs): string {
  const prefs = customPrefs ?? ImdNumbers.load();
  return formatCoreNumber(n, prefs.qtyDecimals, true, prefs.uiDigits, prefs);
}

/**
 * Formats quantities for official printables/Excel parity using printDigits (Western default)
 */
export function nfPrint(n: number, customPrefs?: ImdNumberPrefs): string {
  const prefs = customPrefs ?? ImdNumbers.load();
  return formatCoreNumber(n, prefs.qtyDecimals, true, prefs.printDigits, prefs);
}

/**
 * Formats financial currency amounts using fixed moneyDecimals (default 2, never trimmed)
 */
export function nfMoney(n: number, customPrefs?: ImdNumberPrefs): string {
  const prefs = customPrefs ?? ImdNumbers.load();
  return formatCoreNumber(n, prefs.moneyDecimals, false, prefs.uiDigits, prefs);
}

export function nfMoneyPrint(n: number, customPrefs?: ImdNumberPrefs): string {
  const prefs = customPrefs ?? ImdNumbers.load();
  return formatCoreNumber(n, prefs.moneyDecimals, false, prefs.printDigits, prefs);
}

/**
 * Unified canonical date format YYYY-MM-DD (year first, strictly without "م" suffix)
 */
export function fmtDate(input: Date | string): string {
  if (!input) return '';
  if (typeof input === 'string') {
    const clean = input.trim().replace(/\s*م$/g, '');
    const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const parsed = new Date(clean);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return clean.slice(0, 10);
  }
  if (Number.isNaN(input.getTime())) return '';
  const y = input.getFullYear();
  const mo = String(input.getMonth() + 1).padStart(2, '0');
  const d = String(input.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Formats an ISO date with its Arabic day of week + YYYY-MM-DD (no "م" suffix)
 */
export function arDay(iso: string, digits: DigitSystem = 'western'): string {
  const ymd = fmtDate(iso);
  if (!ymd) return '';
  const dt = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  const dayName = ARABIC_WEEKDAYS[dt.getDay()] ?? '';
  const datePart = digits === 'arabic' ? arDigits(ymd) : ymd;
  return `${dayName} ${datePart}`.trim();
}
