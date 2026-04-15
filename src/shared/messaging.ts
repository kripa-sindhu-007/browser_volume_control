import type { PopupToBg, BgToContent, ContentToBg } from './types';

/**
 * Typed wrappers around chrome.runtime / chrome.tabs messaging.
 * All calls are origin-checked by the receiver (sender.id === chrome.runtime.id)
 * to prevent foreign pages sending fake messages via externally_connectable.
 */

export function sendToBackground<T = unknown>(msg: PopupToBg): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

export function sendToTab<T = unknown>(tabId: number, msg: BgToContent): Promise<T> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<T>;
}

export function sendToBgFromContent<T = unknown>(msg: ContentToBg): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

/** Verify a message originated from our own extension, not a web page. */
export function isTrustedSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}
