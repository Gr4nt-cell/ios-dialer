import { useEffect, useState } from 'react';
import Dialer from './dialer';

/**
 * The person cut out of their contact photo, so the call screen can stand them
 * in front of their own name — the effect in the sketch, where the picture
 * sprouts out of the avatar circle.
 *
 * The cut-out is made once per photo by the on-device segmenter and cached on
 * disk by DialerModule.prepareDepth, which also measures the box the person
 * occupies. That box is what lets this work on any photo: without it the app
 * would be guessing where in the frame the head is.
 */
const depthCache = new Map();

// The cut-out is drawn at about an avatar's width, not full screen, so there is
// no reason to segment a 2560px bitmap for it.
export const DEPTH_SIDE = 1200;

export function useDepth(image, enabled = true) {
  const key = `${image}@${DEPTH_SIDE}`;
  const [depth, setDepth] = useState(() => (image && depthCache.get(key)) || null);
  useEffect(() => {
    let alive = true;
    if (!image || !enabled || !Dialer || !Dialer.prepareDepth) {
      setDepth(null);
      return undefined;
    }
    if (depthCache.has(key)) {
      setDepth(depthCache.get(key));
      return undefined;
    }
    setDepth(null);
    Dialer.prepareDepth(image, DEPTH_SIDE)
      .then((r) => {
        const ok = r && r.foreground && r.box;
        if (ok) depthCache.set(key, r);
        if (alive) setDepth(ok ? r : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [image, enabled, key]);
  return depth;
}

export const depthAvailable = () => !!(Dialer && Dialer.prepareDepth);

/**
 * What the controls in Settings mean:
 *   sprout — how far out of the circle the person rises, as a share of its width
 *   scale  — their size in the frame
 *   x, y   — a nudge, for a photo whose subject sits off to one side
 */
export const DEPTH_DEFAULTS = { depth: true, depthSprout: 48, depthScale: 100, depthX: 0, depthY: 0 };

export const DEPTH_LIMITS = {
  sprout: { min: 0, max: 70, step: 2 },
  scale: { min: 80, max: 140, step: 5 },
  offset: { min: -40, max: 40, step: 2 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * How much bigger than the avatar circle the person is drawn. The circle is a
 * modest 110pt on the call screen; a cut-out at that width would be a thumbnail
 * rather than the poster in the sketch.
 */
export const DEPTH_FRAME = 1.7;

/**
 * Where to draw the cut-out, measured from the centre of the avatar.
 *
 * The person is scaled so their shoulders span most of the frame, then placed
 * so that at sprout 0 their face sits in the middle of the circle, exactly as a
 * plain avatar crop would. Sprout lifts them from there. Everything is measured
 * from the subject's own box rather than from the edges of the photo, so a
 * tight portrait and a full-length snapshot land in the same place.
 */
export function depthLayout(box, frame, settings, factor = 1) {
  const s = settings || {};
  const sprout = clamp(s.depthSprout ?? DEPTH_DEFAULTS.depthSprout, DEPTH_LIMITS.sprout.min, DEPTH_LIMITS.sprout.max) / 100;
  const scale = clamp(s.depthScale ?? DEPTH_DEFAULTS.depthScale, DEPTH_LIMITS.scale.min, DEPTH_LIMITS.scale.max) / 100;
  const dx = clamp(s.depthX ?? 0, DEPTH_LIMITS.offset.min, DEPTH_LIMITS.offset.max) * factor;
  const dy = clamp(s.depthY ?? 0, DEPTH_LIMITS.offset.min, DEPTH_LIMITS.offset.max) * factor;

  const aspect = box.imageWidth > 0 ? box.imageHeight / box.imageWidth : 1;
  const width = (frame * 0.9 * scale) / Math.max(0.08, box.width);
  const height = width * aspect;

  // the face sits around a third of the way down a head-and-shoulders subject
  const faceY = (box.y + box.height * 0.3) * height;
  return {
    width,
    height,
    // offsets from the centre of the avatar to the cut-out's top-left corner
    dx: -(box.x + box.width / 2) * width + dx,
    dy: -faceY - sprout * frame + dy,
  };
}
