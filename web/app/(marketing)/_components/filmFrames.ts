// The film's frames: fetched, decoded and drawn to the canvas, so that the scrub never waits for a picture.
//
// Two copies of every frame ship (scripts/watch-render/encode.py):
//   - a tiny one, an eighth of the size, packed 50 to a sheet (three small files). The sheets are asked for first and
//     cover the whole film within a moment of the first paint;
//   - the sharp one, a WebP each. The opening frames come first, then whatever is nearest the scroll position in the
//     direction of travel, six at a time. Apart from the very first frame they wait for the first sheet and for `hold`
//     (the page's animation code), so on a slow connection the scrub and the page's motion are not starved by them.
// Sharp frames are kept as their compressed bytes. Only the ones around the scroll position are decoded, off the main
// thread (createImageBitmap), ahead of the scroll, and the ones left behind are released: a decoded frame is 9 MB.
// paint() draws the best picture there is for the frame the scroll asks for, right now: the sharp frame (cross-faded
// with the next one when the scroll sits between two), or a sharp neighbour one frame away, or the tiny copy of the
// exact frame scaled up, or failing all of those the nearest frame of any kind. When the sharp one arrives it is
// swapped in.
export type FilmSet = "wide" | "tall";
type Pic = ImageBitmap | HTMLImageElement;

export const FILM_SIZE = { wide: [1920, 1200], tall: [1080, 1680] } as const;
const LO = { per: 50, cols: 10, div: 8 };          // the tiny copies: frames per sheet, columns, and the scale-down
const OPENING = 12;                                 // sharp frames fetched with the page; the rest wait for eager()
const FETCHES = 6, DECODES = 3;
// how many decoded frames to hold around the scroll position: [ahead, behind] to decode, [ahead, behind] to keep
const WINDOW = { wide: [8, 2, 13, 4], tall: [5, 2, 8, 3] } as const;

export type Frames = ReturnType<typeof filmFrames>;

