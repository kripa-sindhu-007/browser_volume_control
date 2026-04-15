import {
  type TabState,
  type PopupToBg,
  type ContentToBg,
  clampGain,
  safeOriginFromUrl,
  DEFAULT_GAIN,
} from '../shared/types';
import { isTrustedSender, sendToTab } from '../shared/messaging';

const tabStates = new Map<number, TabState>();
const popupPorts = new Set<chrome.runtime.Port>();

function initialState(tabId: number, url?: string): TabState {
  return {
    tabId,
    origin: safeOriginFromUrl(url),
    status: 'unavailable',
    gain: DEFAULT_GAIN,
    priorGain: DEFAULT_GAIN,
    hasMedia: false,
  };
}

function getOrCreate(tabId: number, url?: string): TabState {
  let s = tabStates.get(tabId);
  if (!s) {
    s = initialState(tabId, url);
    tabStates.set(tabId, s);
  } else if (url) {
    s.origin = safeOriginFromUrl(url);
  }
  return s;
}

function broadcastState(state: TabState): void {
  for (const port of popupPorts) {
    if (port.name === `popup:${state.tabId}`) {
      try {
        port.postMessage({ type: 'STATE', state });
      } catch {
        // port closed between iterations; ignore
      }
    }
  }
}

function broadcastRms(tabId: number, level: number): void {
  for (const port of popupPorts) {
    if (port.name === `popup:${tabId}`) {
      try {
        port.postMessage({ type: 'RMS', level });
      } catch {
        // ignore
      }
    }
  }
}

async function handlePopupMessage(
  msg: PopupToBg,
  tabId: number
): Promise<TabState | { error: string }> {
  const state = getOrCreate(tabId);

  switch (msg.type) {
    case 'GET_TAB_STATE':
      return state;

    case 'ENABLE_CONTROL': {
      if (!state.origin) return { error: 'unsupported-page' };
      try {
        await sendToTab(tabId, { type: 'BG_ENABLE' });
        await sendToTab(tabId, { type: 'BG_SET_GAIN', gain: state.gain });
        state.status = 'active';
      } catch {
        state.status = 'unavailable';
        return { error: 'content-unreachable' };
      }
      broadcastState(state);
      return state;
    }

    case 'DISABLE_CONTROL': {
      try {
        await sendToTab(tabId, { type: 'BG_DISABLE' });
      } catch {
        // tab may have closed; fall through
      }
      state.status = state.hasMedia ? 'inactive' : 'unavailable';
      state.gain = DEFAULT_GAIN;
      state.priorGain = DEFAULT_GAIN;
      broadcastState(state);
      return state;
    }

    case 'SET_GAIN': {
      if (state.status !== 'active' && state.status !== 'muted') {
        return { error: 'not-active' };
      }
      const gain = clampGain(msg.gain);
      state.gain = gain;
      if (gain === 0) {
        state.status = 'muted';
      } else if (state.status === 'muted') {
        state.status = 'active';
      }
      try {
        await sendToTab(tabId, { type: 'BG_SET_GAIN', gain });
      } catch {
        return { error: 'content-unreachable' };
      }
      broadcastState(state);
      return state;
    }

    case 'SET_MUTED': {
      if (state.status !== 'active' && state.status !== 'muted') {
        return { error: 'not-active' };
      }
      if (msg.muted) {
        if (state.status !== 'muted') state.priorGain = state.gain;
        state.gain = 0;
        state.status = 'muted';
      } else {
        state.gain = state.priorGain || DEFAULT_GAIN;
        state.status = 'active';
      }
      try {
        await sendToTab(tabId, { type: 'BG_SET_GAIN', gain: state.gain });
      } catch {
        return { error: 'content-unreachable' };
      }
      broadcastState(state);
      return state;
    }
  }
}

function handleContentMessage(msg: ContentToBg, tabId: number): void {
  const state = getOrCreate(tabId);
  switch (msg.type) {
    case 'CT_READY':
    case 'CT_MEDIA_CHANGED':
      state.hasMedia = msg.hasMedia;
      if (state.status === 'unavailable' && msg.hasMedia && state.origin) {
        state.status = 'inactive';
      } else if (!msg.hasMedia && state.status === 'inactive') {
        state.status = 'unavailable';
      }
      broadcastState(state);
      return;
    case 'CT_RMS':
      broadcastRms(tabId, msg.level);
      return;
    case 'CT_ERROR':
      console.warn('[bvc] content error', tabId, msg.message);
      return;
  }
}

// Runtime message router (one-shot popup queries + content events).
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (!isTrustedSender(sender)) return; // reject external
  const msg = raw as PopupToBg | ContentToBg;

  // Content script messages arrive with sender.tab
  if (sender.tab?.id != null) {
    handleContentMessage(msg as ContentToBg, sender.tab.id);
    return;
  }

  // Popup messages: resolve active tab
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return sendResponse({ error: 'no-active-tab' });
    const st = getOrCreate(tab.id, tab.url);
    const result = await handlePopupMessage(msg as PopupToBg, tab.id);
    sendResponse(result ?? st);
  })();
  return true; // async
});

// Long-lived port for streaming RMS + state updates to popup.
chrome.runtime.onConnect.addListener((port) => {
  if (!port.sender || !isTrustedSender(port.sender)) {
    port.disconnect();
    return;
  }
  if (!port.name.startsWith('popup:')) return;
  popupPorts.add(port);
  port.onDisconnect.addListener(() => popupPorts.delete(port));
});

// Lifecycle: reset on navigation and cleanup on tab close.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const prev = tabStates.get(tabId);
    const newOrigin = safeOriginFromUrl(changeInfo.url);
    if (prev && prev.origin !== newOrigin) {
      // Navigation to different origin wipes control (security boundary).
      tabStates.set(tabId, initialState(tabId, changeInfo.url));
      broadcastState(tabStates.get(tabId)!);
    } else if (prev) {
      prev.origin = newOrigin;
    }
  }
  if (changeInfo.status === 'complete' && tab.url) {
    const s = getOrCreate(tabId, tab.url);
    broadcastState(s);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});
