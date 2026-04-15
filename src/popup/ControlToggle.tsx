import type { TabStatus } from '../shared/types';

export function ControlToggle({
  status,
  onEnable,
  onDisable,
}: {
  status: TabStatus;
  onEnable: () => void;
  onDisable: () => void;
}): JSX.Element {
  if (status === 'unavailable') {
    return (
      <button className="btn" type="button" disabled>
        Unavailable
      </button>
    );
  }
  if (status === 'inactive') {
    return (
      <button className="btn btn--primary" type="button" onClick={onEnable}>
        Enable
      </button>
    );
  }
  return (
    <button className="btn" type="button" onClick={onDisable}>
      Stop
    </button>
  );
}