export function filmFrames(canvas: HTMLCanvasElement, set: FilmSet, count: number, hold?: Promise<unknown>, onFirst?: () => void) {
  const ctx = canvas.getContext("2d");
  const [iw, ih] = FILM_SIZE[set], [AHEAD, BEHIND, KEEP_AHEAD, KEEP_BEHIND] = WINDOW[set];
  const bytes: (Blob | undefined)[] = [], pics: (Pic | undefined)[] = [], tries: number[] = [], sheets: (Pic | undefined)[] = [];
  const fetching = new Set<number>(), decoding = new Set<number>();
  let dead = false, eager = false, open = false, cur = 0, dirn = 1, raf = 0, shownKey = "";
  const src = (i: number) => `/media/film/watch/${set}/${String(i + 1).padStart(4, "0")}.webp`;

  const decode = async (b: Blob): Promise<Pic> => {
    if (typeof createImageBitmap === "function") return createImageBitmap(b);
    const im = new Image(); im.decoding = "async"; im.src = URL.createObjectURL(b);
    await im.decode();
    return im;
  };
  const release = (p: Pic | undefined) => { if (!p) return; if ("close" in p) p.close(); else { URL.revokeObjectURL(p.src); p.src = ""; } };
  const get = (url: string, high = false) => fetch(url, high ? ({ priority: "high" } as RequestInit) : undefined).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });

  // ---------- the tiny copies ----------
  async function loadSheets() {
    for (let s = 0; s * LO.per < count && !dead; s++) {
      try { const p = await decode(await get(`/media/film/watch/${set}-lo-${s + 1}.webp`, true)); if (dead) return release(p); sheets[s] = p; queue(); } catch { /* the sharp frames still come */ }
      if (s === 0) first();
    }
  }
  // the sharp frames may start: the first sheet is in (or failed) and the hold has settled, or 2.5 s have gone by
  let first = () => {};
  Promise.race([Promise.all([new Promise<void>((r) => { first = r; }), hold]), new Promise((r) => window.setTimeout(r, 2500))]).then(() => { open = true; pump(); });
  const tiny = (i: number) => sheets[Math.floor(i / LO.per)];

  // ---------- the sharp frames: fetch by nearness to the scroll position ----------
  const cost = (i: number, c: number) => { const d = (i - c) * dirn; return d >= 0 ? d : -d * 3; };
  function nextFetch() {
    const c = Math.round(cur), limit = !open ? 1 : eager ? count : Math.min(count, OPENING);
    let best = -1, bc = Infinity;
    for (let i = 0; i < limit; i++) if (!bytes[i] && !fetching.has(i) && (tries[i] || 0) < 2) { const k = cost(i, c); if (k < bc) { bc = k; best = i; } }
    return best;
  }
  function pump() {
    while (!dead && fetching.size < FETCHES) {
      const i = nextFetch(); if (i < 0) return;
      fetching.add(i); tries[i] = (tries[i] || 0) + 1;
      get(src(i), i === 0).then((b) => { bytes[i] = b; }, () => {}).then(() => { fetching.delete(i); if (dead) return; decodeAround(); pump(); });
    }
  }

  // ---------- decode ahead of the scroll, release what is left behind ----------
  function decodeAround() {
    if (dead) return;
    const c = Math.round(cur), fwd = dirn >= 0;
    const lo = c - (fwd ? KEEP_BEHIND : KEEP_AHEAD), hi = c + (fwd ? KEEP_AHEAD : KEEP_BEHIND);
    for (let i = 0; i < count; i++) if (pics[i] && (i < lo || i > hi)) { release(pics[i]); pics[i] = undefined; }
    const from = Math.max(0, c - (fwd ? BEHIND : AHEAD)), to = Math.min(count - 1, c + (fwd ? AHEAD : BEHIND));
    while (decoding.size < DECODES) {
      let best = -1, bc = Infinity;
      for (let i = from; i <= to; i++) if (bytes[i] && !pics[i] && !decoding.has(i)) { const k = cost(i, c); if (k < bc) { bc = k; best = i; } }
      if (best < 0) return;
      const i = best; decoding.add(i);
      decode(bytes[i]!).then((p) => {
        decoding.delete(i);
        const cc = Math.round(cur);
        if (dead || pics[i] || i < cc - KEEP_AHEAD || i > cc + KEEP_AHEAD) release(p); else { pics[i] = p; queue(); }
        decodeAround();
      }, () => { decoding.delete(i); bytes[i] = undefined; if (!dead) pump(); });      // bytes that will not decode: fetch them once more
    }
  }

  // ---------- draw ----------
  function paint() {
    raf = 0;
    if (dead || !ctx) return;
    const cw = canvas.clientWidth, ch = canvas.clientHeight; if (!cw || !ch) return;
    // device pixels per CSS pixel: the screen's, capped, and never more than the frames themselves have
    const cover = Math.max(cw / iw, ch / ih), scale = Math.min(set === "tall" ? 2 : 1.5, window.devicePixelRatio || 1, 1 / cover);
    const W = Math.round(cw * scale), H = Math.round(ch * scale);
    const lo = Math.max(0, Math.min(count - 1, Math.floor(cur))), hi = Math.min(count - 1, lo + 1), frac = cur - lo, near = frac < 0.5 ? lo : hi;
    // what to draw: [a, b, blend] from the sharp frames (kind 1) or the tiny ones (kind 0)
    let kind = 1, a = -1, b = -1, t = 0;
    const between = hi !== lo && frac > 0.02;
    if (pics[lo] && !between) a = lo;
    else if (pics[lo] && pics[hi]) { a = lo; b = hi; t = frac; }
    else if (pics[near]) a = near;
    else if (pics[lo] || pics[hi]) a = pics[lo] ? lo : hi;
    else if (tiny(lo)) { kind = 0; a = lo; if (between && tiny(hi)) { b = hi; t = frac; } }
    else {
      for (let d = 2; d < count && a < 0; d++) { if (pics[near - d]) a = near - d; else if (pics[near + d]) a = near + d; }
      if (a < 0) for (let d = 1; d < count && a < 0; d++) { if (near - d >= 0 && tiny(near - d)) { kind = 0; a = near - d; } else if (near + d < count && tiny(near + d)) { kind = 0; a = near + d; } }
    }
    if (a < 0) return;
    const key = `${kind}:${a}:${b}:${t.toFixed(3)}:${W}x${H}`;
    if (key === shownKey) return;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s, x = (W - w) / 2, y = (H - h) / 2;
    const draw = (i: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      if (kind) ctx.drawImage(pics[i]!, x, y, w, h);
      else { const k = i % LO.per, tw = iw / LO.div, th = ih / LO.div; ctx.imageSmoothingQuality = "high"; ctx.drawImage(tiny(i)!, (k % LO.cols) * tw + 0.5, Math.floor(k / LO.cols) * th + 0.5, tw - 1, th - 1, x, y, w, h); }
    };
    draw(a, 1);
    if (b >= 0) draw(b, t);       // the scroll sits between two frames: fade the next one over by the fraction
    ctx.globalAlpha = 1; shownKey = key;
    canvas.dataset.frame = String(a + 1); canvas.dataset.want = String(near + 1); canvas.dataset.sharp = String(kind);
    canvas.dataset.v = String((Number(canvas.dataset.v) || 0) + 1);      // a new picture (the light behind the watch re-reads it)
    canvas.classList.add("is-on");
    if (onFirst) { const f = onFirst; onFirst = undefined; f(); }      // the first picture is on the canvas
  }
  const queue = () => { if (!raf && !dead) raf = requestAnimationFrame(paint); };

  loadSheets();
  pump();
  return {
    /** Show film frame f (0 to count - 1, fractions blend). `now` draws in this call (use inside an animation frame). */
    seek(f: number, now = false) {
      f = Math.max(0, Math.min(count - 1, f));
      if (Math.abs(f - cur) > 0.001) { dirn = f > cur ? 1 : -1; cur = f; decodeAround(); if (fetching.size < FETCHES) pump(); }
      if (now) { cancelAnimationFrame(raf); paint(); } else queue();
    },
    /** Fetch the whole film, not only its opening (the page has loaded, or the visitor has started to scroll). */
    eager() { if (!eager) { eager = true; pump(); } },
    /** The canvas changed size. */
    resize() { shownKey = ""; queue(); },
    get at() { return cur; },
    get loaded() { return bytes.reduce((n, b) => n + (b ? 1 : 0), 0); },
    destroy() {
      dead = true; cancelAnimationFrame(raf);
      pics.forEach(release); sheets.forEach(release); pics.length = bytes.length = sheets.length = 0;
    },
  };
}
