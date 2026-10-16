import * as Haptics from 'expo-haptics';

/**
 * The gentle tick lists give as items pass under your thumb.
 *
 * expo-haptics has no amplitude dial, so "quieter" means two things: a
 * lighter effect style, and fewer ticks — during a fast fling the spacing is
 * what you actually feel. `strength` is 0–1 against the old full-strength
 * tick, so 0.6 is 40% less.
 */

const SOFT = Haptics.ImpactFeedbackStyle.Soft || Haptics.ImpactFeedbackStyle.Light;

// ms between ticks at full strength; a weaker tick is spaced further apart
const FULL_GAP = 26;

let enabled = true;
let last = 0;

/** Follows the Haptics switch in Settings. */
export function setHapticsEnabled(on) {
  enabled = on !== false;
}

export function scrollTick(strength = 0.6) {
  if (!enabled || !strength || strength <= 0) return;
  const now = Date.now();
  if (now - last < FULL_GAP / Math.max(0.15, strength)) return;
  last = now;
  // Soft is the gentlest effect there is, so below it only the spacing grows.
  const effect = strength >= 0.85 ? Haptics.selectionAsync() : Haptics.impactAsync(SOFT);
  if (effect && effect.catch) effect.catch(() => {});
}
