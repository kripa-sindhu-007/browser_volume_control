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
    return document.querySelectorAll('audio, video').length > 0;
  }

  private attachAllExisting(): void {
    const els = document.querySelectorAll<HTMLMediaElement>('audio, video');
    els.forEach((el) => this.attach(el));
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

  private startObserver(): void {
    this.observer = new MutationObserver((muts) => {
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
          }
        });
      }
      if (changed) {
        sendToBgFromContent({ type: 'CT_MEDIA_CHANGED', hasMedia: this.probeMedia() });
      }
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  private stopObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
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
