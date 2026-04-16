import { sendToBgFromContent } from '../shared/messaging';

/**
 * Owns a single AudioContext per document and routes every <audio|video>
 * element through a shared GainNode. Elements marked with the CORS-tainted
 * flag fall back to el.volume scaling (no Boost possible, but at least
 * attenuation works).
 */
export class AudioController {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private fallbackEls = new Set<HTMLMediaElement>();
  private observer: MutationObserver | null = null;
  private rmsTimer: number | null = null;
  private currentGain = 1;
  private enabled = false;

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    try {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.gain.gain.value = this.currentGain;

      this.attachAllExisting();
      this.startObserver();
      this.startRmsTicker();
    } catch (err) {
      sendToBgFromContent({
        type: 'CT_ERROR',
        message: `enable failed: ${(err as Error).message}`,
      });
      this.disable();
    }
  }

  disable(): void {
    this.enabled = false;
    this.stopObserver();
    this.stopRmsTicker();
    for (const el of this.fallbackEls) el.volume = Math.min(1, el.volume);
    this.fallbackEls.clear();
    try {
      this.gain?.disconnect();
      this.analyser?.disconnect();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    this.currentGain = 1;
  }

  setGain(value: number): void {
    this.currentGain = value;
    if (this.gain && this.ctx) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(value, now, 0.015);
    }
    // For CORS-tainted elements we can only scale native volume (0..1).
    for (const el of this.fallbackEls) {
      el.volume = Math.max(0, Math.min(1, value));
    }
  }

  probeMedia(): boolean {
    return this.findAllMedia().length > 0;
  }

  /** Finds media elements in both light DOM and open Shadow DOM roots. */
  private findAllMedia(): HTMLMediaElement[] {
    const found: HTMLMediaElement[] = [];
    const walk = (root: Document | ShadowRoot | Element): void => {
      root.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => found.push(el));
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) walk(el.shadowRoot);
      });
    };
    walk(document);
    return found;
  }

  private attachAllExisting(): void {
    this.findAllMedia().forEach((el) => this.attach(el));
  }

  private attach(el: HTMLMediaElement): void {
    if (!this.ctx || !this.gain) return;
    if (this.sources.has(el) || this.fallbackEls.has(el)) return;
    try {
      const src = this.ctx.createMediaElementSource(el);
      src.connect(this.gain);
      this.sources.set(el, src);
    } catch {
      // CORS-tainted or already bound to another graph — fall back.
      this.fallbackEls.add(el);
      el.volume = Math.max(0, Math.min(1, this.currentGain));
    }
  }

  private shadowObservers: MutationObserver[] = [];

  /** Observe a root (document or shadow root) for new media elements. */
  private observeRoot(root: Document | ShadowRoot): void {
    const obs = root === document ? this.observer! : new MutationObserver((muts) => this.handleMutations(muts));
    if (root !== document) this.shadowObservers.push(obs);
    obs.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
  }

  /** Watch an element for shadow root attachment and observe new shadow roots. */
  private watchForShadow(el: Element): void {
    if (el.shadowRoot) {
      this.observeRoot(el.shadowRoot);
      el.shadowRoot.querySelectorAll<HTMLMediaElement>('audio, video').forEach((m) => this.attach(m));
      // Recurse into shadow root children
      el.shadowRoot.querySelectorAll('*').forEach((child) => this.watchForShadow(child));
    }
  }

  private handleMutations(muts: MutationRecord[]): void {
    let changed = false;
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLMediaElement) {
          this.attach(n);
          changed = true;
        } else if (n instanceof Element) {
          n.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
            this.attach(el);
            changed = true;
          });
          // Also check for shadow roots on new elements
          this.watchForShadow(n);
          n.querySelectorAll('*').forEach((child) => this.watchForShadow(child));
        }
      });
    }
    if (changed) {
      sendToBgFromContent({ type: 'CT_MEDIA_CHANGED', hasMedia: this.probeMedia() });
    }
  }

  private probeTimer: number | null = null;

  private startObserver(): void {
    this.observer = new MutationObserver((muts) => this.handleMutations(muts));
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    // Observe any existing shadow roots
    document.querySelectorAll('*').forEach((el) => this.watchForShadow(el));

    // Re-probe periodically for late-arriving media (WebRTC, lazy SPAs like Google Meet)
    if (!this.probeMedia()) {
      let probeCount = 0;
      this.probeTimer = window.setInterval(() => {
        probeCount++;
        if (this.probeMedia()) {
          sendToBgFromContent({ type: 'CT_MEDIA_CHANGED', hasMedia: true });
          if (this.probeTimer != null) window.clearInterval(this.probeTimer);
          this.probeTimer = null;
        }
        // Stop after 60 seconds (30 probes × 2s)
        if (probeCount >= 30) {
          if (this.probeTimer != null) window.clearInterval(this.probeTimer);
          this.probeTimer = null;
        }
      }, 2000);
    }
  }

  private stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const obs of this.shadowObservers) obs.disconnect();
    this.shadowObservers = [];
    if (this.probeTimer != null) {
      window.clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private startRmsTicker(): void {
    if (!this.analyser) return;
    const buf = new Uint8Array(this.analyser.fftSize);
    const tick = (): void => {
      if (!this.enabled || !this.analyser) return;
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      sendToBgFromContent({ type: 'CT_RMS', level: rms });
    };
    this.rmsTimer = window.setInterval(tick, 1000 / 30); // 30 Hz
  }

  private stopRmsTicker(): void {
    if (this.rmsTimer != null) {
      window.clearInterval(this.rmsTimer);
      this.rmsTimer = null;
    }
  }
}
