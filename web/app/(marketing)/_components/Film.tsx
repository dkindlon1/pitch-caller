"use client";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { STORY_SIT, ledger, pct, type Weighed } from "@/lib/story";
import { Playground } from "./Playground";
import { motion, reducedMotion, tallScreen } from "./motion";

// The opening film tells one call. The watch assembles from its parts as you scroll (frames drawn to a canvas, exactly
// as rendered: scripts/watch-render) while the page shows the call being made over it, in six stops:
//   1 the promise  2 the situation arrives in a ledger  3 the pitcher and the hitter join it
//   4 the ledger opens into the candidate calls, loose around the watch  5 four fall away, one stays and turns green
//   6 FASTBALL / OUTSIDE fills the width as the watch's own screen shows it
// then the words part to the sides and the playground's panels come out from behind the same watch.
// Every number is from the page's build-time engine run (the `story` prop, lib/story_server.ts).
// One scrubbed GSAP timeline; P below is the section's scroll progress, 0 to 1.
// Under reduced motion none of this runs: site.css lays the same elements out as a still frame and a plain list.

const A = 0.36, B = 0.65;                         // P where stop 4 starts, and where the film reaches its last frame
const T4 = 0.507;                                 // the film's own time at the start of stop 4 (the watch closing up)
const filmTime = (p: number) => (p < A ? (p / A) * T4 : Math.min(1, T4 + ((p - A) / (B - A)) * (1 - T4)));
const pp = (x: number) => A + x * 0.58, dd = (x: number) => x * 0.58;     // the approved prototype's timeline, placed after stop 3
export const PLAYGROUND_AT = pp(0.9);             // where "Set the situation" is fully up (nav links land here)
// where the watch's screen sits in the last frame, as fractions of the frame (measured from the render), per frame set
const SCREEN = { wide: [0.4286, 0.3858, 0.5714, 0.6142, 1920, 1200], tall: [0.3704, 0.4167, 0.6296, 0.5833, 1080, 1680] } as const;

