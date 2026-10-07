import { useEffect, useState } from "react";
import { formatNumber } from "../../../lib/format";
import { usePrefersReducedMotion } from "../../../lib/usePrefersReducedMotion";

type AnimatedNumberProps = {
  value: number;
  /** Wait this long before counting (to start with the line it's in). */
  delayMs?: number;
  durationMs?: number;
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts up from zero to `value` when it appears. Screen readers get the final number
 * straight away; with reduced motion, so does everyone.
 */
export function AnimatedNumber({ value, delayMs = 0, durationMs = 1400 }: AnimatedNumberProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      return;
    }
    const start = performance.now() + delayMs;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      setShown(Math.round(value * easeOut(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, delayMs, durationMs, reduceMotion]);

  return (
    <>
      <span aria-hidden className="tabular-nums">
        {formatNumber(shown)}
      </span>
      <span className="sr-only">{formatNumber(value)}</span>
    </>
  );
}
