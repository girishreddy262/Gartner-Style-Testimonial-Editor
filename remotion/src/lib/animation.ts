// Shared animation helpers — match the editor's CSS transitions exactly.

// cubic-bezier(0.25, 0.1, 0.25, 1) = standard "ease"
// Approximation suitable for Remotion's interpolate(): the editor uses this
// for all bullet reveal transitions (600ms opacity + max-height + transform).
export const EASE_OUT = (t: number): number => {
  // Cubic ease-out: 1 - (1 - t)^3 — a close enough approximation of the
  // CSS cubic-bezier(0.25, 0.1, 0.25, 1) for our purposes.
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
};

// Linear t→t01 mapper between two timestamps
export const t01 = (t: number, from: number, to: number): number => {
  if (to <= from) return t >= from ? 1 : 0;
  return Math.max(0, Math.min(1, (t - from) / (to - from)));
};

// Reveal progress for a callout item at time t.
// At t = itemTime: progress = 0 (hidden)
// At t = itemTime + duration: progress = 1 (fully visible)
export const itemReveal = (
  itemTime: number,
  t: number,
  duration = 0.6
): number => {
  return EASE_OUT(t01(t, itemTime, itemTime + duration));
};

// Card scale-in animation for callouts.
// Tuned for a visible "ease-in" feel, not a sudden pop:
//   - Duration 800ms (was 700ms) — slightly longer to be perceptible
//   - Scale starts at 0.88 not 0 — looks like a card growing into view, not exploding
//   - Quadratic ease-out — gentler than pow(1-p, 4) which finishes too fast
//   - Opacity ramps the FULL duration in lockstep with scale (no early plateau)
export const cardEntrance = (
  startTime: number,
  t: number,
  duration = 0.8
): { opacity: number; scale: number } => {
  const p = t01(t, startTime, startTime + duration);
  const ease = 1 - Math.pow(1 - p, 2); // quadratic ease-out — visible the whole time
  const scale = 0.88 + ease * 0.12;     // 0.88 → 1.0
  return { opacity: ease, scale };
};

// Card exit animation (faster, simpler — exits don't need to be perceptible)
export const cardExit = (
  endTime: number,
  t: number,
  duration = 0.4
): { opacity: number; scale: number } => {
  const p = t01(t, endTime - duration, endTime);
  return { opacity: 1 - p, scale: 1 - p * 0.05 };
};

// Convenience: full card visibility from start to end, with entrance and exit
export const cardLifecycle = (
  start: number,
  end: number,
  t: number
): { opacity: number; scale: number } => {
  if (t < start) return { opacity: 0, scale: 0.88 };
  if (t > end) return { opacity: 0, scale: 0.95 };
  // Entrance during first 0.8s
  if (t < start + 0.8) {
    return cardEntrance(start, t);
  }
  // Exit during last 0.4s
  if (t > end - 0.4) {
    return cardExit(end, t);
  }
  return { opacity: 1, scale: 1 };
};
