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

// Subject detection uses a small mask; portrait RGB is decoded separately at original quality.
export const DEPTH_SIDE = 8192;

/**
 * The cut-out, plus why there isn't one. The status is what Settings shows, so
 * a photo that won't segment says so instead of quietly staying a circle.
 *
 *   off   — switched off, or no photo
 *   wait  — being prepared, or the segmentation model is still downloading
 *   ready — there is a cut-out
 *   none  — the segmenter found no clear subject in this photo
 *   error — something else went wrong; `detail` says what
 */
const pendingDepth = new Map();
export function useDepth(image, enabled = true, fade = 24) {
  const feather = Number.isFinite(fade) ? Math.max(0, Math.min(55, Math.round(fade))) : 24;
  const key = `${image}@original-v4@${feather}`;
  const [state, setState] = useState({ status: 'off' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let retryTimer;
    if (!image || !enabled || !Dialer?.prepareDepth) {
      setState({ key, image, status: !image || !enabled ? 'off' : 'error' });
      return undefined;
    }
    if (depthCache.has(key)) { setState(depthCache.get(key)); return undefined; }
    setState((old) => ({ ...(old.image === image ? old : {}), key, image, status: 'wait' }));
    const timer = setTimeout(() => {
      if (!pendingDepth.has(key)) pendingDepth.set(key, Dialer.prepareDepth(image, 8192, feather / 100).then((r) => {
        const next = r?.foreground && r?.box
          ? { key, image, status: 'ready', ...r }
          : { key, image, status: r?.reason === 'no-subject' ? 'none' : r?.reason === 'model' ? 'wait' : 'error', detail: r?.detail || r?.reason };
        if (next.status === 'ready' || next.status === 'none') {
          depthCache.set(key, next);
          if (depthCache.size > 12) depthCache.delete(depthCache.keys().next().value);
        }
        return next;
      }).finally(() => pendingDepth.delete(key)));
      pendingDepth.get(key).then((next) => {
        if (!alive) return;
        if (next.status === 'wait' && attempt < 12) {
          setState(next);
          retryTimer = setTimeout(() => { if (alive) setAttempt((n) => n + 1); }, 5000);
        } else setState(next.status === 'wait' ? { ...next, status: 'error', detail: next.detail || 'Subject model unavailable. Try again later.' } : next);
      })
        .catch((e) => { if (alive) setState({ key, image, status: 'error', detail: e?.message }); });
    }, 180);
    return () => { alive = false; clearTimeout(timer); clearTimeout(retryTimer); };
  }, [image, enabled, key, feather, attempt]);
  return state.key === key ? state : state.image === image && enabled && state.foreground ? { ...state, status: 'wait' } : { status: image && enabled ? 'wait' : 'off' };
}

export const depthAvailable = () => !!(Dialer && Dialer.prepareDepth);

/**
 * What the controls in Settings mean:
 *   sprout — how far out of the circle the person rises, as a share of its width
 *   scale  — their size in the frame
 *   x, y   — a nudge, for a photo whose subject sits off to one side
 */
export const DEPTH_DEFAULTS = { depth: true, depthSprout: 48, depthScale: 100, depthX: 0, depthY: 0, depthFade: 24, depthNameSize: 42, depthNameY: 10 };

export const DEPTH_LIMITS = {
  sprout: { min: 0, max: 70, step: 2 },
  scale: { min: 50, max: 185, step: 5 },
  offset: { min: -200, max: 200, step: 2 },
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
