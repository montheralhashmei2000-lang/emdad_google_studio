// ImdNumberPrefs & ImdNumbers: Separate screen digits (Arabic-Indic default) & print digits (Western default for Excel parity)

export type DigitSystem = 'arabic' | 'western';
export type ThousandsSep = ',' | '\u066C' | ' ' | '';
export type DecimalSep = '.' | '\u066B';

export interface ImdNumberPrefs {
  uiDigits: DigitSystem; // افتراضياً هندية ٠١٢٣٤٥٦٧٨٩ على الشاشات
  printDigits: DigitSystem; // افتراضياً لاتينية 0123456789 في المطبوعات
  thousandsSep: ThousandsSep;
  decimalSep: DecimalSep;
  qtyDecimals: number; // افتراضياً 3 مع حذف الأصفار الزائدة
  moneyDecimals: number; // افتراضياً 2 ثابتة لا تُقصّ
}

export const DEFAULT_NUMBER_PREFS: ImdNumberPrefs = {
  uiDigits: 'arabic',
  printDigits: 'western',
  thousandsSep: ',',
  decimalSep: '.',
  qtyDecimals: 3,
  moneyDecimals: 2,
};

const STORAGE_KEY = 'emdad_number_prefs_v1';
const listeners = new Set<(prefs: ImdNumberPrefs) => void>();

export const ImdNumbers = {
  load(): ImdNumberPrefs {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return { ...DEFAULT_NUMBER_PREFS };
      const parsed = JSON.parse(raw) as Partial<ImdNumberPrefs>;
      return {
        uiDigits: parsed.uiDigits === 'western' ? 'western' : 'arabic',
        printDigits: parsed.printDigits === 'arabic' ? 'arabic' : 'western',
        thousandsSep:
          parsed.thousandsSep === ',' ||
          parsed.thousandsSep === '\u066C' ||
          parsed.thousandsSep === ' ' ||
          parsed.thousandsSep === ''
            ? parsed.thousandsSep
            : DEFAULT_NUMBER_PREFS.thousandsSep,
        decimalSep: parsed.decimalSep === '\u066B' ? '\u066B' : '.',
        qtyDecimals:
          typeof parsed.qtyDecimals === 'number' && parsed.qtyDecimals >= 0 && parsed.qtyDecimals <= 6
            ? Math.floor(parsed.qtyDecimals)
            : DEFAULT_NUMBER_PREFS.qtyDecimals,
        moneyDecimals:
          typeof parsed.moneyDecimals === 'number' && parsed.moneyDecimals >= 0 && parsed.moneyDecimals <= 4
            ? Math.floor(parsed.moneyDecimals)
            : DEFAULT_NUMBER_PREFS.moneyDecimals,
      };
    } catch {
      return { ...DEFAULT_NUMBER_PREFS };
    }
  },

  save(prefs: ImdNumberPrefs): ImdNumberPrefs {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
    listeners.forEach((fn) => fn(prefs));
    return prefs;
  },

  subscribe(fn: (prefs: ImdNumberPrefs) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
