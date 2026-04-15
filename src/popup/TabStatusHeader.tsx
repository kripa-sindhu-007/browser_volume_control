import { useState } from 'react';
import type { TabState } from '../shared/types';

export function TabStatusHeader({
  state,
  favIconUrl,
}: {
  state: TabState;
  favIconUrl: string | null;
}): JSX.Element {
  const [broken, setBroken] = useState(false);
  const host = state.origin ? new URL(state.origin).host : 'No audio source';
  const showIcon = favIconUrl && !broken && state.origin;
  return (
    <div className="host">
      <div className="host__row">
        {showIcon ? (
          <img
            className="host__fav"
            src={favIconUrl}
            alt=""
            onError={() => setBroken(true)}
            width={20}
            height={20}
          />
        ) : (
          <span className="host__fav host__fav--placeholder" aria-hidden />
        )}
        <div className="host__domain" title={state.origin ?? ''}>
          {host}
        </div>
      </div>
      <div className="host__sub">
        {state.hasMedia ? 'audio detected · current tab' : 'this page has no audio'}
      </div>
    </div>
  );
}
