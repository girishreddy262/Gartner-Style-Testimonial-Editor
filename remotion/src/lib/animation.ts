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

// Card scale-in animation for callouts (matches editor: 700ms cubic-bezier(0.22, 1, 0.36, 1))
// Returns { opacity, scale } from 0 → 1 across the duration.
export const cardEntrance = (
  startTime: number,
  t: number,
  duration = 0.7
): { opacity: number; scale: number } => {
  const p = t01(t, startTime, startTime + duration);
  const ease = 1 - Math.pow(1 - p, 4); // sharper ease-out (cubic-bezier(0.22, 1, 0.36, 1) approximation)
  return { opacity: p < 0.6 ? p / 0.6 : 1, scale: ease };
};

// Card exit animation (faster, simpler)
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
  if (t < start) return { opacity: 0, scale: 0 };
  if (t > end) return { opacity: 0, scale: 0.95 };
  // Entrance during first 0.7s
  if (t < start + 0.7) {
    const e = cardEntrance(start, t);
    return e;
  }
  // Exit during last 0.4s
  if (t > end - 0.4) {
    const e = cardExit(end, t);
    return e;
  }
  return { opacity: 1, scale: 1 };
};
