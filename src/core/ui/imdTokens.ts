// Design System Tokens: 6 Themes, Classic Flat Mode, Fuel Section Theme, Density & Typography

import type { AppSpace, SystemConfig } from '../../domain/types';
import { ImdNumbers } from './imdNumbers';
import { arDigits, nf } from './imdFormat';

export const ImdBp = {
  mobileMax: 900,
  wide: 1200,
  isMobile: (width: number) => width <= 900,
  isWide: (width: number) => width >= 1200,
} as const;

export const ImdSizes = {
  appBarHeight: 56,
  bottomNavHeight: 58,
  drawerMaxWidth: 320,
  touchMin: 46,
  phoneFrameWidth: 412,
  phoneFrameHeight: 915,
} as const;

export interface ImdColorPalette {
  bg: string;
  surface: string;
  subtle: string;
  hover: string;
  fieldFill: string;
  panelFill: string;
  toolbarFill: string;
  line: string;
  lineStrong: string;
  tableHead: string;
  tableRowLine: string;
  text: string;
  text2: string;
  muted: string;
  faint: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  ring: string;
  onAccent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
  info: string;
  infoSoft: string;
  side: string;
  side2: string;
  sideHover: string;
  sideActive: string;
  sideText: string;
  sideMuted: string;
  sideBorder: string;
  sideLine: string;
  noteBg: string;
  noteBorder: string;
  noteText: string;
}

export const ImdPalettes: Record<
  'light' | 'dark' | 'classicLight' | 'classicDark' | 'fuel' | 'fuelLight' | 'fuelDark',
  ImdColorPalette
