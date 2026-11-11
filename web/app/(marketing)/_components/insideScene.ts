// "Inside the call": what the engine does between the coach's tap and the call, as one continuous 3D shot driven by
// scroll. Every number is real engine output (content/candidates.ts, the same spot as content/mix.ts).
//
// It opens and closes looking straight down on the strike zone, drawn to match the zone on the app's screen exactly
// (same proportions, same box, same dashed chase band), so the site can cut from the app's zone into this one and back.
//   reads   four reads pour into the zone as light
//   weigh   every call it could make rises as a pillar of light, as tall as it is good; the 13 clearly worse burn out
//   draw    a light sweeps the five left and lands on the drawn call; the camera rises back over the zone and the five
//           settle into the marks the app shows
// The zone lies flat like the app draws it seen from behind the plate: far row is up, the hitter's inside on the left.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";
import { CANDIDATES, CAND_PICK } from "@/content/candidates";
import { APP } from "@/content/inside-track";
import { isSoftware, PITCH_COLOR, type FieldPitch } from "./field";

export type InsideScene = { set: (p: number) => void; dispose: () => void };
export type Anchor = { id: string; x: number; y: number; show: boolean };

// the app's zone box, width over height (its screenshots are 2360 x 1640)
export const ZONE_ASPECT = (APP.zone.w * 2360) / (APP.zone.h * 1640);
const ZW = 3, ZD = ZW / ZONE_ASPECT;                       // world size of the zone: cells 1 wide, ZD/3 deep
const CZ = ZD / 3;
// where the zone sits on screen when the shot looks straight down (CSS px); the site docks the app's zone onto this
export function zoneTarget(w: number, h: number) {
  const tall = w / h < 1;
  const zh = tall ? Math.min(0.46 * h, (0.62 * w) / ZONE_ASPECT) : 0.5 * h;
  return { cx: tall ? w / 2 : w / 2 + 0.16 * w, cy: tall ? h / 2 - 0.06 * h : h / 2, zw: zh * ZONE_ASPECT, zh };
}

const KIND: Record<string, FieldPitch["kind"]> = { Fastball: "FB", Slider: "SL", Changeup: "CH" };
const CELL: Record<string, [number, number]> = { "up-in": [1, 1], "up-away": [-1, 1], "down-in": [1, -1], "down-away": [-1, -1], middle: [0, 0] };
const SLOT: Record<string, [number, number]> = { Fastball: [0.24, -0.16], Slider: [-0.24, -0.16], Changeup: [0, 0.22] };
const cellXZ = (quad: string): [number, number] => quad === "chase" ? [-1.72, -(ZD / 2 + 0.25)] : [CELL[quad][0], CELL[quad][1] * CZ];
// the stages, as fractions of this scene's stretch of scroll
export const ST = { reads: [0.02, 0.25], rise: [0.28, 0.41], burn: [0.43, 0.52], sweep: [0.54, 0.72], settle: [0.8, 0.97] };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const at = (p: number, [a, b]: number[]) => clamp((p - a) / (b - a));
const ease = (t: number) => t * t * (3 - 2 * t);
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// a soft round glow, for sprites and points
function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// a pillar of light: a hot core and a softer shell, brightest at the top, edges glowing
const PILLAR_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const PILLAR_FS = `uniform vec3 uColor; uniform float uOpacity; uniform float uHeat; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float rim=1.0-abs(dot(vN,vV)); float lift=0.18+1.0*pow(vUv.y,1.6);
  vec3 c=mix(uColor,vec3(1.0),0.25*uHeat)*lift*(0.8+1.1*rim)*(1.0+uHeat)*1.5;
  gl_FragColor=vec4(c,uOpacity*(0.5+0.5*rim)*(0.55+0.45*vUv.y)); }`;
function pillarMaterial(color: THREE.Color, opacity: number) {
  return new THREE.ShaderMaterial({ vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: opacity }, uHeat: { value: 0 } } });
}
// a read flowing along its path: pulses of light travel toward the head
const FLOW_FS = `uniform vec3 uColor; uniform float uHead; uniform float uShift; uniform float uOpacity; varying vec2 vUv;
void main(){ float t=vUv.x; if(t>uHead) discard; float pulse=0.35+0.65*pow(0.5+0.5*sin((t*14.0-uShift)*6.2832),6.0);
  float tail=smoothstep(0.0,0.25,t); float head=smoothstep(uHead-0.18,uHead,t);
  gl_FragColor=vec4(uColor*(pulse+1.6*head),uOpacity*tail*(0.45+0.55*pulse)); }`;
