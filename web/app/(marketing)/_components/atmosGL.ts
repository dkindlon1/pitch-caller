// The light behind the watch, drawn by a small WebGL shader instead of stacked CSS gradients.
// CSS radial gradients fall off in straight lines and end in visible elliptical edges, so on a near-black page they
// read as flat discs and band. This draws the same story (a far haze, the blue bloom, the floodlight from above, the
// green bloom and floor when the call lands, the playground's light) as soft, noise-shaped light that drifts slowly,
// mixes in linear light, is tone-mapped and dithered, so it never shows a step or an edge.
//
// The scroll timeline still drives everything: it keeps tweening the old light elements, which stay in the page as
// invisible proxies (.pq-pin.has-gl hides them), and every frame the shader reads their opacity, scale and position.
// No WebGL, or a lost context: the proxies stay visible and the CSS version shows instead.

export type AtmosValues = {
  blue: number; blueScale: number; green: number; greenScale: number;
  haze: number; hazeY: number; beam: number; beamRot: number; floor: number; floorY: number; pg: number;
};

const VERT = `attribute vec2 a; varying vec2 v; void main(){ v = a * 0.5 + 0.5; v.y = 1.0 - v.y; gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `precision highp float;
varying vec2 v;
uniform vec2 uRes; uniform float uT, uAsp;
uniform float uBlue, uBS, uGreen, uGS, uHaze, uHazeY, uBeam, uBeamRot, uFloor, uFloorY, uPg;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float blob(vec2 uv, vec2 c, vec2 r){ vec2 d = (uv - c) / r; d.x *= uAsp; return exp(-dot(d, d)); }
void main(){
  vec2 uv = v; float t = uT;
  // distances in units of the screen's shorter side, so a phone gets the same contained light as a desktop
  float sm = min(uAsp, 1.0);
  vec2 p = (uv - vec2(0.5, 0.52)) * vec2(uAsp, 1.0) / sm;
  // slow domain warp: the light breathes and drifts instead of sitting still
  vec2 q = vec2(fbm(p * 1.5 + vec2(0.0, t * 0.035)), fbm(p * 1.5 + vec2(5.2, -t * 0.03)));
  float n = fbm(p * 1.15 + q * 1.5 + vec2(t * 0.02, 0.0));
  float r = length(p);
  // the blooms around the watch: gaussian falloff, radius moved by the noise so there is no clean circle
  float rb = r / (0.46 * uBS) * (0.85 + 0.3 * n); float bloomB = exp(-rb * rb * 2.0);
  float rg = r / (0.3 * uGS) * (0.85 + 0.3 * n); float bloomG = exp(-rg * rg * 2.2);
  float rh = r / (0.62 * uGS); float haloG = exp(-rh * rh * 2.0);   // the long soft tail of the green light
  // far haze: two big soft masses in opposite corners, drifting with the scroll (parallax)
  vec2 h = uv + vec2(0.0, uHazeY);
  float haze = (blob(h, vec2(0.13, 0.18), vec2(0.62, 0.7)) + blob(h, vec2(0.9, 0.84), vec2(0.66, 0.74))) * (0.5 + 0.8 * n);
  // floodlight from above: a soft cone with faint streaks running down it
  vec2 bp = uv - vec2(0.5, -0.14); bp.x *= uAsp;
  float ang = atan(bp.x, bp.y) - uBeamRot, bl = length(bp);
  float beam = exp(-pow(ang / 0.15, 2.0)) * smoothstep(1.3, 0.12, bl) * (0.6 + 0.8 * noise(vec2(ang * 10.0, bl * 1.4 - t * 0.06)));
  // the green floor of light that rises with the call
  float floorL = blob(uv, vec2(0.5, 1.1 + uFloorY), vec2(0.75, 0.5));
  // the playground's light: two deep masses and two small blue glints
  float pg = blob(uv, vec2(0.16, 0.62), vec2(0.42, 0.52)) + blob(uv, vec2(0.86, 0.44), vec2(0.38, 0.5)) * 0.9;
  float pgGlint = blob(uv, vec2(0.3, 0.27), vec2(0.12, 0.14)) + blob(uv, vec2(0.71, 0.8), vec2(0.11, 0.13));
  // colours in linear light: midnight #14224f, read glow #2f5bff (and its lit top), link green #62f07a
  vec3 midnight = vec3(0.0070, 0.0160, 0.0780), blue = vec3(0.0284, 0.1046, 1.0), blueHi = vec3(0.158, 0.266, 1.0), green = vec3(0.122, 0.871, 0.195);
  vec3 c = vec3(0.0);
  c += midnight * haze * uHaze * 0.2;
  c += mix(blue, blueHi, n) * bloomB * uBlue * 0.05;
  c += mix(green, vec3(0.06, 0.62, 0.42), 1.0 - n) * (bloomG * 0.07 + haloG * 0.012) * uGreen;
  c += blueHi * beam * uBeam * 0.035;
  c += mix(green, blue, 0.3) * floorL * uFloor * 0.03;
  c += (midnight * pg * 0.2 + blue * pgGlint * 0.008) * uPg * (0.8 + 0.4 * n);
  // vignette: the edges of the frame stay dark, so the light reads as being in a room, not painted on the glass
  vec2 vd = (uv - 0.5) * vec2(uAsp * 0.85, 1.0) / max(sm, 0.75); c *= mix(0.3, 1.0, smoothstep(1.0, 0.25, length(vd)));
  c = 1.0 - exp(-c * 1.25);                    // soft shoulder: bright light never clips into a flat patch
  c = pow(c, vec3(1.0 / 2.2));                 // to sRGB
  c += (hash(gl_FragCoord.xy + fract(t * 7.0) * 61.0) - 0.5) * (2.5 / 255.0);   // dither: no banding steps
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

const NAMES = ["uRes", "uT", "uAsp", "uBlue", "uBS", "uGreen", "uGS", "uHaze", "uHazeY", "uBeam", "uBeamRot", "uFloor", "uFloorY", "uPg"] as const;

/** Starts the shader on `canvas`. `read` returns the current light values. Returns a stop function, or null without WebGL. */
export function startAtmos(canvas: HTMLCanvasElement, host: HTMLElement, read: () => AtmosValues, hold: () => boolean = () => false): (() => void) | null {
  if (new URLSearchParams(window.location.search).has("nogl")) return null;     // ?nogl=1: the CSS light, for comparison
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "low-power" });
  if (!gl) return null;
  // a software renderer (no graphics card) would spend the CPU the scroll needs: use the CSS light there (?gl=1 forces it)
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer) && !new URLSearchParams(window.location.search).has("gl")) { gl.getExtension("WEBGL_lose_context")?.loseContext(); return null; }
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(NAMES.map((k) => [k, gl.getUniformLocation(prog, k)])) as Record<(typeof NAMES)[number], WebGLUniformLocation | null>;

  // the light is soft, so it is drawn at 40% of the CSS size and the browser scales it up smoothly
  const size = () => {
    const w = Math.max(2, Math.round(canvas.clientWidth * 0.4)), h = Math.max(2, Math.round(canvas.clientHeight * 0.4));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  let raf = 0, visible = true, dark = false, lost = false;
  const t0 = performance.now();
  const draw = (now: number) => {
    raf = 0;
    if (!visible || lost || document.hidden) return;
    // held (the playground's glass is refracting at rest): keep the last frame, since anything moving under a
    // refracting panel makes the compositor redo the filter every frame
    if (hold()) { raf = requestAnimationFrame(draw); return; }
    const a = read();
    const lit = a.blue + a.green + a.haze + a.beam + a.floor + a.pg > 0.004;
    if (lit || !dark) {
      size();
      gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform1f(U.uT, (now - t0) / 1000); gl.uniform1f(U.uAsp, canvas.width / canvas.height);
      gl.uniform1f(U.uBlue, a.blue); gl.uniform1f(U.uBS, Math.max(0.2, a.blueScale)); gl.uniform1f(U.uGreen, a.green); gl.uniform1f(U.uGS, Math.max(0.2, a.greenScale));
      gl.uniform1f(U.uHaze, a.haze); gl.uniform1f(U.uHazeY, a.hazeY); gl.uniform1f(U.uBeam, a.beam); gl.uniform1f(U.uBeamRot, a.beamRot);
      gl.uniform1f(U.uFloor, a.floor); gl.uniform1f(U.uFloorY, a.floorY); gl.uniform1f(U.uPg, a.pg);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      dark = !lit;              // one black frame after the light goes out, then rest until it comes back
    }
    raf = requestAnimationFrame(draw);
  };
  const kick = () => { if (!raf && visible && !lost && !document.hidden) raf = requestAnimationFrame(draw); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
  io.observe(host);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e: Event) => { e.preventDefault(); lost = true; host.classList.remove("has-gl"); };
  canvas.addEventListener("webglcontextlost", onLost);
  host.classList.add("has-gl");
  kick();
  return () => {
    cancelAnimationFrame(raf); raf = 0; io.disconnect(); document.removeEventListener("visibilitychange", onVis);
    canvas.removeEventListener("webglcontextlost", onLost); host.classList.remove("has-gl");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