> = {
  light: {
    bg: '#F7F7F8',
    surface: '#FFFFFF',
    subtle: '#ECECF1',
    hover: '#F2F2F5',
    fieldFill: '#EEF1EE',
    panelFill: '#F7FAF8',
    toolbarFill: '#F2F7F5',
    line: '#E3E3E8',
    lineStrong: '#D1D1DB',
    tableHead: '#FAFAFB',
    tableRowLine: '#EFEFF3',
    text: '#202123',
    text2: '#343541',
    muted: '#5B5E6B',
    faint: '#68687B',
    accent: '#047857',
    accentHover: '#065F46',
    accentSoft: '#ECFDF5',
    ring: 'rgba(4, 120, 87, 0.22)',
    onAccent: '#FFFFFF',
    success: '#067647',
    successSoft: '#DCFAE6',
    danger: '#B42318',
    dangerSoft: '#FEE4E2',
    warn: '#B54708',
    warnSoft: '#FEF0C7',
    info: '#175CD3',
    infoSoft: '#EFF4FF',
    side: '#0B3D3A',
    side2: '#104A46',
    sideHover: '#155A55',
    sideActive: '#1A6A63',
    sideText: '#F0FDFA',
    sideMuted: '#9CCFC7',
    sideBorder: '#1F665F',
    sideLine: '#17524D',
    noteBg: '#FFFAEB',
    noteBorder: '#FEDF89',
    noteText: '#7A2E0E',
  },
  dark: {
    bg: '#171717',
    surface: '#212121',
    subtle: '#2F2F33',
    hover: '#2A2A2E',
    fieldFill: '#28282C',
    panelFill: '#1D1D20',
    toolbarFill: '#242428',
    line: '#303036',
    lineStrong: '#3F3F46',
    tableHead: '#1C1C20',
    tableRowLine: '#2B2B30',
    text: '#ECECF1',
    text2: '#D4D4D8',
    muted: '#A1A1AA',
    faint: '#9797A1',
    accent: '#10B981',
    accentHover: '#34D399',
    accentSoft: 'rgba(16, 185, 129, 0.14)',
    ring: 'rgba(16, 185, 129, 0.28)',
    onAccent: '#0B1F1C',
    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.14)',
    danger: '#F97066',
    dangerSoft: 'rgba(249, 112, 102, 0.14)',
    warn: '#FDB022',
    warnSoft: 'rgba(253, 176, 34, 0.14)',
    info: '#84ADFF',
    infoSoft: 'rgba(132, 173, 255, 0.14)',
    side: '#0F0F10',
    side2: '#1A1A1C',
    sideHover: '#26262A',
    sideActive: '#303036',
    sideText: '#ECECF1',
    sideMuted: '#A1A1AA',
    sideBorder: '#2C2C32',
    sideLine: '#242429',
    noteBg: '#2B2313',
    noteBorder: '#6B4F12',
    noteText: '#FDE68A',
  },
  classicLight: {
    bg: '#F3F4F6',
    surface: '#FFFFFF',
    subtle: '#E5E7EB',
    hover: '#EDF0F3',
    fieldFill: '#FFFFFF',
    panelFill: '#F9FAFB',
    toolbarFill: '#EAECEF',
    line: '#D1D5DB',
    lineStrong: '#9CA3AF',
    tableHead: '#E5E7EB',
    tableRowLine: '#E5E7EB',
    text: '#111827',
    text2: '#1F2937',
    muted: '#4B5563',
    faint: '#6B7280',
    accent: '#047857',
    accentHover: '#065F46',
    accentSoft: '#D1FAE5',
    ring: 'rgba(4, 120, 87, 0.25)',
    onAccent: '#FFFFFF',
    success: '#0B7A55',
    successSoft: '#D1FAE5',
    danger: '#CD1212',
    dangerSoft: '#FEE2E2',
    warn: '#966106',
    warnSoft: '#FEF3C7',
    info: '#0A5DE4',
    infoSoft: '#DBEAFE',
    side: '#0B3D3A',
    side2: '#104A46',
    sideHover: '#155A55',
    sideActive: '#1A6A63',
    sideText: '#F0FDFA',
    sideMuted: '#9CCFC7',
    sideBorder: '#1F665F',
    sideLine: '#17524D',
    noteBg: '#FFFBEB',
    noteBorder: '#F59E0B',
    noteText: '#78350F',
  },
  classicDark: {
    bg: '#141517',
    surface: '#1D1F22',
    subtle: '#2A2D32',
    hover: '#25282C',
    fieldFill: '#23262A',
    panelFill: '#191B1E',
    toolbarFill: '#22252A',
    line: '#32363D',
    lineStrong: '#484D56',
    tableHead: '#24272C',
    tableRowLine: '#2B2F36',
    text: '#F3F4F6',
    text2: '#E5E7EB',
    muted: '#9CA3AF',
    faint: '#7D8590',
    accent: '#10B981',
    accentHover: '#34D399',
    accentSoft: 'rgba(16, 185, 129, 0.16)',
    ring: 'rgba(16, 185, 129, 0.30)',
    onAccent: '#0B1F1C',
    success: '#34D399',
    successSoft: 'rgba(52, 211, 153, 0.16)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.16)',
    warn: '#FBBF24',
    warnSoft: 'rgba(251, 191, 36, 0.16)',
    info: '#60A5FA',
    infoSoft: 'rgba(96, 165, 250, 0.16)',
    side: '#0F0F10',
    side2: '#1A1A1C',
    sideHover: '#26262A',
    sideActive: '#303036',
    sideText: '#ECECF1',
    sideMuted: '#A1A1AA',
    sideBorder: '#2C2C32',
    sideLine: '#242429',
    noteBg: '#2B2313',
    noteBorder: '#92400E',
    noteText: '#FDE68A',
  },
  fuel: {
    bg: '#0E100D',
    surface: '#161914',
    subtle: '#22271F',
    hover: '#1E231B',
    fieldFill: '#1B2019',
    panelFill: '#131611',
    toolbarFill: '#191D16',
    line: '#292F26',
    lineStrong: '#384034',
    tableHead: '#141712',
    tableRowLine: '#232820',
    text: '#F1F5EE',
    text2: '#DCE3D7',
    muted: '#9FA999',
    faint: '#85907F',
    accent: '#BFD8A4',
    accentHover: '#D4E6C0',
    accentSoft: 'rgba(191, 216, 164, 0.16)',
    ring: 'rgba(191, 216, 164, 0.28)',
    onAccent: '#0E100D',
    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.14)',
    danger: '#F97066',
    dangerSoft: 'rgba(249, 112, 102, 0.14)',
    warn: '#FDB022',
    warnSoft: 'rgba(253, 176, 34, 0.14)',
    info: '#84ADFF',
    infoSoft: 'rgba(132, 173, 255, 0.14)',
    side: '#0A0C09',
    side2: '#121510',
    sideHover: '#1B2018',
    sideActive: '#262C22',
    sideText: '#F1F5EE',
    sideMuted: '#9FA999',
    sideBorder: '#262C22',
    sideLine: '#1B2018',
    noteBg: '#232613',
    noteBorder: '#5B6224',
    noteText: '#E9F0B8',
  },
  fuelLight: {
    bg: '#F7F6F4',
    surface: '#FFFFFF',
    subtle: '#EDEAE5',
    hover: '#F3F1ED',
    fieldFill: '#F2EFEA',
    panelFill: '#FAF8F5',
    toolbarFill: '#F5EFEA',
    line: '#E4DFD8',
    lineStrong: '#D3CCC2',
    tableHead: '#FAF9F7',
    tableRowLine: '#F1EDE7',
    text: '#202123',
    text2: '#343541',
    muted: '#5E5B56',
    faint: '#746F68',
    accent: '#C2410C',
    accentHover: '#9A3412',
    accentSoft: '#FFF1E8',
    ring: 'rgba(194, 65, 12, 0.22)',
    onAccent: '#FFFFFF',
    success: '#067647',
    successSoft: '#DCFAE6',
    danger: '#B42318',
    dangerSoft: '#FEE4E2',
    warn: '#B54708',
    warnSoft: '#FEF0C7',
    info: '#175CD3',
    infoSoft: '#EFF4FF',
    side: '#3B1D0E',
    side2: '#4A2513',
    sideHover: '#5B2F19',
    sideActive: '#6E3A1E',
    sideText: '#FFF4EC',
    sideMuted: '#E3BFA9',
    sideBorder: '#69371E',
    sideLine: '#522915',
    noteBg: '#FFF7ED',
    noteBorder: '#FED7AA',
    noteText: '#7C2D12',
  },
  fuelDark: {
    bg: '#171513',
    surface: '#211E1B',
    subtle: '#2F2B27',
    hover: '#2A2622',
    fieldFill: '#292521',
    panelFill: '#1D1A17',
    toolbarFill: '#25211D',
    line: '#332E29',
    lineStrong: '#443E37',
    tableHead: '#1C1916',
    tableRowLine: '#2B2723',
    text: '#F5F2EE',
    text2: '#DDD7CF',
    muted: '#A8A096',
    faint: '#8E857B',
    accent: '#FB923C',
    accentHover: '#FDBA74',
    accentSoft: 'rgba(251, 146, 60, 0.16)',
    ring: 'rgba(251, 146, 60, 0.28)',
    onAccent: '#231003',
    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.14)',
    danger: '#F97066',
    dangerSoft: 'rgba(249, 112, 102, 0.14)',
    warn: '#FDB022',
    warnSoft: 'rgba(253, 176, 34, 0.14)',
    info: '#84ADFF',
    infoSoft: 'rgba(132, 173, 255, 0.14)',
    side: '#120F0C',
    side2: '#1C1713',
    sideHover: '#29211B',
    sideActive: '#3A2F25',
    sideText: '#FFF4EC',
    sideMuted: '#C5B5A5',
    sideBorder: '#352B23',
    sideLine: '#271F19',
    noteBg: '#2C1D11',
    noteBorder: '#7C2D12',
    noteText: '#FED7AA',
  },
};

