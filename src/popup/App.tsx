import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabState, BgToPopup } from '../shared/types';
import { MAX_GAIN, clampGain } from '../shared/types';
import { sendToBackground } from '../shared/messaging';
import { TabStatusHeader } from './TabStatusHeader';
import { VUMeter } from './VUMeter';
import { VolumeDial } from './VolumeDial';
import { MuteToggle } from './MuteToggle';
import { ControlToggle } from './ControlToggle';
import { PresetChips } from './PresetChips';

const STATUS_LABEL: Record<TabState['status'], string> = {
  unavailable: 'no audio',
  inactive: 'standby',
  active: 'live',
  muted: 'muted',
};

export function App(): JSX.Element {
  const [state, setState] = useState<TabState | null>(null);
  const [rms, setRms] = useState(0);
  const [favIcon, setFavIcon] = useState<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || cancelled) return;

      if (tab.favIconUrl && /^https?:/i.test(tab.favIconUrl)) {
        setFavIcon(tab.favIconUrl);
      }

      const port = chrome.runtime.connect({ name: `popup:${tab.id}` });
      portRef.current = port;
      port.onMessage.addListener((msg: BgToPopup) => {
        if (msg.type === 'STATE') setState(msg.state);
        else if (msg.type === 'RMS') setRms(msg.level);
      });

      const initial = await sendToBackground<TabState>({ type: 'GET_TAB_STATE' });
      if (!cancelled) setState(initial);
    })();
    return () => {
      cancelled = true;
      portRef.current?.disconnect();
    };
  }, []);

  const setGain = useCallback((gain: number) => {
    sendToBackground({ type: 'SET_GAIN', gain: clampGain(gain) });
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    sendToBackground({ type: 'SET_MUTED', muted });
  }, []);

  // === Keyboard shortcuts ===
  useEffect(() => {
    if (!state) return;
    const isLive = state.status === 'active' || state.status === 'muted';
    const handler = (e: KeyboardEvent): void => {
      // Ignore keys when the user is editing a text input.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;

      if (e.key === 'm' || e.key === 'M') {
        if (!isLive) return;
        e.preventDefault();
        setMuted(state.status !== 'muted');
        return;
      }

      if (!isLive) return;
      const pct = Math.round((state.gain / MAX_GAIN) * 100);
      const step = e.shiftKey ? 10 : 5;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setGain(((pct + step) / 100) * MAX_GAIN);
          return;
        case 'ArrowDown':
          e.preventDefault();
          setGain(((pct - step) / 100) * MAX_GAIN);
          return;
        case '0':
          e.preventDefault();
          setGain(0);
          return;
        case '5':
          e.preventDefault();
          setGain(0.5 * MAX_GAIN);
          return;
        case 'Enter':
          e.preventDefault();
          setGain(MAX_GAIN);
          return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, setGain, setMuted]);

  if (!state) {
    return (
      <div className="shell">
        <div className="loading">preparing</div>
      </div>
    );
  }

  const isLive = state.status === 'active' || state.status === 'muted';

  return (
    <div className="shell">
      <div className="meta">
        <span className="meta__label">Volume Control</span>
        <span className="meta__status">
          <span className="meta__dot" data-status={state.status} aria-hidden />
          <span>{STATUS_LABEL[state.status]}</span>
        </span>
      </div>

      <TabStatusHeader state={state} favIconUrl={favIcon} />

      <VolumeDial
        value={state.gain}
        status={state.status}
        disabled={!isLive}
        onChange={setGain}
      />

      <VUMeter level={isLive ? rms : 0} gain={state.gain} active={isLive} />

      <PresetChips
        currentPct={Math.round((state.gain / MAX_GAIN) * 100)}
        disabled={!isLive}
        onPick={setGain}
      />

      <div className="actions">
        <MuteToggle
          muted={state.status === 'muted'}
          disabled={!isLive}
          onToggle={setMuted}
        />
        <ControlToggle
          status={state.status}
          onEnable={() => sendToBackground({ type: 'ENABLE_CONTROL' })}
          onDisable={() => sendToBackground({ type: 'DISABLE_CONTROL' })}
        />
      </div>

      <div className="hint">
        <kbd>M</kbd> mute · <kbd>↑</kbd><kbd>↓</kbd> ±5% · <kbd>0</kbd> <kbd>5</kbd> <kbd>⏎</kbd> snap
      </div>
    </div>
  );
}
