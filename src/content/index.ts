import type { BgToContent } from '../shared/types';
import { isTrustedSender, sendToBgFromContent } from '../shared/messaging';
import { AudioController } from './audioController';

const controller = new AudioController();

// Announce presence + initial media probe.
const initialHasMedia = controller.probeMedia();
sendToBgFromContent({ type: 'CT_READY', hasMedia: initialHasMedia });

// Light DOM watch even before enablement, so the popup can tell the user
// "this page has media" without engaging the audio graph.
const lightObserver = new MutationObserver(() => {
  sendToBgFromContent({ type: 'CT_MEDIA_CHANGED', hasMedia: controller.probeMedia() });
});
lightObserver.observe(document.documentElement, { childList: true, subtree: true });

// For SPAs (Google Meet, etc.) media elements may appear long after page load.
// Re-probe periodically until we find media or give up.
if (!initialHasMedia) {
  let probeCount = 0;
  const probeTimer = setInterval(() => {
    probeCount++;
    if (controller.probeMedia()) {
      sendToBgFromContent({ type: 'CT_MEDIA_CHANGED', hasMedia: true });
      clearInterval(probeTimer);
    }
    if (probeCount >= 30) clearInterval(probeTimer); // stop after ~60s
  }, 2000);
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (!isTrustedSender(sender)) return;
  const msg = raw as BgToContent;
  switch (msg.type) {
    case 'BG_ENABLE':
      controller.enable();
      sendResponse({ ok: true });
      return;
    case 'BG_DISABLE':
      controller.disable();
      sendResponse({ ok: true });
      return;
    case 'BG_SET_GAIN':
      controller.setGain(msg.gain);
      sendResponse({ ok: true });
      return;
    case 'BG_PROBE':
      sendResponse({ hasMedia: controller.probeMedia() });
      return;
  }
});

window.addEventListener('beforeunload', () => {
  controller.disable();
  lightObserver.disconnect();
});