// Android mobile touch density metrics (standard 46px vs compact 44px touch targets; cellPadV: 10px vs 7px)
export const ImdDensity = {
  normal: {
    cellPadV: 10,
    cellPadH: 10,
    controlHeight: 46,
    touchMinMobile: 46,
  },
  high: {
    cellPadV: 7,
    cellPadH: 8,
    controlHeight: 44,
    touchMinMobile: 44,
  },
  resolve(highDensity: boolean) {
    return highDensity ? this.high : this.normal;
  },
} as const;

export const ImdStyle = {
  modern: { radius: 10, radiusSm: 6, flat: false },
  classicFlat: { radius: 2, radiusSm: 2, flat: true },
  resolve(classicFlat: boolean) {
    return classicFlat ? this.classicFlat : this.modern;
  },
} as const;

export const ImdSectionTheme = {
  resolve(distinctFuelTheme: boolean, space: AppSpace, isDark: boolean): ImdColorPalette {
    if (space === 'fuel' && distinctFuelTheme) {
      return isDark ? ImdPalettes.fuelDark : ImdPalettes.fuelLight;
    }
    return isDark ? ImdPalettes.dark : ImdPalettes.light;
  },
} as const;

export function resolvePalette(config: Pick<SystemConfig, 'themeMode' | 'classicFlat' | 'distinctFuelTheme'>, space: AppSpace): ImdColorPalette {
  const isDark = config.themeMode === 'dark';
  if (space === 'fuel' && config.distinctFuelTheme) {
    return isDark ? ImdPalettes.fuelDark : ImdPalettes.fuelLight;
  }
  if (config.classicFlat) {
    return isDark ? ImdPalettes.classicDark : ImdPalettes.classicLight;
  }
  return isDark ? ImdPalettes.dark : ImdPalettes.light;
}