// the last pass: the footage's grade (cool shadows, a touch of lift), a vignette and film grain
const GRADE = { uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 }, uAspect: { value: 1 }, uWarm: { value: 0 }, uCool: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSeed; uniform float uAspect; uniform float uWarm; uniform float uCool; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uSeed)*43758.5453); }
  void main(){ vec2 dc=(vUv-0.5); float ca=0.0018*dot(dc,dc)*4.0;
    vec3 col=vec3(texture2D(tDiffuse,vUv+dc*ca).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-dc*ca).b);
    float l=dot(col,vec3(0.299,0.587,0.114)); col=mix(col,col*vec3(0.92,0.98,1.08),1.0-smoothstep(0.0,0.5,l));
    // the colour script: cooler while it reads, warmer (the slider's gold) when the call lands
    col*=mix(vec3(1.0),vec3(0.9,1.0,1.12),uCool*(1.0-l)); col*=mix(vec3(1.0),vec3(1.1,1.0,0.86),uWarm*(0.4+0.6*l));
    col=col*0.97+0.012;
    vec2 d=(vUv-0.5)*vec2(uAspect,1.0); col*=1.0-0.42*smoothstep(0.35,1.05,length(d));
    col+=(h(vUv*vec2(1920.0,1080.0))-0.5)*0.035; gl_FragColor=vec4(col,1.0); }` };

export function mountInside(el: HTMLElement, opts: { onAnchors?: (a: Anchor[]) => void } = {}): InsideScene | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); } catch { return null; }
  const soft = isSoftware(renderer);
  const dpr = soft ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;   // so the app's zone, drawn here as a texture, matches the screenshot it docks onto
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  scene.fog = new THREE.FogExp2(0x03060c, 0.045);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 120);
  const glow = glowTexture();
  const disposables: { dispose: () => void }[] = [glow];

  // ---- the stage: a glossy black floor (things below it show through faintly, as reflections), a pool of light under the
  // zone, haze in the air, dust drifting through it
  // a real mirror under the stage (rendered small, so its reflections come out soft, like a polished floor), then a dark
  // glossy overlay. Phones get faked reflections instead (mirrored copies of the pillars), which cost nothing.
  const narrowStart = el.getBoundingClientRect().width < 600;
  const mirror = narrowStart ? null : new Reflector(new THREE.PlaneGeometry(220, 220), { textureWidth: 512, textureHeight: 288, color: 0x8a92a6, clipBias: 0.003, multisample: soft ? 0 : 4 });
  if (mirror) { mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.002; mirror.renderOrder = -1; scene.add(mirror); }
  // the overlay is glossier near the zone and goes to black with distance, so the mirror has no far edge
  const floorFade = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d")!;
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, "#9a9a9a"); r.addColorStop(0.18, "#b0b0b0"); r.addColorStop(0.55, "#f2f2f2"); r.addColorStop(1, "#ffffff");
    g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  disposables.push(floorFade);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ color: 0x010203, transparent: true, opacity: mirror ? 1 : 0.86, alphaMap: mirror ? floorFade : null, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.renderOrder = 1; scene.add(floor);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: glow, color: 0x2a4a80, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.003; pool.renderOrder = 2; scene.add(pool);
  const hazes = [[-6, 3.2, 9, 22], [7, 2.4, 11, 26], [0, 5.5, 16, 34]].map(([x, y, z, s]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x1b2f55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(x, y, z); sp.scale.set(s, s * 0.55, 1); scene.add(sp); return sp;
  });
  const ND = soft ? 160 : 420;
  const dustPos = new Float32Array(ND * 3), dustSeed = Array.from({ length: ND }, (_, i) => [hash(i) * 16 - 8, hash(i + 99) * 6, hash(i + 199) * 14 - 6, hash(i + 299)]);
  const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(dustPos, 3)),
    new THREE.PointsMaterial({ map: glow, color: 0x9fb6e0, size: 0.06, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // ---- the zone, drawn as the app draws it: a bright box, faint thirds, a dashed chase band around it
  const zone = new THREE.Group(); zone.position.y = 0.004; zone.renderOrder = 3; scene.add(zone);
  // the zone stays under the bloom threshold, so it reads as crisp lines like the app draws it
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xcfd3da, transparent: true, opacity: 1, depthWrite: false });
  const faintMat = new THREE.MeshBasicMaterial({ color: 0xcfd3da, transparent: true, opacity: 0.24, depthWrite: false });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xcfd3da, transparent: true, opacity: 0.34, depthWrite: false });
  const strip = (x0: number, z0: number, x1: number, z1: number, wdt: number, mat: THREE.Material) => {
    const len = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(len + wdt, wdt), mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z1 - z0, x1 - x0); m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); zone.add(m);
  };
  const hx = ZW / 2, hz = ZD / 2, LW = 0.026;
  strip(-hx, -hz, hx, -hz, LW, lineMat); strip(-hx, hz, hx, hz, LW, lineMat); strip(-hx, -hz, -hx, hz, LW, lineMat); strip(hx, -hz, hx, hz, LW, lineMat);
  for (const f of [-1, 1]) { strip(f * 0.5, -hz, f * 0.5, hz, 0.02, faintMat); strip(-hx, f * CZ / 2, hx, f * CZ / 2, 0.02, faintMat); }
  { // the chase band: 0.5 of a cell outside the box, dashed (the app's is dashed "3 5")
    const bx = hx + 0.5, bz = hz + 0.5, dash = 0.09, gap = 0.15;
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      for (let s = 0; s < len; s += dash + gap) { const e = Math.min(len, s + dash); strip(x0 + ux * s, z0 + uz * s, x0 + ux * e, z0 + uz * e, 0.014, dashMat); }
    };
    run(-bx, -bz, bx, -bz); run(bx, -bz, bx, bz); run(bx, bz, -bx, bz); run(-bx, bz, -bx, -bz);
  }
  // the app's own zone (scripts/capture-app-call.cjs, 6x), laid exactly over this one for both cuts: the picture the site
  // docks from is the same pixels, so the hand-off can't show. Edges feathered into the floor.
  const ZFS = `uniform sampler2D map; uniform float uOpacity; uniform vec2 uFeather; varying vec2 vUv;
  void main(){ vec4 c=texture2D(map,vUv); float a=smoothstep(0.0,uFeather.x,vUv.x)*smoothstep(0.0,uFeather.x,1.0-vUv.x)*smoothstep(0.0,uFeather.y,vUv.y)*smoothstep(0.0,uFeather.y,1.0-vUv.y);
    gl_FragColor=vec4(c.rgb,uOpacity*a); }`;
  const pxW = ZW / (APP.zone.w * 1180);                     // world units per app CSS pixel
  const zh = APP.zoneHi, zcx = (APP.zone.x + APP.zone.w / 2) * 1180, zcy = (APP.zone.y + APP.zone.h / 2) * 820;
  const appZone = (file: string) => {
    const tex = new THREE.TextureLoader().load(file, () => { if (!raf && visible) raf = requestAnimationFrame(frame); });
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; disposables.push(tex);
    const mat = new THREE.ShaderMaterial({ vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: ZFS, transparent: true, depthWrite: false, uniforms: { map: { value: tex }, uOpacity: { value: 0 }, uFeather: { value: new THREE.Vector2(34 / (zh.w * 1180), 34 / (zh.h * 820)) } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(zh.w * 1180 * pxW, zh.h * 820 * pxW), mat);
    // face up, image top toward the far end (+z), image right toward the away side (-x)
    m.rotation.set(-Math.PI / 2, 0, Math.PI);
    const ccx = (zh.x + zh.w / 2) * 1180, ccy = (zh.y + zh.h / 2) * 820;
    m.position.set(-(ccx - zcx) * pxW, 0.012, -(ccy - zcy) * pxW);
    m.renderOrder = 6; scene.add(m);
    return mat;
  };
  const zoneBefore = appZone("/marketing/app-zone-before.png"), zoneAfter = appZone("/marketing/app-zone-after.png");

  // ---- the reads: four streams of light from the edges of the frame into the middle of the zone
  const READS = [
    { id: "pitcher", from: new THREE.Vector3(4.6, 2.6, -2.2) },
    { id: "hitter", from: new THREE.Vector3(-4.6, 2.6, -2.2) },
    { id: "game", from: new THREE.Vector3(4.1, 1.1, 4.8) },
    { id: "umpire", from: new THREE.Vector3(-4.1, 1.1, 4.8) },
  ];
  const HEART = new THREE.Vector3(0, 0.05, 0);
  const READ_COLOR = new THREE.Color(0xcfe0ff);
  const streams = READS.map((r, k) => {
    const mid = r.from.clone().lerp(HEART, 0.5).add(new THREE.Vector3(0, 0.55 - k * 0.05, 0));
    const curve = new THREE.CatmullRomCurve3([r.from, mid, HEART.clone().add(new THREE.Vector3(r.from.x * 0.12, 0.22, r.from.z * 0.1)), HEART]);
    const mat = new THREE.ShaderMaterial({ vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: FLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: READ_COLOR.clone() }, uHead: { value: 0 }, uShift: { value: 0 }, uOpacity: { value: 0 } } });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.03, 8, false), mat);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xe6efff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    head.scale.setScalar(0.75);
    const src = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xbcd0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    src.position.copy(r.from); src.scale.setScalar(0.9);
    scene.add(tube, head, src);
    return { r, curve, mat, head, src, delay: k * 0.07 };
  });
  // where they meet: a bloom of light on the zone, and a ring that runs out across the floor
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xdfe9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  heart.position.set(0, 0.25, 0); scene.add(heart);
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: 0xbcd2ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  wave.rotation.x = -Math.PI / 2; wave.position.y = 0.008; scene.add(wave);

  const beamTex = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 256; const g = c.getContext("2d")!;
    const v = g.createLinearGradient(0, 256, 0, 0); v.addColorStop(0, "rgba(255,255,255,1)"); v.addColorStop(0.3, "rgba(255,255,255,0.3)"); v.addColorStop(0.85, "rgba(255,255,255,0)"); v.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = v; g.fillRect(0, 0, 64, 256); const hz = g.createLinearGradient(0, 0, 64, 0); hz.addColorStop(0, "rgba(0,0,0,1)"); hz.addColorStop(0.5, "rgba(0,0,0,0)"); hz.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out"; g.fillStyle = hz; g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  disposables.push(beamTex);
  // ---- the calls: a pillar of light per call, as tall as it is good; reflections below the floor; a soft aura in the air
  const costs = CANDIDATES.map((c) => c.cost), lo = Math.min(...costs), hi = Math.max(...costs);
  const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true); pillarGeo.translate(0, 0.5, 0);
  disposables.push(pillarGeo);
  const pillars = CANDIDATES.map((c, i) => {
    const color = new THREE.Color(PITCH_COLOR[KIND[c.pitch]]);
    const v = (hi - c.cost) / (hi - lo);
    const h = 0.25 + 1.7 * Math.pow(v, 1.15);
    const [cx, cz] = cellXZ(c.quad), [sx, sz] = SLOT[c.pitch];
    const x = cx + sx, z = cz + sz;
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const core = new THREE.Mesh(pillarGeo, pillarMaterial(color.clone().lerp(new THREE.Color(1, 1, 1), 0.35), 1)); core.scale.set(0.045, 0.001, 0.045);
    const shell = new THREE.Mesh(pillarGeo, pillarMaterial(color, 0.8)); shell.scale.set(0.1, 0.001, 0.1);
    const cap = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    cap.scale.setScalar(0.3);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshBasicMaterial({ map: glow, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.007;
    const refl = new THREE.Mesh(pillarGeo, pillarMaterial(color, 0.22)); refl.scale.set(0.1, -0.001, 0.1); refl.renderOrder = 0;
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.center.set(0.5, 0); aura.scale.set(0.62, h * 1.18, 1);
    g.add(core, shell, cap, base, refl, aura);
    const share = c.share;
    return { c, i, g, core, shell, cap, base, refl, aura, h, color, keep: share > 0, share, cell: [cx, cz] as [number, number], delay: (1 - v) * 0.5,
      isPick: c.pitch === CAND_PICK.pitch && c.quad === CAND_PICK.quad };
  });
  const kept = pillars.filter((p) => p.keep);
  const pick = kept.find((p) => p.isPick) || kept[0];
  // embers from the calls that burn out
  const NE = soft ? 240 : 640;
  const emPos = new Float32Array(NE * 3), emCol = new Float32Array(NE * 3);
  const burnt = pillars.filter((p) => !p.keep);
  const emOwner = Array.from({ length: NE }, (_, i) => burnt[i % burnt.length]);
  emOwner.forEach((o, i) => { emCol[i * 3] = o.color.r; emCol[i * 3 + 1] = o.color.g; emCol[i * 3 + 2] = o.color.b; });
  const embers = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(emPos, 3)).setAttribute("color", new THREE.BufferAttribute(emCol, 3)),
    new THREE.PointsMaterial({ map: glow, size: 0.09, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(embers);
  // the five left: a disc of light at each one's foot, as big as its share
  const shareDiscs = kept.map((p) => {
    const d = new THREE.Mesh(new THREE.RingGeometry(0.02, 1, 64), new THREE.MeshBasicMaterial({ map: glow, color: p.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    d.rotation.x = -Math.PI / 2; d.position.set(p.g.position.x, 0.009, p.g.position.z); scene.add(d);
    return { p, d, r: 0.25 + 1.5 * Math.sqrt(p.share) };
  });
  // the draw: a beam that hops between the five, slowing, and stops on the drawn call

  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTex, color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.center.set(0.5, 0); beam.scale.set(0.7, pick.h + 0.25, 1); scene.add(beam);
  const beamGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  beamGlow.scale.set(1.4, 1.4, 1); scene.add(beamGlow);
  const order = [...kept].sort((a, b) => Math.atan2(a.g.position.z, a.g.position.x) - Math.atan2(b.g.position.z, b.g.position.x));
  const hops: typeof kept = [];
  for (let k = 0; k < 2; k++) hops.push(...order);
  while (hops[hops.length - 1] !== pick) hops.push(order[(order.indexOf(hops[hops.length - 1]) + 1) % order.length]);
  // ---- the camera: one continuous move. Straight down on the zone, a long swing down behind the plate as the reads
  // arrive, a push and an orbit through the pillars, in close on the drawn call, then back up over the zone.
  let tall = false, topH = 11;
  const keys: { t: number; pos: THREE.Vector3; look: THREE.Vector3 }[] = [];
  function buildKeys() {
    const T = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const k = (t: number, pos: THREE.Vector3, look: THREE.Vector3) => ({ t, pos, look });
    const far = tall && w < 600 ? 1.25 : 1;
    const ob = (p: THREE.Vector3, l: THREE.Vector3) => p.clone().sub(l).multiplyScalar(far).add(l);
    keys.length = 0;
    keys.push(
      k(0.0, T(0, topH, 0.0001), T(0, 0, 0)),
      k(0.02, T(0, topH * 0.98, -0.08), T(0, 0, 0.02)),
      k(0.26, ob(T(0.2, 5.2, -9.6), T(0, 0.9, 0.6)), T(0, 0.9, 0.6)),
      k(0.45, ob(T(2.0, 4.2, -7.8), T(-0.85, 0.85, -0.2)), T(-0.85, 0.85, -0.2)),
      k(0.57, ob(T(0.0, 3.0, -6.8), T(-1.3, 0.9, -0.25)), T(-1.3, 0.9, -0.25)),
      k(0.72, ob(T(-0.4, 2.7, -6.7), T(pick.g.position.x * 1.15, 1.1, pick.g.position.z * 0.6)), T(pick.g.position.x * 1.15, 1.1, pick.g.position.z * 0.6)),
      k(0.79, ob(T(-0.8, 2.5, -6.1), T(pick.g.position.x * 1.1, 1.05, pick.g.position.z * 0.65)), T(pick.g.position.x * 1.1, 1.05, pick.g.position.z * 0.65)),
      k(0.91, T(0, topH * 1.04, -1.1), T(0, 0.05, 0.12)),
      k(0.97, T(0, topH * 0.995, -0.03), T(0, 0, 0.01)),
      k(1.0, T(0, topH, 0.0001), T(0, 0, 0)),
    );
  }
  const posCurve = () => new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, "centripetal");
  const lookCurve = () => new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, "centripetal");
  let pc = posCurve(), lc = lookCurve();
  const fwd = new THREE.Vector3(), upHint = new THREE.Vector3(), tmp = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpG = new THREE.Vector3();
  function camAt(u: number) {
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], f = inOutCubic(clamp((u - a.t) / (b.t - a.t)));
    const s = (i + f) / (keys.length - 1);
    camera.position.copy(pc.getPoint(s));
    const look = lc.getPoint(s);
    // straight down, "up" on screen is the far end of the zone; behind the plate it's the sky. Blend by how steep the view is.
    fwd.copy(look).sub(camera.position).normalize();
    const steep = clamp((-fwd.y - 0.55) / 0.42);
    upHint.set(0, 1 - steep, steep).normalize();
    camera.up.copy(upHint);
    camera.lookAt(look);
  }

  // ---- post: bloom for the light, then the footage's grade, vignette and grain
  // multisampled, half-float target: smooth edges on the pillars and room above 1.0 for the bloom
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: soft ? 0 : 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.45, 0.82);
  composer.addPass(bloom);
  // focus: a soft tilt-shift band on the subject (the scene's glass doesn't write depth, so this, not a depth-of-field pass)
  const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader);
  composer.addPass(tiltH); composer.addPass(tiltV);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);

  let w = 1, h = 1, cur = 0, want = 0, raf = 0, visible = true;
  const proj = (v: THREE.Vector3) => { const q = tmp.copy(v).project(camera); return { x: (q.x * 0.5 + 0.5) * w, y: (-q.y * 0.5 + 0.5) * h, front: q.z < 1 }; };

  function draw(u: number) {
    const rd = at(u, ST.reads), rs = at(u, ST.rise), bn = at(u, ST.burn), sw = at(u, ST.sweep), st = at(u, ST.settle);
    // the stage comes up with the reads and goes back down for the cut out
    const stageOn = ease(at(u, [0.04, 0.2])) * (1 - ease(at(u, [0.86, 0.97])));
    pool.material.opacity = 0.55 * stageOn + 0.25 * ease(at(u, [0.18, 0.3])) * (1 - st);
    hazes.forEach((s) => { s.material.opacity = 0.14 * stageOn; });
    dust.material.opacity = 0.5 * stageOn;
    for (let i = 0; i < ND; i++) {
      const [x, y, z, s] = dustSeed[i];
      dustPos[i * 3] = x + Math.sin(s * 40 + u * 6) * 0.35; dustPos[i * 3 + 1] = (y + u * 1.6 * (0.4 + s)) % 6; dustPos[i * 3 + 2] = z + Math.cos(s * 30 + u * 5) * 0.35;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    // the zone: full white for the cuts, softer while the light show runs
    lineMat.opacity = 1 - 0.45 * stageOn;
    dashMat.opacity = 0.34 * ease(at(u, [0.06, 0.12])) * (1 - ease(at(st, [0.3, 0.6])));
    zoneBefore.uniforms.uOpacity.value = 1 - ease(at(u, [0.01, 0.07]));
    // the reads pour in
    streams.forEach((s) => {
      const run = clamp((rd - s.delay) / 0.62);
      const fadeOut = 1 - ease(at(u, [0.29, 0.38]));
      s.mat.uniforms.uHead.value = outCubic(run);
      s.mat.uniforms.uShift.value = u * 22;
      s.mat.uniforms.uOpacity.value = Math.min(1, run * 4) * fadeOut;
      s.head.position.copy(s.curve.getPoint(Math.min(0.999, outCubic(run))));
      (s.head.material as THREE.SpriteMaterial).opacity = run > 0 && run < 1 ? 1 : 0;
      (s.src.material as THREE.SpriteMaterial).opacity = Math.min(1, run * 5) * fadeOut * 0.8;
    });
    const arrive = at(u, [0.2, 0.3]);
    (heart.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * arrive) * 0.95;
    heart.scale.setScalar(0.6 + 2.6 * arrive);
    (wave.material as THREE.MeshBasicMaterial).opacity = (1 - arrive) * (arrive > 0 ? 0.8 : 0);
    wave.scale.setScalar(0.2 + 6.5 * outCubic(arrive));
    // the calls rise, best first; the worse ones flare and burn out; the five left get their share of the light
    for (const p of pillars) {
      const grow = outCubic(clamp((rs - p.delay * 0.55) / 0.45));
      const burnK = p.keep ? 0 : bn;
      const flare = p.keep ? 0 : Math.sin(Math.PI * clamp(burnK * 1.6));
      const left = p.keep ? 1 : 1 - ease(clamp((burnK - 0.25) / 0.75));
      const settleK = p.keep ? ease(st) : 0;
      let hh = Math.max(0.001, p.h * grow * left * (1 - settleK));
      const onBeam = sw > 0 && sw < 1 ? 0 : 0;
      const isLit = p.keep && sw >= 1 ? (p === pick ? 1 : 0.35 * (1 - ease(at(u, [0.8, 0.88])))) : 1;
      p.core.scale.y = hh; p.shell.scale.y = hh; p.refl.scale.y = -hh * 0.9; p.refl.visible = !mirror;
      const op = grow > 0 ? 1 : 0;
      (p.core.material as THREE.ShaderMaterial).uniforms.uOpacity.value = op * isLit;
      (p.shell.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.7 * op * isLit;
      (p.refl.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.2 * op * isLit;
      (p.core.material as THREE.ShaderMaterial).uniforms.uHeat.value = flare * 1.5 + onBeam;
      (p.shell.material as THREE.ShaderMaterial).uniforms.uHeat.value = flare;
      p.cap.position.y = hh; (p.cap.material as THREE.SpriteMaterial).opacity = grow * (left > 0.02 ? 1 : 0) * (1 - settleK) * isLit * (1 + flare);
      (p.base.material as THREE.MeshBasicMaterial).opacity = 0.5 * grow * left * (1 - settleK) * isLit;
      p.aura.scale.y = Math.max(0.001, hh * 1.18); p.aura.material.opacity = 0.22 * grow * left * (1 - settleK) * isLit * (1 + flare);
      p.g.visible = hh > 0.002 || (p.keep && grow > 0 && settleK < 1);
    }
    // embers drift up off the burning ones
    let emOn = 0;
    for (let i = 0; i < NE; i++) {
      const o = emOwner[i], s = hash(i + 7), t = clamp((bn - s * 0.45) / 0.55);
      const y = o.h * (0.15 + 0.85 * hash(i + 3)) + t * (0.8 + 1.6 * s);
      emPos[i * 3] = o.g.position.x + (hash(i + 5) - 0.5) * 0.3 + Math.sin(i + t * 4) * 0.12 * t;
      emPos[i * 3 + 1] = t > 0 && t < 1 ? y : -10;
      emPos[i * 3 + 2] = o.g.position.z + (hash(i + 9) - 0.5) * 0.3;
      if (t > 0 && t < 1) emOn = 1;
    }
    embers.geometry.attributes.position.needsUpdate = true;
    embers.material.opacity = emOn ? 0.85 * (1 - ease(at(bn, [0.7, 1]))) : 0;
    shareDiscs.forEach((s) => {
      const on = ease(at(u, [0.54, 0.62])) * (1 - ease(st)) * (sw >= 1 ? (s.p === pick ? 1 : 0.3) : 1);
      (s.d.material as THREE.MeshBasicMaterial).opacity = 0.55 * on;
      s.d.scale.setScalar(s.r * (0.6 + 0.4 * on));
    });
    // the draw: the beam visits each of the five, slowing, and stops on the drawn call
    if (sw > 0 && sw < 1.0001 && st < 1) {
      const q = outCubic(sw) * (hops.length - 1), k = Math.floor(q), f = q - k;
      const A = hops[Math.min(k, hops.length - 1)], B = hops[Math.min(k + 1, hops.length - 1)];
      const hop = ease(f);
      beam.position.set(A.g.position.x + (B.g.position.x - A.g.position.x) * hop, 0.01, A.g.position.z + (B.g.position.z - A.g.position.z) * hop);
      const landed = sw >= 0.999;
      beam.material.opacity = (landed ? 0.55 : 0.8) * (1 - ease(st)) * Math.min(1, sw * 8);
      (beamGlow.material as THREE.SpriteMaterial).opacity = (landed ? 0.7 : 0.5) * (1 - ease(st));
      beamGlow.position.set(beam.position.x, 0.15, beam.position.z);
      beamGlow.scale.setScalar(landed ? 1.6 : 1.2);
      for (const p of kept) {
        const near = Math.max(0, 1 - Math.hypot(p.g.position.x - beam.position.x, p.g.position.z - beam.position.z) / 0.35);
        (p.core.material as THREE.ShaderMaterial).uniforms.uHeat.value = near * 1.4 + (landed && p === pick ? 0.45 : 0);
        (p.shell.material as THREE.ShaderMaterial).uniforms.uHeat.value = landed && p === pick ? 0.3 : near * 0.45;
        if (landed && p === pick) p.aura.material.opacity *= 0.4;
      }
    } else {
      beam.material.opacity = 0;
      (beamGlow.material as THREE.SpriteMaterial).opacity = 0;
    }
    // the five settle into the marks the app shows
    zoneAfter.uniforms.uOpacity.value = ease(at(st, [0.45, 0.92]));
    camAt(u);
    grade.uniforms.uSeed.value = Math.floor(u * 400) * 1.37;
    // the colour script and the focus, beat by beat
    const landed = ease(at(sw, [0.9, 1])) * (1 - ease(at(st, [0.1, 0.5])));
    grade.uniforms.uCool.value = ease(at(u, [0.04, 0.16])) * (1 - ease(at(u, [0.3, 0.42])));
    grade.uniforms.uWarm.value = landed;
    bloom.strength = 0.8 + 0.12 * landed;
    const focusAmt = ease(at(u, [0.3, 0.4])) * (1 - ease(at(u, [0.8, 0.88])));
    const fp = sw > 0 ? pick.g.position : tmpF.set(-0.5, 0, -0.2);
    const fy = proj(tmpG.set(fp.x, 0.8, fp.z)).y;
    tiltH.uniforms.r.value = tiltV.uniforms.r.value = Math.max(0.2, Math.min(0.8, Number.isFinite(fy) ? 1 - fy / h : 0.5));
    tiltH.uniforms.h.value = (2.2 * focusAmt) / (w * dpr);
    tiltV.uniforms.v.value = (2.2 * focusAmt) / (h * dpr);
    composer.render();

    if (opts.onAnchors) {
      const A: Anchor[] = [];
      streams.forEach((s, k) => { const q = proj(s.curve.getPoint(0.28)); A.push({ id: s.r.id, x: q.x, y: q.y, show: u > 0.14 + k * 0.025 && u < 0.29 }); });
      { const q = proj(new THREE.Vector3(pick.g.position.x, pick.h * (1 - ease(st)) + 0.35, pick.g.position.z)); A.push({ id: "pick", x: q.x, y: q.y, show: sw >= 1 && st < 0.25 }); }
      opts.onAnchors(A);
    }
  }

  function size() {
    const rr = el.getBoundingClientRect();
    if (!rr.width || !rr.height) return;
    w = rr.width; h = rr.height;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    composer.setPixelRatio(dpr);
    bloom.resolution.set(w * dpr * 0.5, h * dpr * 0.5);
    mirror?.getRenderTarget().setSize(Math.round(w * dpr * 0.35), Math.round(h * dpr * 0.35));
    camera.aspect = w / h;
    tall = w / h < 1;
    camera.fov = tall ? (w < 600 ? 58 : 48) : 34;
    // keep the action clear of the words: on wide screens right of centre, on tall ones above the middle (zoneTarget agrees)
    if (!tall) camera.setViewOffset(w, h, -w * 0.16, 0, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.06, w, h);
    camera.updateProjectionMatrix();
    // how high the camera hangs when it looks straight down, so the zone fills exactly zoneTarget's box
    const zt = zoneTarget(w, h);
    topH = (ZD * (h / 2)) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * zt.zh);
    grade.uniforms.uAspect.value = w / h;
    buildKeys(); pc = posCurve(); lc = lookCurve();
    draw(cur);
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);
  function frame() {
    raf = 0;
    if (!visible) return;
    cur += (want - cur) * 0.2;
    if (Math.abs(want - cur) < 0.0004) cur = want;
    draw(cur);
    if (cur !== want) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); });
  io.observe(el);
  size();

  return {
    set(p: number) { want = clamp(p); if (Math.abs(want - cur) > 0.25) cur = want; if (!raf && visible) raf = requestAnimationFrame(frame); },
    dispose() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
      disposables.forEach((d) => d.dispose());
      composer.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
