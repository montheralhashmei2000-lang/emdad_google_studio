// Pure Arabic Number-to-Words (التفقيط العربي) Engine (Zero Dependencies)

const ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
];

const TENS = [
  '',
  'عشرة',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];

const TEENS = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

function under1000ToWords(n: number): string {
  const num = Math.floor(n) % 1000;
  if (num === 0) return '';
  const h = Math.floor(num / 100);
  const rem = num % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(HUNDREDS[h]);

  if (rem > 0) {
    if (rem < 10) {
      parts.push(ONES[rem]);
    } else if (rem < 20) {
      parts.push(TEENS[rem - 10]);
    } else {
      const u = rem % 10;
      const t = Math.floor(rem / 10);
      if (u > 0) {
        parts.push(`${ONES[u]} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }
  return parts.join(' و');
}

function groupScale(groupVal: number, singular: string, dual: string, plural: string): string {
  if (groupVal === 0) return '';
  if (groupVal === 1) return singular;
  if (groupVal === 2) return dual;
  if (groupVal >= 3 && groupVal <= 10) return `${under1000ToWords(groupVal)} ${plural}`;
  return `${under1000ToWords(groupVal)} ${singular}`;
}

export function intToArabicWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'صفر';

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (millions > 0) {
    parts.push(groupScale(millions, 'مليون', 'مليونان', 'ملايين'));
  }
  if (thousands > 0) {
    parts.push(groupScale(thousands, 'ألف', 'ألفان', 'آلاف'));
  }
  if (rest > 0) {
    parts.push(under1000ToWords(rest));
  }
  return parts.join(' و');
}

export function amountToArabicWords(amount: number, currency: 'sar' | 'yer' | 'SAR' | 'YER'): string {
  const cur = currency.toLowerCase();
  const mainUnit = cur === 'yer' ? 'ريالاً يمنياً' : 'ريالاً سعودياً';
  const subUnit = cur === 'yer' ? 'فلساً' : 'هللة';

  const clean = Math.max(0, Math.round(amount * 100) / 100);
  const whole = Math.floor(clean);
  const fraction = Math.round((clean - whole) * 100);

  const mainText = `${intToArabicWords(whole)} ${mainUnit}`;
  if (fraction > 0) {
    return `فقط ${mainText} و${intToArabicWords(fraction)} ${subUnit} لا غير`;
  }
  return `فقط ${mainText} لا غير`;
}