export function applyThemeToDocument(config: SystemConfig & { highDensity?: boolean }, space: AppSpace): void {
  const pal = resolvePalette(config, space);
  const root = document.documentElement;
  if (config.themeMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const fontMap: Record<SystemConfig['fontFamily'], string> = {
    IBMPlexSansArabic: '"IBM Plex Sans Arabic", system-ui, sans-serif',
    Tajawal: '"Tajawal", system-ui, sans-serif',
    Cairo: '"Cairo", system-ui, sans-serif',
    NotoSansArabic: '"Noto Sans Arabic", system-ui, sans-serif',
  };

  root.style.setProperty('--imd-bg', pal.bg);
  root.style.setProperty('--imd-surface', pal.surface);
  root.style.setProperty('--imd-subtle', pal.subtle);
  root.style.setProperty('--imd-hover', pal.hover);
  root.style.setProperty('--imd-field-fill', pal.fieldFill);
  root.style.setProperty('--imd-panel-fill', pal.panelFill);
  root.style.setProperty('--imd-toolbar-fill', pal.toolbarFill);
  root.style.setProperty('--imd-line', pal.line);
  root.style.setProperty('--imd-line-strong', pal.lineStrong);
  root.style.setProperty('--imd-table-head', pal.tableHead);
  root.style.setProperty('--imd-table-row-line', pal.tableRowLine);
  root.style.setProperty('--imd-text', pal.text);
  root.style.setProperty('--imd-text2', pal.text2);
  root.style.setProperty('--imd-muted', pal.muted);
  root.style.setProperty('--imd-faint', pal.faint);
  root.style.setProperty('--imd-accent', pal.accent);
  root.style.setProperty('--imd-accent-hover', pal.accentHover);
  root.style.setProperty('--imd-accent-soft', pal.accentSoft);
  root.style.setProperty('--imd-ring', pal.ring);
  root.style.setProperty('--imd-on-accent', pal.onAccent);
  root.style.setProperty('--imd-success', pal.success);
  root.style.setProperty('--imd-success-soft', pal.successSoft);
  root.style.setProperty('--imd-danger', pal.danger);
  root.style.setProperty('--imd-danger-soft', pal.dangerSoft);
  root.style.setProperty('--imd-warn', pal.warn);
  root.style.setProperty('--imd-warn-soft', pal.warnSoft);
  root.style.setProperty('--imd-info', pal.info);
  root.style.setProperty('--imd-info-soft', pal.infoSoft);
  root.style.setProperty('--imd-side', pal.side);
  root.style.setProperty('--imd-side2', pal.side2);
  root.style.setProperty('--imd-side-hover', pal.sideHover);
  root.style.setProperty('--imd-side-active', pal.sideActive);
  root.style.setProperty('--imd-side-text', pal.sideText);
  root.style.setProperty('--imd-side-muted', pal.sideMuted);
  root.style.setProperty('--imd-side-border', pal.sideBorder);
  root.style.setProperty('--imd-side-line', pal.sideLine);
  root.style.setProperty('--imd-note-bg', pal.noteBg);
  root.style.setProperty('--imd-note-border', pal.noteBorder);
  root.style.setProperty('--imd-note-text', pal.noteText);

  const density = ImdDensity.resolve(Boolean(config.highDensity));
  root.style.setProperty('--imd-cell-pad-v', `${density.cellPadV}px`);
  root.style.setProperty('--imd-control-h', `${density.controlHeight}px`);
  root.style.setProperty('--imd-touch-min-mobile', `${density.touchMinMobile}px`);

  root.style.setProperty('--imd-radius', config.classicFlat ? '2px' : '10px');
  root.style.setProperty('--imd-radius-sm', config.classicFlat ? '2px' : '6px');
  root.style.setProperty(
    '--imd-shadow',
    config.classicFlat ? 'none' : '0 1px 2px rgba(16, 24, 40, 0.05)'
  );
  root.style.setProperty('--imd-font', fontMap[config.fontFamily] ?? fontMap.IBMPlexSansArabic);
}

export function toArabicDigits(input: string | number): string {
  return arDigits(input);
}

export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, '');
}

export function formatNum(
  val: number,
  decimals = 2,
  numerals?: 'western' | 'arabic'
): string {
  const prefs = ImdNumbers.load();
  const effectivePrefs = {
    ...prefs,
    qtyDecimals: decimals,
    uiDigits: numerals ?? prefs.uiDigits,
  };
  return nf(val, effectivePrefs);
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
