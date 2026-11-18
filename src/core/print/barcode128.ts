// Pure ISO/IEC 15417 Code-128 (Subset B) Barcode Encoder & Black-on-White SVG Renderer

// Complete 107-entry Code-128 bar-space module table (each symbol = 6 alternating bar/space widths summing to 11, Stop = 7 widths summing to 13)
const CODE128_PATTERNS: readonly string[] = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];

const START_B = 104;
const STOP_CODE = 106;

/**
 * Encodes an ASCII string using Code-128 Subset B (printable ASCII 32..127) with mod-103 checksum.
 * Non-ASCII characters are deterministically mapped into printable ASCII range so mixed refs remain scannable.
 */
export function encodeCode128Modules(rawInput: string): number[] {
  const input = (rawInput || 'IMDAD').trim() || 'IMDAD';
  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    const val = ch >= 32 && ch <= 126 ? ch - 32 : (ch % 94);
    codes.push(val);
    checksum += val * (i + 1);
  }

  const checkSymbol = checksum % 103;
  codes.push(checkSymbol);
  codes.push(STOP_CODE);

  const modules: number[] = [];
  for (const sym of codes) {
    const pat = CODE128_PATTERNS[sym] ?? CODE128_PATTERNS[0];
    for (let j = 0; j < pat.length; j++) {
      modules.push(Number(pat[j]));
    }
  }
  return modules;
}

/**
 * Generates an HTML-safe crisp black (#000000) on white (#FFFFFF) inline SVG string for Code-128 labels.
 */
export function renderCode128SvgHtml(
  value: string,
  options?: { heightPx?: number; quietZone?: number }
): string {
  const modules = encodeCode128Modules(value);
  const quiet = options?.quietZone ?? 8;
  const h = options?.heightPx ?? 32;
  const totalWidth = modules.reduce((s, w) => s + w, 0) + quiet * 2;

  let x = quiet;
  const rects: string[] = [];
  for (let i = 0; i < modules.length; i++) {
    const w = modules[i];
    if (i % 2 === 0) {
      rects.push(`<rect x="${x}" y="0" width="${w}" height="${h}" fill="#000000" />`);
    }
    x += w;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${h}" style="width:100%;height:${h}px;background:#FFFFFF;display:block;" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}
