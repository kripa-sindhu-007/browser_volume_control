import { useCallback, useRef } from 'react';
import { MAX_GAIN, clampGain, type TabStatus } from '../shared/types';
import { RollingNumber } from './RollingNumber';

export function VolumeDial({
  value,
  status,
  disabled,
  onChange,
}: {
  value: number;
  status: TabStatus;
  disabled: boolean;
  onChange: (gain: number) => void;
}): JSX.Element {
  const pct = Math.round((value / MAX_GAIN) * 100);
  const dragStart = useRef<{ y: number; pct: number } | null>(null);

  const nudge = useCallback(
    (deltaPct: number) => {
      if (disabled) return;
      const next = clampGain(((pct + deltaPct) / 100) * MAX_GAIN);
      onChange(next);
    },
    [disabled, pct, onChange]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      // Upward scroll -> louder. Trackpads fire small deltas; normalise.
      const step = Math.sign(-e.deltaY) * Math.min(5, Math.max(1, Math.round(Math.abs(e.deltaY) / 8)));
      nudge(step);
    },
    [disabled, nudge]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, pct };
    },
    [disabled, pct]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      const dy = dragStart.current.y - e.clientY;
      const nextPct = Math.max(0, Math.min(100, dragStart.current.pct + dy));
      onChange((nextPct / 100) * MAX_GAIN);
    },
    [onChange]
  );

  const onPointerUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  return (
    <section className="dial" data-disabled={disabled}>
      <div
        className="hero"
        data-disabled={disabled}
        data-scrubbable={!disabled}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-label="Volume (scroll or drag vertically)"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct} percent`}
        tabIndex={disabled ? -1 : 0}
      >
        <div className="hero__number">
          {status === 'muted' ? (
            <em>muted</em>
          ) : (
            <>
              <RollingNumber value={pct} />
              <span className="hero__unit">%</span>
            </>
          )}
        </div>
        <div className="hero__side">
          <span>gain</span>
          <span className="hero__side-value">{value.toFixed(2)}×</span>
        </div>
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
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange((Number(e.target.value) / 100) * MAX_GAIN)}
      />
    </section>
  );
}
