import { useEffect, useState } from 'react';
import { Dimensions, PixelRatio } from 'react-native';
import Dialer from './dialer';

// Cut-out of the person in a contact photo, cached per photo
// (see DialerModule.prepareDepth). Shared by the call screen and the
// depth-effect preview in Settings so both show exactly the same cut-out.
const depthCache = new Map();

/**
 * Pixels the photo needs on the call screen: the screen's longest side in real
 * device pixels, times the slow push-in, so the zoom is never magnifying a
 * picture that was already smaller than the screen. A phone at 1080x2400 asks
 * for about 2568, which the native side clamps to 2560.
 */
export function screenPhotoSide() {
  const { width, height } = Dimensions.get('window');
  const longest = Math.max(width, height) * PixelRatio.get();
  return Math.round(longest * 1.07);
}

export function useDepth(image, enabled = true, maxSide = screenPhotoSide()) {
  const cacheKey = `${image}@${maxSide}`;
  const [depth, setDepth] = useState(() => (image && depthCache.get(cacheKey)) || null);
  useEffect(() => {
    let alive = true;
    if (!image || !enabled || !Dialer || !Dialer.prepareDepth) {
      setDepth(null);
      return undefined;
    }
    if (depthCache.has(cacheKey)) {
      setDepth(depthCache.get(cacheKey));
      return undefined;
    }
    setDepth(null);
    Dialer.prepareDepth(image, maxSide)
      .then((r) => {
        if (r && r.base && r.foreground) depthCache.set(cacheKey, r);
        if (alive) setDepth(r && r.base && r.foreground ? r : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [image, enabled, maxSide, cacheKey]);
  return depth;
}

export const depthAvailable = () => !!(Dialer && Dialer.prepareDepth);

/** Defaults for the adjustable depth transform. */
export const DEPTH_DEFAULTS = { depthScale: 100, depthX: 0, depthY: 0 };

/**
 * Transform for the cut-out layer. `base` is the screen width the offsets were
 * tuned against, so the Settings preview can scale them down to its own size.
 */
export function depthTransform(settings, factor = 1) {
  const scale = (settings?.depthScale ?? 100) / 100;
  const x = (settings?.depthX ?? 0) * factor;
  const y = (settings?.depthY ?? 0) * factor;
  return [{ translateX: x }, { translateY: y }, { scale }];
}
