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
      <button className="btn btn--ctl" type="button" disabled>
        no audio
      </button>
    );
  }
  if (status === 'inactive') {
    return (
      <button className="btn btn--ctl btn--primary" type="button" onClick={onEnable}>
        enable
      </button>
    );
  }
  return (
    <button className="btn btn--ctl" type="button" onClick={onDisable}>
      stop control
    </button>
  );
}
