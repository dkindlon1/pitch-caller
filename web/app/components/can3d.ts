// Whether to load a 3D scene: not with reduced motion, not on Data Saver, and only with WebGL. Everything 3D on the
// site has a flat version that the server renders, which is what these visitors keep.
export function can3d(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return false;
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

// run f once the page has loaded and the browser is idle, so 3D never competes with the first paint
export function whenIdle(f: () => void): () => void {
  let id: number | undefined;
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  const go = () => { id = w.requestIdleCallback ? w.requestIdleCallback(f, { timeout: 3000 }) : window.setTimeout(f, 1200); };
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  return () => { window.removeEventListener("load", go); if (id !== undefined) { if (w.cancelIdleCallback) w.cancelIdleCallback(id); window.clearTimeout(id); } };
}
