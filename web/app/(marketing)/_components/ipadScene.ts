// The product, as an object: an iPad running the real live-calling screen, in 3D with reflections, that turns and
// settles as the dugout chapter scrolls by (the way the best product sites spin a can or a pen). Units are inches,
// sized to an 11-inch iPad Pro; the screen is the real 2360 x 1640 capture from the app.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { disposeScene, isSoftware } from "./field";

export type IpadScene = { set: (p: number) => void; mode: (m: "night" | "day") => void; dispose: () => void };

const W = 9.83, H = 6.99, D = 0.23, SW = 9.06, SH = SW * (1640 / 2360);

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// ShapeGeometry has no UVs that fit the rectangle, so map them from the vertex positions
function rectUV(g: THREE.BufferGeometry, w: number, h: number) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h + 0.5; }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mountIpad(el: HTMLElement, src: { night: string; day: string }, opts: { onReady?: () => void } = {}): IpadScene | null {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); } catch { return null; }
  // without a GPU the reflections cost too much: the flat tablet, tilting in CSS, stands in
  if (isSoftware(renderer)) { renderer.dispose(); return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

  const ipad = new THREE.Group();
  scene.add(ipad);
  // space-black aluminum body, a black glass front, and the screen itself unlit so it reads like a lit display
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 8, 0.52), new THREE.MeshPhysicalMaterial({ color: 0x2a2b2e, metalness: 1, roughness: 0.34, clearcoat: 0.3, clearcoatRoughness: 0.4 }));
  ipad.add(body);
  const front = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 0.06, H - 0.06, 0.49), 12), new THREE.MeshPhysicalMaterial({ color: 0x050505, metalness: 0, roughness: 0.06, clearcoat: 1 }));
  front.position.z = D / 2 + 0.002;
  ipad.add(front);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const screen = new THREE.Mesh(rectUV(new THREE.ShapeGeometry(roundedRect(SW, SH, 0.3), 12), SW, SH), screenMat);
  screen.position.z = D / 2 + 0.004;
  ipad.add(screen);
  // a thin glass sheet over the screen that only carries reflections of the room
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 0.06, H - 0.06, 0.49), 12), new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, envMapIntensity: 1.4 }));
  glass.position.z = D / 2 + 0.006;
  ipad.add(glass);
  const cam = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, roughness: 0.1, clearcoat: 1 }));
  cam.position.set(0, H / 2 - 0.2, D / 2 + 0.005);
  ipad.add(cam);
  // a soft shadow under it
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, 3.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-6, 8, 10);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.15));

  const tex: Record<"night" | "day", THREE.Texture | null> = { night: null, day: null };
  let mode: "night" | "day" = "night", dead = false;
  const loader = new THREE.TextureLoader();
  (["night", "day"] as const).forEach((m) => loader.load(src[m], (t) => {
    if (dead) { t.dispose(); return; }
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex[m] = t;
    if (m === mode) { screenMat.map = t; screenMat.needsUpdate = true; opts.onReady?.(); draw(); }
  }));

  // scroll: it rises from lying back and turned away, rolls toward you and settles flat, facing the camera
  let p = 0, w = 0, h = 0;
  function draw() {
    if (!w) return;
    const t = ease(Math.min(1, Math.max(0, p)));
    ipad.rotation.set(lerp(-1.05, 0, t), lerp(0.75, 0, t), lerp(-0.28, 0, t));
    ipad.position.set(lerp(1.6, 0, t), lerp(-2.6, 0, t), lerp(-6, 0, t));
    shadow.position.set(ipad.position.x, ipad.position.y - H / 2 - 1.2 + lerp(0.8, 0, t), ipad.position.z);
    (shadow.material as THREE.MeshBasicMaterial).opacity = lerp(0.2, 0.7, t);
    // fit: the tablet ends at about 84% of the width on wide screens, 92% on phones
    const aspect = w / h, fill = aspect < 1 ? 0.92 : 0.84;
    const dist = Math.max((W / fill) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect), (H / 0.78) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    camera.position.set(0, lerp(1.2, 0.4, t), dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function size() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = r.width; h = r.height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  }
  const ro = new ResizeObserver(size);
  ro.observe(el);
  size();

  return {
    set(v: number) { if (v !== p) { p = v; draw(); } },
    mode(m) { mode = m; if (tex[m]) { screenMat.map = tex[m]; screenMat.needsUpdate = true; } draw(); },
    dispose() {
      dead = true; ro.disconnect();
      tex.night?.dispose(); tex.day?.dispose(); shadowTex.dispose(); env.dispose(); pmrem.dispose();
      disposeScene(scene); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
