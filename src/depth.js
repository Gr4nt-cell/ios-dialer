import { useEffect, useState } from 'react';
import Dialer from './dialer';

// Cut-out of the person in a contact photo, cached per photo
// (see DialerModule.prepareDepth). Shared by the call screen and the
// depth-effect preview in Settings so both show exactly the same cut-out.
const depthCache = new Map();

export function useDepth(image, enabled = true) {
  const [depth, setDepth] = useState(() => (image && depthCache.get(image)) || null);
  useEffect(() => {
    let alive = true;
    if (!image || !enabled || !Dialer || !Dialer.prepareDepth) {
      setDepth(null);
      return undefined;
    }
    if (depthCache.has(image)) {
      setDepth(depthCache.get(image));
      return undefined;
    }
    setDepth(null);
    Dialer.prepareDepth(image)
      .then((r) => {
        if (r && r.base && r.foreground) depthCache.set(image, r);
        if (alive) setDepth(r && r.base && r.foreground ? r : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [image, enabled]);
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
