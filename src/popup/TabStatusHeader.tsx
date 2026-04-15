import type { TabState } from '../shared/types';

const LABEL: Record<TabState['status'], string> = {
  unavailable: 'unavailable',
  inactive: 'inactive',
  active: 'active',
  muted: 'muted',
};

export function TabStatusHeader({ state }: { state: TabState }): JSX.Element {
  const host = state.origin ? new URL(state.origin).host : 'no audio page';
  return (
    <header className="header">
      <div className="header__domain" title={state.origin ?? ''}>
        <span className="header__dot" data-status={state.status} aria-hidden />
        <span className="header__host">{host}</span>
      </div>
      <span className="header__chip" role="status" aria-live="polite">
        {LABEL[state.status]}
      </span>
    </header>
  );
}
