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

// Card entrance — fade + gentle slide-up (NO scale).
// Scale was causing the card to "jump" because it compounded with the
// content height changing as items revealed. A fade+slide reads as smooth
// and is what professional lower-thirds use.
export const cardEntrance = (
  startTime: number,
  t: number,
  duration = 0.6
): { opacity: number; translateY: number } => {
  const p = t01(t, startTime, startTime + duration);
  const ease = 1 - Math.pow(1 - p, 3); // cubic ease-out
  return { opacity: ease, translateY: (1 - ease) * 30 }; // slides up 30px → 0
};

// Card exit — fade + slight slide-down
export const cardExit = (
  endTime: number,
  t: number,
  duration = 0.4
): { opacity: number; translateY: number } => {
  const p = t01(t, endTime - duration, endTime);
  const ease = 1 - Math.pow(1 - p, 2);
  return { opacity: 1 - ease, translateY: ease * 15 };
};

// Convenience: full card visibility from start to end, with entrance and exit
export const cardLifecycle = (
  start: number,
  end: number,
  t: number
): { opacity: number; translateY: number } => {
  if (t < start) return { opacity: 0, translateY: 30 };
  if (t > end) return { opacity: 0, translateY: 15 };
  if (t < start + 0.6) return cardEntrance(start, t);
  if (t > end - 0.4) return cardExit(end, t);
  return { opacity: 1, translateY: 0 };
};
