import { MAX_GAIN } from '../shared/types';

const PRESETS = [
  { label: 'Quiet', pct: 25 },
  { label: 'Mid', pct: 50 },
  { label: 'Loud', pct: 75 },
  { label: 'Full', pct: 100 },
];

export function PresetChips({
  currentPct,
  disabled,
  onPick,
}: {
  currentPct: number;
  disabled: boolean;
  onPick: (gain: number) => void;
}): JSX.Element {
  return (
    <div className="presets" role="group" aria-label="Volume presets">
      {PRESETS.map((p) => {
        const active = Math.abs(currentPct - p.pct) < 1;
        return (
          <button
            key={p.pct}
            className="preset"
            type="button"
            disabled={disabled}
            data-active={active}
            onClick={() => onPick((p.pct / 100) * MAX_GAIN)}
            aria-pressed={active}
          >
            <span className="preset__label">{p.label}</span>
            <span className="preset__value">{p.pct}</span>
          </button>
        );
      })}
    </div>
  );
}
