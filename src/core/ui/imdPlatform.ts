// Android Phone-Only Platform & Screen Sizing Engine (Locked to Android Smartphone 412×915 Form-Factor)
// Enforces 100% Android Smartphone touch ergonomics (46px touch targets, 56px AppBar, 58px Bottom Nav).

import { useEffect, useState } from 'react';
import { ImdDensity, ImdSizes } from './imdTokens';

export type OsPlatformKind = 'android';
export type PlatformOverrideMode = 'android_phone';

export interface PlatformMetrics {
  mode: PlatformOverrideMode;
  effectiveOs: OsPlatformKind;
  detectedNativeOs: OsPlatformKind;
  formFactor: 'phone';
  viewportWidth: number;
  viewportHeight: number;
  isCompactScreen: boolean; // always true (Android Smartphone mode)
  isFramedAndroidPreview: boolean; // true when previewing 412×915 Android Phone on a screen wider than 520px
  topbarHeightPx: number; // 56px Android Material AppBar
  statusBarHeightPx: number; // 0px
  bottomNavHeightPx: number; // 58px Android Bottom Navigation Bar
  controlHeightPx: number; // 46px Android touch target
  cellPadVPx: number; // 10px touch cell padding
  osLabelAr: string;
  resolutionLabel: string;
}

/**
 * Reads current browser/WebView dimensions directly from window.innerWidth and window.innerHeight,
 * defaulting to standard Android smartphone dimensions (412×915).
 */
export function getWindowDimensions(): { width: number; height: number } {
  if (typeof window !== 'undefined') {
    return {
      width: window.innerWidth || document?.documentElement?.clientWidth || ImdSizes.phoneFrameWidth,
      height: window.innerHeight || document?.documentElement?.clientHeight || ImdSizes.phoneFrameHeight,
    };
  }
  return { width: ImdSizes.phoneFrameWidth, height: ImdSizes.phoneFrameHeight };
}

/**
 * Dedicated Android OS identifier: always returns 'android'.
 */
export function detectNativeOs(_width?: number, _height?: number): OsPlatformKind {
  return 'android';
}

/**
 * Permanently locked to 'android_phone' mode as requested.
 */
export function loadPlatformOverride(): PlatformOverrideMode {
  return 'android_phone';
}

export function savePlatformOverride(_mode?: PlatformOverrideMode): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('imd:platform-change', { detail: 'android_phone' }));
  }
}

export function computePlatformMetrics(
  _mode: PlatformOverrideMode = 'android_phone',
  viewportWidth?: number,
  viewportHeight?: number,
  highDensity = false
): PlatformMetrics {
  const dims = getWindowDimensions();
  const rawW = typeof viewportWidth === 'number' ? viewportWidth : dims.width;
  const rawH = typeof viewportHeight === 'number' ? viewportHeight : dims.height;

  const isFramedAndroidPreview = rawW > 520;
  const effectiveWidth = isFramedAndroidPreview ? ImdSizes.phoneFrameWidth : rawW;
  const effectiveHeight = isFramedAndroidPreview
    ? Math.min(Math.max(rawH - 48, 640), ImdSizes.phoneFrameHeight)
    : rawH;

  const density = ImdDensity.resolve(highDensity);
  const controlHeightPx = ImdSizes.touchMin; // 46px touch target
  const cellPadVPx = density.cellPadV;
  const topbarHeightPx = ImdSizes.appBarHeight; // 56px Android Material Top AppBar
  const statusBarHeightPx = 0;
  const bottomNavHeightPx = ImdSizes.bottomNavHeight; // 58px Android Bottom Navigation Bar

  return {
    mode: 'android_phone',
    effectiveOs: 'android',
    detectedNativeOs: 'android',
    formFactor: 'phone',
    viewportWidth: effectiveWidth,
    viewportHeight: effectiveHeight,
    isCompactScreen: true,
    isFramedAndroidPreview,
    topbarHeightPx,
    statusBarHeightPx,
    bottomNavHeightPx,
    controlHeightPx,
    cellPadVPx,
    osLabelAr: 'أندرويد — هاتف (Android APK)',
    resolutionLabel: `${effectiveWidth}×${effectiveHeight}`,
  };
}

/**
 * Sets `data-imd-os="android"`, `data-imd-form="phone"`, and Android touch CSS variables on `<html>`.
 */
export function applyPlatformAttributesToDom(metrics: PlatformMetrics): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-imd-os', 'android');
  root.setAttribute('data-imd-form', 'phone');
  root.setAttribute('data-imd-mode', 'android_phone');
  root.setAttribute('data-imd-compact', 'true');
  root.setAttribute('data-imd-viewport', `${metrics.viewportWidth}x${metrics.viewportHeight}`);
  root.style.setProperty('--imd-control-h', `${metrics.controlHeightPx}px`);
  root.style.setProperty('--imd-topbar-h', `${metrics.topbarHeightPx}px`);
  root.style.setProperty('--imd-statusbar-h', `${metrics.statusBarHeightPx}px`);
  root.style.setProperty('--imd-cell-pad-v', `${metrics.cellPadVPx}px`);
}

/**
 * Attaches a ResizeObserver to `document.documentElement` (plus window resize listener)
 * that reads `window.innerWidth` & `window.innerHeight` and updates Android smartphone metrics.
 */
export function setupPlatformResizeObserver(
  options: {
    getMode?: () => PlatformOverrideMode;
    getHighDensity?: () => boolean;
    onUpdate?: (metrics: PlatformMetrics) => void;
  } = {}
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const syncFromWindow = () => {
    const { width, height } = getWindowDimensions();
    const highDensity = options.getHighDensity ? options.getHighDensity() : false;
    const metrics = computePlatformMetrics('android_phone', width, height, highDensity);
    applyPlatformAttributesToDom(metrics);
    if (options.onUpdate) {
      options.onUpdate(metrics);
    }
  };

  syncFromWindow();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      syncFromWindow();
    });
    resizeObserver.observe(document.documentElement);
    if (document.body) {
      resizeObserver.observe(document.body);
    }
  }

  window.addEventListener('resize', syncFromWindow);

  return () => {
    window.removeEventListener('resize', syncFromWindow);
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  };
}

export function useImdPlatform(highDensity = false): {
  metrics: PlatformMetrics;
  setMode: (mode: PlatformOverrideMode) => void;
} {
  const [size, setSize] = useState<{ width: number; height: number }>(() =>
    getWindowDimensions()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cleanupObserver = setupPlatformResizeObserver({
      getMode: () => 'android_phone',
      getHighDensity: () => highDensity,
      onUpdate: (nextMetrics) => {
        const dims = getWindowDimensions();
        setSize((prev) =>
          prev.width === dims.width && prev.height === dims.height ? prev : dims
        );
        applyPlatformAttributesToDom(nextMetrics);
      },
    });

    return () => {
      cleanupObserver();
    };
  }, [highDensity]);

  const metrics = computePlatformMetrics('android_phone', size.width, size.height, highDensity);

  useEffect(() => {
    applyPlatformAttributesToDom(metrics);
  }, [metrics]);

  const setMode = (_next: PlatformOverrideMode) => {
    savePlatformOverride('android_phone');
  };

  return { metrics, setMode };
}
