// Pure Document Numbering Engine: <Prefix>-<First 6 chars of DeviceId>-<6-digit padded sequence>

export const DOC_PREFIXES = {
  receipt: 'و',       // وارد / استلام
  issue: 'ص',         // صرف
  transfer: 'ت',      // تحويل
  return: 'ر',        // مرتجع
  destruction: 'إ',   // إتلاف
  stocktake: 'ج',     // جرد
  rationOrder: 'ط',   // طلبية إعاشة
  fuelIssue: 'مص',    // صرف محروقات
  fuelSupply: 'مو',   // توريد محروقات
  fuelTransfer: 'مت', // تحويل محروقات
  fuelStocktake: 'مج',// جرد محروقات
  fuelAlloc: 'مف',    // تفريدة محروقات
  cable: 'ب',         // برقية
  custody: 'ع',       // عهدة
  clearance: 'خ',     // إخلاء
  contract: 'ق',      // عقد شراء
  receiptMoney: 'س',  // سند استلام مبلغ
} as const;

export type DocKind = keyof typeof DOC_PREFIXES;

export function formatDocNumber(prefix: string, deviceId: string, seq: number): string {
  const dev6 = (deviceId || 'K7QX2A').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6).padEnd(6, 'X');
  const padded = String(Math.max(1, Math.floor(seq))).padStart(6, '0');
  return `${prefix}-${dev6}-${padded}`;
}

export function extractPrefix(refNo: string): string {
  const idx = refNo.indexOf('-');
  return idx > 0 ? refNo.slice(0, idx) : '';
}