export function Film({ story, frames }: { story: Weighed; frames: { wide: number; tall: number } }) {
  const sec = useRef<HTMLElement>(null);
  const faceOn = useRef(false);
  const cands = story.groups.slice(0, 5), top = cands[0].p;
  const led = ledger(STORY_SIT);

  useGSAP(() => {
    const el = sec.current;
    if (!el || reducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger, SplitText);
    const M = motion();
    const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector(s) as unknown as T, $$ = <T extends Element = HTMLElement>(s: string) => Array.from(el.querySelectorAll(s)) as unknown as T[];
    const canvas = $<HTMLCanvasElement>(".pq-cv"), ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ---------- the frames: coarse to fine, nearest one drawn until its neighbours arrive ----------
    let dead = false, dir: "wide" | "tall" = tallScreen() ? "tall" : "wide", count = frames[dir], imgs: HTMLImageElement[] = [], ok: boolean[] = [], fwant = 0, fshown = -1, raf = 0;
    let eager = false, coarse = 0, pumpAll = () => {};
    const goEager = () => { if (eager) return; eager = true; pumpAll(); };
    function load() {
      imgs.forEach((im) => { im.onload = null; im.src = ""; });
      imgs = []; ok = []; count = frames[dir]; fshown = -1;
      const order: number[] = [], seen = new Set<number>([count - 1]);
      order.push(count - 1);
      for (const step of [16, 8, 4, 2, 1]) { for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); } if (step === 8) coarse = order.length; }
      let next = 0, active = 0;
      const pump = () => {
        // every 8th frame comes with the page; the rest wait until the page has loaded or the visitor starts scrolling
        while (!dead && active < 6 && next < (eager ? order.length : coarse)) {
          const i = order[next++], im = new Image();
          active++; im.decoding = "async";
          im.onload = () => { ok[i] = true; active--; queue(); pump(); };
          im.onerror = () => { active--; pump(); };
          im.src = `/media/film/watch/${dir}/${String(i + 1).padStart(4, "0")}.webp`;
          imgs[i] = im;
        }
      };
      pumpAll = pump;
      pump();
    }
    const near = (i: number) => { for (let d = 0; d < count; d++) { if (ok[i - d]) return i - d; if (ok[i + d]) return i + d; } return -1; };
    function paint() {
      raf = 0;
      const dpr = Math.min(dir === "tall" ? 2 : 1.5, window.devicePixelRatio || 1), W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; fshown = -1; }
      const lo = Math.floor(fwant), hi = Math.min(count - 1, lo + 1), frac = fwant - lo, a = near(lo);
      if (a < 0) return;
      const both = a === lo && ok[hi] && hi !== lo && frac > 0.02, key = both ? fwant : a;
      if (key === fshown) return;
      const draw = (im: HTMLImageElement, alpha: number) => {
        const s = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
        ctx!.globalAlpha = alpha; ctx!.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
      };
      draw(imgs[a], 1);
      if (both) draw(imgs[hi], frac);       // the scroll lands between frames: fade the next one over by the fraction
      ctx!.globalAlpha = 1; fshown = key;
      canvas.dataset.frame = String(a + 1);
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };

    // ---------- measured layout ----------
    const pin = $(".pq-pin");
    function screenRect() {
      const [x0, y0, x1, y1, iw, ih] = SCREEN[dir], vw = pin.clientWidth, vh = pin.clientHeight, s = Math.max(vw / iw, vh / ih), ox = (vw - iw * s) / 2, oy = (vh - ih * s) / 2;
      return { x: ox + x0 * iw * s, y: oy + y0 * ih * s, w: (x1 - x0) * iw * s, h: (y1 - y0) * ih * s };
    }
    const chips = $$(".pq-chip"), wordEls = [$(".pq-word.is-1"), $(".pq-word.is-2")];
    // the call words, split into letters that keep one continuous gradient
    const splits = wordEls.map((w) => new SplitText(w, { type: "chars", charsClass: "ch" }));
    let tl: gsap.core.Timeline | null = null, R = screenRect();

    function layout() {
      if (dead) return;
      R = screenRect();
      const vw = pin.clientWidth, vh = pin.clientHeight, tall = dir === "tall", cy = R.y + R.h / 2;
      tl?.scrollTrigger?.kill(); tl?.kill(); tl = null;
      gsap.set([chips, ".pq-word .ch", ".pq-msg", ".pq-ledger", ".pq-ledger li", ".pq-ledger h3", ".pq-lg", ".pq-landed", ".pq-explain", ".pq-rail", ".pq-illus", ".pq-pgtitle", ".pq-ctl", ".pq-mix", ".pq-flow", ".pq-shade", ".pq-pglight", ".pq-light", ".pq-cut", ".pq-feel i", ".pq-chip .pq-bar b"], { clearProps: "opacity,transform,filter,visibility" });
      // chips: on a wide screen, a column right of the watch where distance from the watch tracks share, so the
      // likeliest call sits closest; on a phone, a stack under it in the same order
      chips.forEach((c, i) => {
        const far = 1 - cands[i].p / top;
        gsap.set(c, tall ? { left: vw * 0.19, top: vh * (0.5 + i * 0.087) } : { left: vw * (0.615 + 0.09 * far), top: vh * (0.17 + i * 0.14) });
      });
      // call words: either side of the watch (wide) or above and below it (phone), sized to fill what is free
      const gap = R.w * 0.23 + vw * 0.014, m = vw * 0.022;
      wordEls.forEach((w, k) => {
        w.style.fontSize = "100px"; w.style.left = "0px";
        const avail = tall ? vw * 0.9 : (k === 0 ? R.x - gap - m : vw - m - (R.x + R.w + gap));
        const fs = Math.min((100 * avail) / w.offsetWidth, tall ? 140 : vh * 0.42);
        w.style.fontSize = `${fs}px`;
        const ww = w.offsetWidth;
        w.style.left = `${tall ? (vw - ww) / 2 : (k === 0 ? R.x - gap - ww : R.x + R.w + gap)}px`;
        w.style.top = `${tall ? (k === 0 ? R.y - R.h * 0.72 : R.y + R.h + R.h * 0.72) : cy}px`;
        splits[k].chars.forEach((c) => { const ch = c as HTMLElement; ch.style.setProperty("--bw", `${ww}px`); ch.style.setProperty("--bx", `${-ch.offsetLeft}px`); });
      });
      gsap.set(".pq-landed", { top: tall ? R.y - R.h * 1.5 : R.y + R.h * 1.5, xPercent: -50 });
      // the live watch face sits exactly on the film's screen
      Object.assign($(".pq-face").style, { left: `${R.x - 1}px`, top: `${R.y - 1}px`, width: `${R.w + 2}px`, height: `${R.h + 2}px` });
      // the line from the mix into the watch
      if (!tall) {
        const mix = $(".pq-mix"), x0 = R.x + R.w * 1.26, y0 = cy, x1 = mix.offsetLeft, y1 = mix.offsetTop + 66, mx = (x0 + x1) / 2, d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y0} ${x0} ${y0}`;
        $(".pq-flowp").setAttribute("d", d); $(".pq-flowg").setAttribute("d", d);
        const g = $("#pq-fl"); g.setAttribute("x1", String(x0)); g.setAttribute("x2", String(x1)); g.setAttribute("y1", "0"); g.setAttribute("y2", "0");
      }
      build(vw, vh, tall);
      window.dispatchEvent(new Event("pq:lens"));
    }

    // ---------- the scrubbed timeline ----------
    function build(vw: number, vh: number, tall: boolean) {
      const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      const s1 = $(".pq-msg.is-1"), s2 = $(".pq-msg.is-2"), s3 = $(".pq-msg.is-3"), s4 = $(".pq-msg.is-4"), s5 = $(".pq-msg.is-5");
      const led = $(".pq-ledger"), ga = $(".pq-lg.is-a"), rowsA = $$(".pq-lg.is-a > *, .pq-lg.is-a li"), rowsB = $$(".pq-lg.is-b .pq-step");
      const lb = $(".pq-light.is-b"), lg = $(".pq-light.is-g"), win = chips[0], ctl = $(".pq-ctl"), mix = $(".pq-mix");
      const inn = { ease: M.out }, out = { ease: M.inn };
      gsap.set(wordEls, { visibility: "visible" });
      gsap.set([s2, s3, s4, s5], { opacity: 0 });
      tl = gsap.timeline({ defaults: { ease: M.soft }, scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: M.scrub, onUpdate: (st) => frame(st.progress) } });
      const msgOut = (m: Element, at: number) => tl!.to(m, { opacity: 0, y: tall ? -14 : -24, duration: 0.016, ...out }, at);
      const msgIn = (m: Element, at: number) => tl!.fromTo(m, { opacity: 0, y: tall ? 24 : 40 }, { opacity: 1, y: 0, duration: 0.034, ...inn }, at);
      const rowIn = (r: Element, at: number, older: Element[], ghost = 0.13) => {
        // a row waits as a faint slot, then lights up as its input arrives
        tl!.fromTo(r, { opacity: ghost, y: 10 }, { opacity: 1, y: 0, duration: 0.02, ...inn }, at);
        if (older.length) tl!.to(older[older.length - 1], { opacity: 0.42, duration: 0.02, ease: "none" }, at);   // the row before it dims
      };

      tl.fromTo(".pq-rail .track b", { scaleX: 0 }, { scaleX: 1, duration: B, ease: "none" }, 0)
        .fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.1, ease: "none" }, 0.06);
      // stop 1 -> 2: the situation arrives, one row at a time
      msgOut(s1, 0.07); msgIn(s2, 0.092);
      tl.fromTo(led, { opacity: 0, x: tall ? 0 : 60, y: tall ? 40 : 0, scale: 0.96, filter: "blur(10px)" }, { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", duration: 0.04, ...inn }, 0.1);
      const liA = rowsA.filter((r) => r.tagName === "LI");
      tl.fromTo(rowsA.filter((r) => r.tagName !== "LI"), { opacity: 0 }, { opacity: 1, duration: 0.02 }, 0.115);
      liA.forEach((r, i) => rowIn(r, 0.13 + i * 0.022, liA.slice(0, i)));
      // stop 3: the pitcher and the hitter join the ledger (on a phone the situation rows make room first)
      msgOut(s2, 0.222); msgIn(s3, 0.242);
      if (tall) tl.to(ga, { opacity: 0, y: -10, duration: 0.018, ...out }, 0.226); else tl.to(liA[liA.length - 1], { opacity: 0.42, duration: 0.02, ease: "none" }, 0.25);
      const liB = rowsB.filter((r) => r.tagName === "LI");
      rowsB.forEach((r, i) => { if (r.tagName === "LI") rowIn(r, 0.25 + i * 0.0105, liB.slice(0, liB.indexOf(r)), tall ? 0 : 0.13); else tl!.fromTo(r, { opacity: 0 }, { opacity: 1, duration: 0.02 }, 0.25 + i * 0.0105); });
      tl.fromTo($$(".pq-feel i"), { scaleX: 0 }, { scaleX: (i: number) => led_feel[i], duration: 0.03, stagger: 0.0105, ...inn }, 0.262);
      // stop 4: the ledger opens up and the candidate calls leave it
      msgOut(s3, 0.336); msgIn(s4, 0.366);
      tl.to(led, { opacity: 0, scale: 0.94, filter: "blur(8px)", duration: 0.026, ...out }, 0.348);
      const lr = { x: led.offsetLeft + led.offsetWidth / 2, y: led.offsetTop };   // (centred with a transform on wide screens: offsetTop is its middle)
      chips.forEach((c, i) => {
        const fx = tall ? 0 : (lr.x - (c.offsetLeft + c.offsetWidth / 2)) * 0.8, fy = tall ? 40 : (lr.y - (c.offsetTop + c.offsetHeight / 2)) * 0.6;
        tl!.fromTo(c, { opacity: 0, x: fx, y: fy, scale: 0.86, filter: "blur(10px)" }, { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", duration: dd(0.06), ...inn }, pp(0.012) + i * dd(0.016));
      });
      tl.fromTo($$(".pq-chip .pq-bar b:first-child"), { scaleX: 0 }, { scaleX: (i: number) => cands[i].p / top, duration: dd(0.07), stagger: dd(0.016), ...inn }, pp(0.04));
      // stop 5: the four losing calls fall away across the screen; the winner stays, grows and turns green
      msgOut(s4, pp(0.195)); msgIn(s5, pp(0.23));
      chips.slice(1).forEach((c, i) => tl!.to(c, { x: tall ? -vw * [0.9, 1.1, 1.0, 1.2][i] : -vw * [0.52, 0.78, 0.64, 0.9][i], y: vh * [0.5, 0.34, 0.62, 0.3][i], rotation: [-34, -22, -48, -18][i], opacity: 0, filter: "blur(7px)", duration: dd(0.13), ...out }, pp(0.25 + i * 0.016)));
      tl.to(win, tall ? { y: vh * 0.14, scale: 1.08, duration: dd(0.1), ease: M.move } : { x: -vw * 0.035, y: vh * 0.24, scale: 1.22, duration: dd(0.1), ease: M.move }, pp(0.28))
        .to(win.querySelector(".pq-bar b.g"), { opacity: 1, duration: dd(0.06) }, pp(0.34))
        .to(lg, { opacity: 0.5, duration: dd(0.1), ease: "none" }, pp(0.32)).to(lb, { opacity: 0.5, duration: dd(0.1), ease: "none" }, pp(0.32));
      // stop 6: the call words fill the width as the film's screen shows them; everything else gets out of the way
      msgOut(s5, pp(0.425));
      tl.to(".pq-shade", { opacity: 0, duration: dd(0.05) }, pp(0.43))
        .to(win, { opacity: 0, scale: 0.7, filter: "blur(8px)", duration: dd(0.045), ...out }, pp(0.44))
        .to(lg, { opacity: 1, duration: dd(0.06), ease: "none" }, pp(0.46)).to(lb, { opacity: 0, duration: dd(0.06), ease: "none" }, pp(0.46))
        .from(splits[0].chars, { opacity: 0, yPercent: 46, filter: "blur(12px)", duration: dd(0.07), stagger: { each: dd(0.008), from: "end" }, ...inn }, pp(0.49))
        .from(splits[1].chars, { opacity: 0, yPercent: 46, filter: "blur(12px)", duration: dd(0.07), stagger: { each: dd(0.008), from: "start" }, ...inn }, pp(0.49))
        .fromTo(".pq-landed", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: dd(0.04), ease: "back.out(2)" }, pp(0.54))
        .fromTo(".pq-explain", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: dd(0.05), ...inn }, pp(0.555));
      // the hand-off, in order and never two layers at once: the small things leave; FASTBALL slides out left and
      // OUTSIDE right, letter by letter, fully off the screen; only then do the panels come out from behind the watch
      const w1 = wordEls[0], w2 = wordEls[1];
      const exit1 = -(w1.offsetLeft + w1.offsetWidth + 40), exit2 = vw - w2.offsetLeft + 40;
      tl.to([".pq-explain", ".pq-rail", ".pq-illus"], { opacity: 0, y: 20, duration: dd(0.03), ...out }, pp(0.665))
        .to(".pq-landed", { opacity: 0, scale: 0.9, duration: dd(0.025), ...out }, pp(0.668));
      if (tall) tl.to(splits[0].chars, { x: exit1 - vw * 0.2, duration: dd(0.07), stagger: { each: dd(0.004), from: "start" }, ease: "power3.in" }, pp(0.695))
        .to(splits[1].chars, { x: exit2 + vw * 0.2, duration: dd(0.07), stagger: { each: dd(0.004), from: "end" }, ease: "power3.in" }, pp(0.695));
      else tl.to(splits[0].chars, { x: exit1, duration: dd(0.07), stagger: { each: dd(0.004), from: "start" }, ease: "power3.in" }, pp(0.695))
        .to(splits[1].chars, { x: exit2, duration: dd(0.07), stagger: { each: dd(0.004), from: "end" }, ease: "power3.in" }, pp(0.695));
      tl.set(wordEls, { visibility: "hidden" }, pp(0.8))
        .to(lg, { opacity: 0.18, duration: dd(0.08), ease: "none" }, pp(0.7)).to(lb, { opacity: 0.82, duration: dd(0.08), ease: "none" }, pp(0.7))
        // the watch itself, lifted off the last frame, sits above the panels so they can come out from behind it
        .set(".pq-cut", { opacity: 1 }, pp(0.79))
        .fromTo(".pq-pglight", { opacity: 0 }, { opacity: 1, duration: dd(0.1), ease: "none" }, pp(0.8));
      const from = (p: HTMLElement, origin: string, dx: number, dy: number) => ({ transformOrigin: origin, x: dx, y: dy, scale: 0.32 });
      const cR = ctl.offsetLeft + ctl.offsetWidth, cM = ctl.offsetTop + ctl.offsetHeight / 2, mM = mix.offsetTop + mix.offsetHeight / 2;
      if (tall) {
        tl.fromTo(mix, { ...from(mix, "50% 100%", 0, cy - (mix.offsetTop + mix.offsetHeight)), opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: dd(0.09), ...inn }, pp(0.805))
          .fromTo(ctl, { ...from(ctl, "50% 0%", 0, cy - ctl.offsetTop), opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: dd(0.09), ...inn }, pp(0.82));
      } else {
        tl.fromTo(ctl, { ...from(ctl, "100% 50%", cx - cR, cy - cM) }, { x: 0, y: 0, scale: 1, duration: dd(0.09), ...inn }, pp(0.805))
          .fromTo(ctl, { opacity: 0 }, { opacity: 1, duration: dd(0.02), ease: "none" }, pp(0.805))
          .fromTo(mix, { ...from(mix, "0% 50%", cx - mix.offsetLeft, cy - mM) }, { x: 0, y: 0, scale: 1, duration: dd(0.09), ...inn }, pp(0.822))
          .fromTo(mix, { opacity: 0 }, { opacity: 1, duration: dd(0.02), ease: "none" }, pp(0.822));
      }
      tl.fromTo(".pq-pgtitle", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: dd(0.06), ...inn }, pp(0.845))
        .fromTo(".pq-flow", { opacity: 0 }, { opacity: 1, duration: dd(0.05) }, pp(0.9))
        .to({}, { duration: 0.001 }, 0.999);
      frame(tl.scrollTrigger!.progress);
    }
    const led_feel = led.pitcher.map((p) => p.feel);
    const railEls = $$(".pq-rail .lab span"), pg = $(".pq-pg");
    function frame(p: number) {
      fwant = filmTime(p) * (count - 1); queue();
      chips[0].classList.toggle("is-won", p > pp(0.35));
      railEls[0].className = p > 0.09 ? "is-on" : ""; railEls[1].className = p > A ? "is-on" : ""; railEls[2].className = p > pp(0.49) ? "is-on is-g" : "";
      const live = p > pp(0.86);
      pg.classList.toggle("is-live", live);
      if (p < pp(0.78) && faceOn.current) { faceOn.current = false; gsap.set(".pq-face", { opacity: 0 }); }
      el!.dataset.stop = String(p < 0.08 ? 1 : p < 0.23 ? 2 : p < 0.35 ? 3 : p < pp(0.21) ? 4 : p < pp(0.44) ? 5 : p < pp(0.7) ? 6 : 7);
    }

    load();
    let eagerT = 0;
    const afterLoad = () => { eagerT = window.setTimeout(goEager, 1200); };
    if (document.readyState === "complete") afterLoad(); else window.addEventListener("load", afterLoad, { once: true });
    window.addEventListener("scroll", goEager, { once: true, passive: true });
    layout();
    let rt = 0;
    const onResize = () => { window.clearTimeout(rt); rt = window.setTimeout(() => { const d = tallScreen() ? "tall" : "wide"; if (d !== dir) { dir = d; load(); } layout(); queue(); }, 150); };
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => { if (!dead) layout(); });
    return () => {
      dead = true; window.removeEventListener("resize", onResize); window.removeEventListener("load", afterLoad); window.removeEventListener("scroll", goEager); window.clearTimeout(eagerT); window.clearTimeout(rt); cancelAnimationFrame(raf);
      tl?.scrollTrigger?.kill(); tl?.kill(); splits.forEach((s) => s.revert()); imgs.forEach((im) => { im.onload = null; im.src = ""; });
    };
  }, { scope: sec, dependencies: [frames.wide, frames.tall] });

  return (
    <section ref={sec} id="top" className="pq-film" aria-labelledby="hero-h" data-anchor={PLAYGROUND_AT}>
      <div className="pq-pin">
        <canvas className="pq-cv" aria-hidden="true" />
        <picture><source media="(max-aspect-ratio: 9/10)" srcSet="/media/film/watch/cut-tall.webp" /><img className="pq-cut" src="/media/film/watch/cut-wide.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" /></picture>
        <div className="pq-light is-b" aria-hidden="true" /><div className="pq-light is-g" aria-hidden="true" />
        <div className="pq-shade" aria-hidden="true" />

        <div className="pq-msg is-1">
          <h1 id="hero-h">Every pitch called.<br />Every call explained.</h1>
          <p>PitchIQ weighs your pitcher, the hitter and the count, then sends the call to two wrists.</p>
        </div>
        <div className="pq-msg is-2"><h2>It starts with the situation.</h2><p>The count, the outs, who&rsquo;s on, and how much the next pitch is worth.</p></div>
        <div className="pq-msg is-3 is-low"><h2>Then your pitcher. Then the hitter.</h2><p>What each pitch is doing today, which side he hits from, and what he just saw.</p></div>

        <div className="pq-ledger pq-glass" aria-label="What the engine is given">
          <div className="pq-lg is-a">
            <h3>The situation</h3>
            <ul>{led.situation.map((r) => <li key={r.k}><span><i className="pq-dot" />{r.k}</span><b>{r.v}</b></li>)}</ul>
          </div>
          <div className="pq-lg is-b">
            <h3 className="pq-step">Your pitcher, by feel today</h3>
            <ul>{led.pitcher.map((r) => <li key={r.k} className="pq-step"><span><i className="pq-dot" />{r.k}</span><span className="pq-feel" role="img" aria-label={`feel ${Math.round(r.feel * 100)}%`}><i style={{ transform: `scaleX(${r.feel})` }} /></span><b>{r.v}</b></li>)}</ul>
            <h3 className="pq-step">The hitter</h3>
            <ul>{led.hitter.map((r) => <li key={r.k} className="pq-step"><span><i className="pq-dot" />{r.k}</span><b>{r.v}</b></li>)}</ul>
          </div>
        </div>

        <div className="pq-msg is-4"><h2>Every pitch, every spot, weighed.</h2><p>The engine prices each call against all of it. The closer a call sits to the watch, the more of the mix it holds.</p></div>
        <div className="pq-msg is-5 is-big"><h2>Down to one.</h2><p>He&rsquo;s sitting slider. So the screen wakes up with something hard.</p></div>

        <ol className="pq-chips" aria-label="What the engine could throw here">
          {cands.map((c, i) => (
            <li key={c.key} className={`pq-chip pq-glass${i === 0 ? " pq-lens" : ""}`} data-group={c.name} data-pct={pct(c.p)}>
              <div className="t"><span>{c.name}</span><span>{pct(c.p)}%</span></div>
              <div className="pq-bar" aria-hidden="true"><b style={{ transform: `scaleX(${(c.p / top).toFixed(3)})` }} />{i === 0 ? <b className="g" /> : null}</div>
            </li>
          ))}
        </ol>

        <div className="pq-word is-1" aria-hidden="true">FASTBALL</div>
        <div className="pq-word is-2" aria-hidden="true">OUTSIDE</div>
        <div className="pq-callname"><h2>Fastball, outside.</h2></div>
        <div className="pq-landed pq-glass is-won" aria-hidden="true"><i />Call landed</div>
        <div className="pq-explain">
          <p className="big">On the pitcher&rsquo;s wrist and the catcher&rsquo;s.</p>
          <p>Fastball, outside is <span data-story-pct>{pct(top)}</span>% of the mix here, not 100%. The engine mixes on purpose, so a hitter can&rsquo;t sit on one pitch.</p>
        </div>

        <div className="pq-rail" aria-hidden="true"><div className="track"><b /></div><div className="lab"><span>Inputs</span><span>Decision</span><span>Call</span></div></div>
        <p className="pq-illus pq-fine">Illustration: the PitchIQ watch app on a generic smartwatch. The watch is a prototype.</p>

        <div className="pq-pglight" aria-hidden="true" />
        <Playground story={story} faceOn={faceOn} />
      </div>
    </section>
  );
}
