import { useEffect, useRef, useState } from 'react';

const BARS = 11;

/**
 * Music-app style bar visualizer. One RMS value drives N bars with
 * per-bar phase + bell-curve weighting so the centre bars push harder
 * than the edges, giving a "equaliser" feel without real FFT data.
 * Smoothed per-frame toward target heights with asymmetric attack/decay.
 */
export function VUMeter({
  level,
  gain,
  active,
}: {
  level: number;
  gain: number;
  active: boolean;
}): JSX.Element {
  const [heights, setHeights] = useState<number[]>(() => Array(BARS).fill(0.12));
  const targetRef = useRef<number[]>(Array(BARS).fill(0.12));
  const currentRef = useRef<number[]>(Array(BARS).fill(0.12));
  const levelRef = useRef(0);
  const gainRef = useRef(1);
  const activeRef = useRef(false);
  const tRef = useRef(0);

  levelRef.current = level;
  gainRef.current = gain;
  activeRef.current = active;

  useEffect(() => {
    let raf = 0;

    const loop = (): void => {
      tRef.current += 1;
      const t = tRef.current;
      const lvl = activeRef.current ? Math.min(1, levelRef.current * (0.7 + gainRef.current * 1.1)) : 0;

      for (let i = 0; i < BARS; i++) {
        // Bell-curve weighting: centre bars louder than edges.
        const centre = (BARS - 1) / 2;
        const bell = 1 - Math.abs(i - centre) / (centre + 0.8);

        // Per-bar oscillation to simulate independent frequency bands.
        const wobble =
          0.55 + 0.45 * Math.abs(Math.sin(t * 0.11 + i * 1.7) + 0.6 * Math.sin(t * 0.23 + i * 0.9));

        const floor = 0.1;
        const target = activeRef.current
          ? Math.max(floor, floor + lvl * bell * wobble * 0.95)
          : floor;

        targetRef.current[i] = target;

        // Asymmetric smoothing: fast attack, slower decay — like real VU meters.
        const curr = currentRef.current[i];
        const delta = target - curr;
        const k = delta > 0 ? 0.5 : 0.12;
        currentRef.current[i] = curr + delta * k;
      }

      setHeights([...currentRef.current]);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="bars" aria-hidden data-active={active}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="bars__bar"
          style={{ transform: `scaleY(${h.toFixed(3)})` }}
        />
      ))}
    </div>
  );
}
