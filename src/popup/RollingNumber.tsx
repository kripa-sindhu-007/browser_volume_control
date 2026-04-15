/**
 * Animated digit strip: each character position shows 0–9 stacked vertically,
 * and the column translates to the target digit. Non-digit characters render
 * statically. Fixed width via tabular-nums at the parent.
 */
export function RollingNumber({ value }: { value: number }): JSX.Element {
  const chars = Math.max(0, Math.round(value)).toString().split('');
  return (
    <span className="roll" aria-hidden>
      {chars.map((ch, i) => {
        const digit = Number(ch);
        if (Number.isNaN(digit)) return <span key={i}>{ch}</span>;
        return (
          <span className="roll__col" key={`${i}-${chars.length}`}>
            <span
              className="roll__strip"
              style={{ transform: `translateY(${-digit * 10}%)` }}
            >
              {Array.from({ length: 10 }, (_, d) => (
                <span className="roll__digit" key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
