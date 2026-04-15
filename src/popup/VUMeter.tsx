const SEGMENTS = 24;

export function VUMeter({
  level,
  gain,
  active,
}: {
  level: number;
  gain: number;
  active: boolean;
}): JSX.Element {
  // Visualized intensity = measured RMS weighted by applied gain.
  const intensity = Math.min(1, level * (0.6 + gain * 1.1));
  const lit = active ? Math.round(intensity * SEGMENTS) : 0;

  return (
    <div className="vu" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="vu__seg"
          data-on={i < lit ? 'true' : 'false'}
          style={{ animationDelay: `${i * 12}ms` }}
        />
      ))}
    </div>
  );
}
