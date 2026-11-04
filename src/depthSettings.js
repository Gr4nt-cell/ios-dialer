export const DEPTH_DEFAULTS = {
  depthSize: 54, depthY: 13, depthX: 0, depthFade: 24,
  depthNameSize: 42, depthNameY: 10,
};
export const DEPTH_RANGES = {
  depthSize: [40, 110], depthY: [8, 40], depthX: [-25, 25],
  depthFade: [0, 55], depthNameSize: [26, 60], depthNameY: [5, 28],
};
export function depthOptions(settings = {}) {
  return Object.fromEntries(Object.entries(DEPTH_DEFAULTS).map(([k, v]) => {
    const n = settings[k];
    return [k, typeof n === 'number' && Number.isFinite(n) ? Math.max(DEPTH_RANGES[k][0], Math.min(DEPTH_RANGES[k][1], n)) : v];
  }));
}

// Preserve the uploaded source's existing sprout/scale/offset preferences.
export function posterSettings(s = {}) {
  return { ...s, callDepth: s.depth !== false,
    depthSize: 54 * (s.depthScale ?? 100) / 100,
    depthY: 13 + ((s.depthY ?? 0) - ((s.depthSprout ?? 48) - 48) * 1.2) / 760 * 100,
    depthX: (s.depthX ?? 0) / 390 * 100,
    depthFade: s.depthFade ?? 24, depthNameSize: s.depthNameSize ?? 42, depthNameY: s.depthNameY ?? 10 };
}
export function posterPatch(p) {
  const out = { ...p };
  if ('callDepth' in p) { out.depth = p.callDepth; delete out.callDepth; }
  if ('depthSize' in p) { out.depthScale = Math.round(p.depthSize / 54 * 100); delete out.depthSize; }
  if ('depthY' in p) { out.depthY = Math.round((p.depthY - 13) / 100 * 760); out.depthSprout = 48; }
  if ('depthX' in p) out.depthX = Math.round(p.depthX / 100 * 390);
  return out;
}
