/* Motion prototype: film stops 4 to 6 and the hand-off into the playground. Not app code.
   One scrubbed GSAP timeline on Lenis; the real engine (web/lib/engine.js) runs the story's numbers and the playground. */
(() => {
  gsap.registerPlugin(ScrollTrigger, Flip, SplitText);
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tallQ = matchMedia("(max-aspect-ratio: 9/10)");
  const params = new URLSearchParams(location.search);

  // ---------- smooth scroll: Lenis driven by the GSAP ticker ----------
  const lenis = new Lenis({ lerp: 0.11 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  window.__lenis = lenis;

  // ---------- the engine: the story's situation and the playground ----------
  const E = window.PitchEngine;
  E.init(window.PQ_DATA);
  const STARTER = [
    { name: "Fastball", kind: "FB", grade: 3, command: 4, feel: 0.8, shape: "ride", velo: 86 },
    { name: "Slider", kind: "SL", grade: 4, command: 3, feel: 0.75, shape: "tight", velo: 78 },
    { name: "Changeup", kind: "CH", grade: 3, command: 2, feel: 0.6, shape: "fade", velo: 77 },
  ];
  const arsenal = () => STARTER.map((p) => E.Pitch({ name: p.name, kind: p.kind, grade: p.grade, command: p.command, conf: p.feel, base_conf: p.feel, shape: p.shape, velo: p.velo, slot: "three-quarter", height_ft: 6.1 }));
  const state = { b: 2, s: 2, outs: 1, bases: [false, false, true], inn: 3 };
  function run(st) {
    const a = arsenal();
    const S = E.Situation({ balls: st.b, strikes: st.s, outs: st.outs, bases: st.bases.slice(), inning: st.inn, margin: 0, pitch_count: 45, batters_faced: 14, level: "college_d3",
      same_side: true, last: ["Slider", "down-away"], hitter_seen: { Slider: 1 }, usage_this_count: {} });
    const r = E.callV08(a, S, { rng: () => 0.001 });
    const dist = r.dist.slice().sort((x, y) => y.prob - x.prob);
    let why = ""; try { why = E.whyLine(a, r.info.s, r.tab, dist[0], r.info)[0] || ""; } catch { why = ""; }
    return { dist, why };
  }
  // the watch's own words for each spot (app/watch.js): chase goes high for fastballs, low for the soft stuff
  const OFF = ["SL", "CB", "CH"];
  const words = (quad, kind) => ({ "up-in": ["HIGH AND", "INSIDE"], "up-away": ["HIGH AND", "OUTSIDE"], "down-in": ["LOW AND", "INSIDE"], "down-away": ["LOW AND", "OUTSIDE"], "down-middle": ["LOW"], middle: [],
    chase: OFF.includes(kind) ? ["CHASE", "LOW"] : ["CHASE", "HIGH"] }[quad] || []);
  const phrase = (d) => { const w = words(d.quad, d.pitch.kind); return `${d.pitch.name}, ${w.length ? w.join(" ").toLowerCase() : "get it over"}`; };
  const side = (q) => (/away/.test(q) ? "outside" : /-in$/.test(q) ? "inside" : q === "chase" ? "chase" : "over the plate");

  // the story: the real mix for 2-2, one out, runner on third, grouped by pitch and side of the plate
  const story = run(state);
  const groups = {};
  for (const d of story.dist) { const k = `${d.pitch.name}, ${side(d.quad)}`; groups[k] = (groups[k] || 0) + d.prob; }
  const cands = Object.entries(groups).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, p]) => ({ name, p }));
  window.__story = cands;

  // ---------- the film frames (37 to 72 of the existing film; nothing re-rendered) ----------
  const cv = $("#cv"), ctx = cv.getContext("2d");
  const FIRST = 37, COUNT = 36;
  let dir = tallQ.matches ? "tall" : "wide", imgs = [], ok = [], fwant = 0;
  function load() {
    imgs = []; ok = [];
    const order = []; for (const step of [8, 4, 2, 1]) for (let i = 0; i < COUNT; i += step) if (!order.includes(i)) order.push(i);
    if (!order.includes(COUNT - 1)) order.unshift(COUNT - 1);
    order.forEach((i) => { const im = new Image(); im.onload = () => { ok[i] = true; paint(); if (i === COUNT - 1) layout(); }; im.src = `../../../web/public/media/film/watch/${dir}/${String(FIRST + i).padStart(4, "0")}.webp`; imgs[i] = im; });
  }
  const near = (i) => { for (let d = 0; d < COUNT; d++) { if (ok[i - d]) return i - d; if (ok[i + d]) return i + d; } return -1; };
  function fit(im) { const s = Math.max(cv.width / im.naturalWidth, cv.height / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s; return [(cv.width - w) / 2, (cv.height - h) / 2, w, h]; }
  function paint() {
    const dpr = Math.min(1.5, devicePixelRatio || 1), W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const lo = Math.floor(fwant), hi = Math.min(COUNT - 1, lo + 1), a = near(lo);
    if (a < 0) return;
    ctx.globalAlpha = 1; ctx.drawImage(imgs[a], ...fit(imgs[a]));
    if (a === lo && ok[hi] && hi !== lo && fwant - lo > 0.02) { ctx.globalAlpha = fwant - lo; ctx.drawImage(imgs[hi], ...fit(imgs[hi])); ctx.globalAlpha = 1; }
  }

  // ---------- where the watch's screen sits on the page in the last frame (measured from frame 72) ----------
  const SCREEN = { wide: [0.4289, 0.3862, 0.5711, 0.6125, 1280, 800], tall: [0.3708, 0.417, 0.6292, 0.5821, 720, 1120] };
  function screenRect() {
    const [x0, y0, x1, y1, iw, ih] = SCREEN[dir], vw = innerWidth, vh = innerHeight, s = Math.max(vw / iw, vh / ih), ox = (vw - iw * s) / 2, oy = (vh - ih * s) / 2;
    return { x: ox + x0 * iw * s, y: oy + y0 * ih * s, w: (x1 - x0) * iw * s, h: (y1 - y0) * ih * s };
  }

  // ---------- the candidates ----------
  const chipsEl = $("#chips");
  const top = cands[0].p;
  chipsEl.innerHTML = cands.map((c, i) => `<div class="chip glass${i === 0 ? " lens" : ""}" data-i="${i}"><div class="t"><span>${c.name}</span><span>${Math.round(c.p * 100)}%</span></div><div class="bar"><b style="transform:scaleX(${(c.p / top).toFixed(3)})"></b><b class="g"></b></div></div>`).join("");
  const chips = $$(".chip");

  // ---------- the call words, split into letters that keep one continuous gradient ----------
  const wordEls = [$("#w1"), $("#w2")];
  const splits = wordEls.map((el) => { const bg = getComputedStyle(el).backgroundImage; el.style.backgroundImage = "none"; el.style.setProperty("--grad", bg); return new SplitText(el, { type: "chars", charsClass: "ch" }); });
  function paintLetters() { wordEls.forEach((el, k) => { const w = el.offsetWidth; splits[k].chars.forEach((c) => { c.style.backgroundImage = "var(--grad)"; c.style.setProperty("--bw", w + "px"); c.style.setProperty("--bx", -c.offsetLeft + "px"); }); }); }

  let tl, R;
  function layout() {
    R = screenRect();
    const vw = innerWidth, vh = innerHeight, tall = tallQ.matches, cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    // chips: an arc to the right of the watch on wide screens, a stack under it on a phone
    chips.forEach((c, i) => {
      if (tall) gsap.set(c, { left: vw * 0.19, top: vh * (0.5 + i * 0.087), clearProps: "transform" });
      else gsap.set(c, { left: vw * [0.635, 0.675, 0.695, 0.675, 0.635][i], top: vh * [0.16, 0.3, 0.44, 0.58, 0.72][i], clearProps: "transform" });
    });
    // call words: either side of the watch (wide) or above and below it (phone), sized to fill what's free
    const gap = R.w * 0.23 + vw * 0.014, m = vw * 0.022;
    wordEls.forEach((el, k) => {
      el.style.fontSize = "100px"; el.style.left = "0px";
      const avail = tall ? vw * 0.9 : (k === 0 ? R.x - gap - m : vw - m - (R.x + R.w + gap));
      const fs = Math.min(100 * avail / el.offsetWidth, tall ? 140 : vh * 0.42);
      el.style.fontSize = fs + "px";
      const w = el.offsetWidth;
      const x = tall ? (vw - w) / 2 : (k === 0 ? R.x - gap - w : R.x + R.w + gap);
      const y = tall ? (k === 0 ? R.y - R.h * 0.72 : R.y + R.h + R.h * 0.72) : cy;
      el.style.left = x + "px"; el.style.top = y + "px";
    });
    paintLetters();
    gsap.set("#landed", { top: tall ? R.y - R.h * 1.5 : R.y + R.h * 1.5, xPercent: -50 });
    // the live watch face sits exactly on the film's screen
    const f = $("#face"); Object.assign(f.style, { left: R.x - 1 + "px", top: R.y - 1 + "px", width: R.w + 2 + "px", height: R.h + 2 + "px", fontSize: R.w * 0.128 + "px" });
    flowPath();
    lenses();
    build();
  }
  function flowPath() {
    const mix = $("#mix").getBoundingClientRect(), pin = $(".pin").getBoundingClientRect();
    const x0 = R.x + R.w * 1.26, y0 = R.y + R.h / 2, x1 = mix.left - pin.left, y1 = mix.top - pin.top + 62, mx = (x0 + x1) / 2;
    const d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y0} ${x0} ${y0}`;
    $("#flowp").setAttribute("d", d); $("#flowg").setAttribute("d", d);
    const g = $("#fl"); g.setAttribute("x1", x0); g.setAttribute("x2", x1); g.setAttribute("y1", 0); g.setAttribute("y2", 0);
  }

  // ---------- real refraction on the glass edge (Chromium only): an SVG displacement map behind the backdrop ----------
  function lenses() {
    const okLens = CSS.supports("backdrop-filter", "url(#x)") && !/Safari\//.test(navigator.userAgent.replace(/Chrom(e|ium)\/.*Safari\//, "")) && params.get("lens") !== "0";
    const defs = $("#lensdefs"); defs.innerHTML = "";
    if (!okLens) return;
    $$(".lens").forEach((el, n) => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight), band = 26;
      if (!w || !h) return;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"), im = x.createImageData(w, h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const l = Math.max(0, 1 - i / band), r = Math.max(0, 1 - (w - 1 - i) / band), t = Math.max(0, 1 - j / band), b = Math.max(0, 1 - (h - 1 - j) / band), o = (j * w + i) * 4;
        im.data[o] = 128 + 127 * (l * l - r * r); im.data[o + 1] = 128 + 127 * (t * t - b * b); im.data[o + 2] = 128; im.data[o + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      const id = "lens" + n;
      defs.insertAdjacentHTML("beforeend", `<filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="${c.toDataURL()}" x="0" y="0" width="${w}" height="${h}" result="m"/><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/><feDisplacementMap in="b" in2="m" scale="46" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix type="saturate" values="1.9"/></filter>`);
      el.style.backdropFilter = `url(#${id}) brightness(1.1)`;
    });
  }

  // ---------- the scrubbed timeline ----------
  function build() {
    if (tl) { tl.scrollTrigger.kill(); tl.revert(); }
    const vw = innerWidth, vh = innerHeight, tall = tallQ.matches;
    gsap.set([chips, ".word .ch", "#m4", "#m5", "#landed", "#explain", "#rail", ".pgtitle", "#ctl", "#mix", "#flow", ".shade", ".pglight"], { clearProps: "opacity,transform,filter,visibility" });
    chips.forEach((c, i) => gsap.set(c, tall ? { left: vw * 0.19, top: vh * (0.5 + i * 0.087) } : {}));
    gsap.set(wordEls, { visibility: "visible" });
    const E4 = "expo.out", Q = "power4.out";
    tl = gsap.timeline({ defaults: { ease: Q }, scrollTrigger: { trigger: "#film", start: "top top", end: "bottom bottom", scrub: reduced ? true : 0.6, onUpdate: (st) => frame(st.progress) } });
    // stop 4: the candidates surface one by one
    tl.from(chips, { opacity: 0, x: tall ? 0 : 70, y: tall ? 40 : 0, scale: 0.9, filter: "blur(10px)", duration: 0.07, stagger: 0.022, ease: E4 }, 0.015)
      .from(".chip .bar b:first-child", { scaleX: 0, duration: 0.08, stagger: 0.022, ease: E4 }, 0.04)
      .fromTo("#rail .track b", { clipPath: "inset(0 42% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.5, ease: "none" }, 0)
      // stop 5: the statement changes, the four losers fall away across the screen, the winner stays and turns green
      .to("#m4", { opacity: 0, y: -24, duration: 0.03, ease: "power2.in" }, 0.2)
      .fromTo("#m5", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.05, ease: E4 }, 0.225);
    chips.slice(1).forEach((c, i) => tl.to(c, { x: -vw * [0.52, 0.78, 0.64, 0.9][i], y: vh * [0.5, 0.34, 0.62, 0.3][i], rotation: [-34, -22, -48, -18][i], opacity: 0, filter: "blur(7px)", duration: 0.13, ease: "power2.in" }, 0.25 + i * 0.016));
    const win = chips[0];
    tl.to(win, tall ? { y: vh * 0.14, scale: 1.08, duration: 0.1, ease: "power3.inOut" } : { x: -vw * 0.035, y: vh * 0.26, scale: 1.22, duration: 0.1, ease: "power3.inOut" }, 0.28)
      .to(win.querySelector(".bar b.g"), { opacity: 1, duration: 0.06 }, 0.34)
      .to(":root", { "--g": 0.5, duration: 0.1, ease: "none" }, 0.32)
      // stop 6: the call words fill the width as the film's screen shows them; everything else gets out of the way
      .to("#m5", { opacity: 0, y: -24, duration: 0.03, ease: "power2.in" }, 0.43)
      .to(".shade", { opacity: 0, duration: 0.05 }, 0.43)
      .to(win, { opacity: 0, scale: 0.7, filter: "blur(8px)", duration: 0.05, ease: "power2.in" }, 0.455)
      .to(":root", { "--g": 1, duration: 0.06, ease: "none" }, 0.46)
      .from(splits[0].chars, { opacity: 0, yPercent: 46, filter: "blur(12px)", duration: 0.07, stagger: { each: 0.008, from: "end" }, ease: E4 }, 0.47)
      .from(splits[1].chars, { opacity: 0, yPercent: 46, filter: "blur(12px)", duration: 0.07, stagger: { each: 0.008, from: "start" }, ease: E4 }, 0.47)
      .fromTo("#landed", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.04, ease: "back.out(2)" }, 0.52)
      .fromTo("#explain", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.05, ease: E4 }, 0.54)
      // the hand-off: the words part, and the playground rises around the same watch
      .to(splits[0].chars, { opacity: 0, x: -vw * 0.08, filter: "blur(10px)", duration: 0.05, stagger: { each: 0.004, from: "start" }, ease: "power2.in" }, 0.67)
      .to(splits[1].chars, { opacity: 0, x: vw * 0.08, filter: "blur(10px)", duration: 0.05, stagger: { each: 0.004, from: "end" }, ease: "power2.in" }, 0.67)
      .to(["#explain", "#rail"], { opacity: 0, y: 20, duration: 0.04, ease: "power2.in" }, 0.67)
      .to("#landed", { opacity: 0, scale: 0.9, duration: 0.03, ease: "power2.in" }, 0.69)
      .to(":root", { "--g": 0.18, duration: 0.08, ease: "none" }, 0.7)
      .fromTo(".pgtitle", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.06, ease: E4 }, 0.735)
      .fromTo("#ctl", { opacity: 0, y: tall ? 120 : 90, scale: 0.95, filter: "blur(10px)" }, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.08, ease: E4 }, 0.725)
      .fromTo("#mix", { opacity: 0, y: tall ? -60 : 90, scale: 0.95, filter: "blur(10px)" }, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.08, ease: E4 }, 0.745)
      .fromTo("#flow", { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.79)
      .fromTo(".pglight", { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0.7)
      .to({}, { duration: 0.01 }, 0.99);
    frame(tl.scrollTrigger.progress);
  }
  let faceOn = false;
  function frame(p) {
    fwant = Math.min(1, p / 0.5) * (COUNT - 1); paint();
    win().classList.toggle("won", p > 0.35);
    $("#railcall").className = p > 0.49 ? "on g" : "";
    $("#pg").classList.toggle("live", p > 0.78);
    if (p < 0.72 && faceOn) { faceOn = false; gsap.set("#face", { opacity: 0 }); }
  }
  const win = () => chips[0];

  // ---------- the playground ----------
  const rowsEl = $("#rows"), rowNodes = new Map();
  function render(first) {
    const { dist, why } = run(state), top5 = dist.slice(0, 5), topP = top5[0].prob;
    const before = first ? null : Flip.getState([...rowsEl.children]);
    const keep = new Set();
    top5.forEach((d, i) => {
      const key = `${d.pitch.name}|${d.quad}`; keep.add(key);
      let n = rowNodes.get(key);
      if (!n) { n = document.createElement("div"); n.className = "rowm"; n.dataset.flipId = key; n.innerHTML = `<div class="t"><span></span><span></span></div><div class="bar"><b style="transform:scaleX(0)"></b></div>`; rowNodes.set(key, n); }
      n.querySelector(".t span").textContent = phrase(d); n.querySelector(".t span:last-child").textContent = Math.round(d.prob * 100) + "%";
      n.classList.toggle("top", i === 0);
      rowsEl.appendChild(n);
      requestAnimationFrame(() => { n.querySelector(".bar b").style.transform = `scaleX(${(d.prob / topP).toFixed(3)})`; });
    });
    for (const [k, n] of rowNodes) if (!keep.has(k)) { n.remove(); rowNodes.delete(k); }
    if (before && !reduced) Flip.from(before, { duration: 0.55, ease: "expo.out", onEnter: (els) => gsap.fromTo(els, { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.4, ease: "expo.out" }) });
    $("#why").textContent = why;
    $("#num").innerHTML = `${state.b}&ndash;${state.s}`;
    $("#bd").innerHTML = [0, 1, 2].map((i) => `<i class="${i < state.b ? "on" : ""}"></i>`).join("");
    $("#sd").innerHTML = [0, 1].map((i) => `<i class="${i < state.s ? "on" : ""}"></i>`).join("");
    $$(".base").forEach((b) => b.setAttribute("aria-pressed", String(state.bases[+b.dataset.base])));
    $$("#outs .btn").forEach((b) => b.classList.toggle("on", +b.dataset.outs === state.outs));
    $$("#inn .btn").forEach((b) => b.classList.toggle("on", +b.dataset.inn === state.inn));
    if (!first) land(top5[0]);
  }
  // a new call lands: the line into the watch runs blue to green, the light goes green, the face redraws
  function land(d) {
    const w = words(d.quad, d.pitch.kind), f = $("#face");
    const draw = () => { $("#f1").textContent = d.pitch.name.toUpperCase(); $("#f2").innerHTML = w.join("<br>"); f.querySelector("hr").style.display = w.length ? "" : "none"; };
    faceOn = true;
    if (reduced) { draw(); gsap.set(f, { opacity: 1 }); return; }
    const len = $("#flowp").getTotalLength();
    gsap.killTweensOf(["#flowp", "#flowg", f, ":root", "#f1", "#f2"]);
    gsap.timeline()
      .set(":root", { "--g": 0 })
      .fromTo(["#flowp", "#flowg"], { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.inOut" }, 0)
      .to(f, { opacity: 1, duration: 0.15 }, 0.3)
      .to(["#f1", "#f2"], { opacity: 0, y: -6, duration: 0.12, ease: "power2.in", onComplete: draw }, 0.3)
      .to(["#f1", "#f2"], { opacity: 1, y: 0, duration: 0.3, ease: "expo.out", stagger: 0.05 }, 0.46)
      .to(":root", { "--g": 1, duration: 0.5, ease: "power2.out" }, 0.4)
      .fromTo(f, { boxShadow: "0 0 0 2px rgba(98,240,122,.9), 0 0 60px 6px rgba(98,240,122,.55)" }, { boxShadow: "0 0 0 1.5px rgba(98,240,122,0), 0 0 0 0 rgba(98,240,122,0)", duration: 1.1, ease: "power2.out" }, 0.46)
      .to(":root", { "--g": 0.18, duration: 1.2, ease: "power2.inOut" }, 1.3);
  }
  $("#ctl").addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    const a = t.dataset.act;
    if (a === "b+") state.b = Math.min(3, state.b + 1); else if (a === "b-") state.b = Math.max(0, state.b - 1);
    else if (a === "s+") state.s = Math.min(2, state.s + 1); else if (a === "s-") state.s = Math.max(0, state.s - 1);
    else if (t.dataset.base) state.bases[+t.dataset.base] = !state.bases[+t.dataset.base];
    else if (t.dataset.outs) state.outs = +t.dataset.outs; else if (t.dataset.inn) state.inn = +t.dataset.inn;
    else return;
    render(false);
  });

  // the cursor's light on any glass it is over
  addEventListener("pointermove", (e) => { const g = e.target.closest && e.target.closest(".glass"); $$(".glass").forEach((x) => x.style.setProperty("--hl", x === g ? 1 : 0)); if (g) { const r = g.getBoundingClientRect(); g.style.setProperty("--mx", e.clientX - r.left + "px"); g.style.setProperty("--my", e.clientY - r.top + "px"); } }, { passive: true });

  render(true);
  load();
  let rt = 0;
  const redo = () => { clearTimeout(rt); rt = setTimeout(() => { const d = tallQ.matches ? "tall" : "wide"; if (d !== dir) { dir = d; load(); } layout(); }, 150); };
  addEventListener("resize", redo);
  document.fonts.ready.then(layout);
  window.__ready = () => ok.filter(Boolean).length === COUNT && !!tl;
})();
