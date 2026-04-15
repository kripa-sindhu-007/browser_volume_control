export const MIN_GAIN = 0;
export const MAX_GAIN = 1; // Phase 1 cap; Phase 2 raises to 2.0 (Boost)
export const DEFAULT_GAIN = 1;

export type TabStatus =
  | 'unavailable' // no media / cross-origin blocked / privileged page
  | 'inactive'    // control not yet enabled
  | 'active'      // gain node in circuit
  | 'muted';      // active + gain forced to 0

export interface TabState {
  tabId: number;
  origin: string | null;
  status: TabStatus;
  gain: number;        // 0..MAX_GAIN
  priorGain: number;   // restored on unmute
  hasMedia: boolean;
}

export type PopupToBg =
  | { type: 'GET_TAB_STATE' }
  | { type: 'ENABLE_CONTROL' }
  | { type: 'DISABLE_CONTROL' }
  | { type: 'SET_GAIN'; gain: number }
  | { type: 'SET_MUTED'; muted: boolean };

export type BgToContent =
  | { type: 'BG_ENABLE' }
  | { type: 'BG_DISABLE' }
  | { type: 'BG_SET_GAIN'; gain: number }
  | { type: 'BG_PROBE' };

export type ContentToBg =
  | { type: 'CT_READY'; hasMedia: boolean }
  | { type: 'CT_MEDIA_CHANGED'; hasMedia: boolean }
  | { type: 'CT_RMS'; level: number }
  | { type: 'CT_ERROR'; message: string };

export type BgToPopup =
  | { type: 'STATE'; state: TabState }
  | { type: 'RMS'; level: number };

export function clampGain(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_GAIN;
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, n));
}

export function safeOriginFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
