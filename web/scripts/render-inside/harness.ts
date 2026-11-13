// Runs in headless Chromium (driven by scripts/render-inside.cjs). Each output frame is the float average of several
// subframes: each one nudged by a sub-pixel jitter (anti-aliasing) and spread across a shutter (motion blur), then
// dithered once on the way back to 8 bits so the dark gradients don't band.
import { createInside } from "../../render/insideScene";

type Inside = ReturnType<typeof createInside>;
let S: Inside, W = 0, H = 0, acc = new Float32Array(0);
const out = document.createElement("canvas");
const halton = (i: number, b: number) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

async function setup(lw: number, lh: number, scale: number) {
  S = createInside({ lw, lh, scale }); (window as unknown as { __S: Inside }).__S = S;
  document.body.appendChild(S.canvas);
  await S.ready;
  W = S.canvas.width; H = S.canvas.height;
  out.width = W; out.height = H;
  acc = new Float32Array(W * H * 3);
  return { W, H, zone: S.zone };
}

// subframes needed so that no step of the motion blur is more than `step` device pixels (at least `min`, at most `max`;
// the defaults, 2 px and 48, are the full-quality render; render-inside.cjs can pass STEP and MAXSUBS for a faster one)
const subsFor = (u: number, du: number, shutter: number, min: number, step = 2, max = 48) =>
  du > 0 ? Math.max(min, Math.min(max, Math.ceil(S.motion(u - (du * shutter) / 2, u + (du * shutter) / 2) / step))) : min;

async function frame(u: number, du: number, minSubs: number, shutter: number, step = 2, max = 48) {
  const subs = subsFor(u, du, shutter, minSubs, step, max);
  acc.fill(0);
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  for (let k = 0; k < subs; k++) {
    const t = du > 0 ? u + ((k + 0.5) / subs - 0.5) * du * shutter : u;
    S.render(t, halton(k + 1, 2) - 0.5, halton(k + 1, 3) - 0.5);
    ctx.drawImage(S.canvas, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { acc[j] += d[i]; acc[j + 1] += d[i + 1]; acc[j + 2] += d[i + 2]; }
  }
  const img = ctx.createImageData(W, H), o = img.data;
  let seed = 1 + Math.floor(u * 100003);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0, j = 0; i < o.length; i += 4, j += 3) {
    const n = rnd() - rnd();   // triangular dither, +-1 level
    o[i] = acc[j] / subs + n; o[i + 1] = acc[j + 1] / subs + n; o[i + 2] = acc[j + 2] / subs + n; o[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob: Blob = await new Promise((r) => out.toBlob((b) => r(b!), "image/png"));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { png: btoa(bin), anchors: S.anchors(u), subs };
}

Object.assign(window, { setup, frame, subsFor: (u: number, du: number) => subsFor(u, du, 0.6, 8) });
