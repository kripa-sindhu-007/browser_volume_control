import { MAX_GAIN } from '../shared/types';

export function VolumeDial({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (gain: number) => void;
}): JSX.Element {
  const pct = Math.round((value / MAX_GAIN) * 100);
  const display = pct.toString().padStart(3, '0');
  return (
    <section className="dial" data-disabled={disabled}>
      <div className="dial__readout" aria-hidden>
        {display.split('').map((d, i) => (
          <span key={i} className="dial__digit">{d}</span>
        ))}
      </div>
      <input
        className="dial__slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        disabled={disabled}
        aria-label="Volume"
        aria-valuetext={`${pct} percent`}
        onChange={(e) => onChange(Number(e.target.value) / 100 * MAX_GAIN)}
      />
    </section>
  );
}
