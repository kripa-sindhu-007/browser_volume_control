import { useEffect, useRef, useState } from 'react';
import type { TabState, BgToPopup } from '../shared/types';
import { sendToBackground } from '../shared/messaging';
import { TabStatusHeader } from './TabStatusHeader';
import { VUMeter } from './VUMeter';
import { VolumeDial } from './VolumeDial';
import { MuteToggle } from './MuteToggle';
import { ControlToggle } from './ControlToggle';

export function App(): JSX.Element {
  const [state, setState] = useState<TabState | null>(null);
  const [rms, setRms] = useState(0);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || cancelled) return;

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

  if (!state) {
    return (
      <div className="shell">
        <div className="loading">initialising</div>
      </div>
    );
  }

  const isLive = state.status === 'active' || state.status === 'muted';

  return (
    <div className="shell" data-status={state.status}>
      <div className="grain" aria-hidden />
      <TabStatusHeader state={state} />

      <VUMeter level={isLive ? rms : 0} gain={state.gain} active={isLive} />

      <VolumeDial
        value={state.gain}
        disabled={!isLive}
        onChange={(g) => sendToBackground({ type: 'SET_GAIN', gain: g })}
      />

      <div className="actions">
        <MuteToggle
          muted={state.status === 'muted'}
          disabled={!isLive}
          onToggle={(m) => sendToBackground({ type: 'SET_MUTED', muted: m })}
        />
        <ControlToggle
          status={state.status}
          onEnable={() => sendToBackground({ type: 'ENABLE_CONTROL' })}
          onDisable={() => sendToBackground({ type: 'DISABLE_CONTROL' })}
        />
      </div>
    </div>
  );
}
