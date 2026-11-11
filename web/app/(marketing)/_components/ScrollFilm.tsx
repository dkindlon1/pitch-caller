"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// A film that plays as you scroll: a Runway clip cut into stills (scripts/film-frames.sh writes them to
// public/media/film/<name>/{wide,tall}/0001.webp ...), pinned to the screen and drawn to a canvas frame by frame.
// Frames load coarse to fine (every 16th first, then the gaps), so scrolling early still shows the nearest one.
// Beats are the words over it, each on screen for its own stretch of the scroll (they fade with opacity, so no glass
// panel inside a beat: an ancestor with opacity switches the blur off). Under reduced motion it's one still.

export type Beat = { from: number; to: number; node: ReactNode; className?: string };
type Set = { dir: string; count: number };

export function ScrollFilm({ name, wide, tall, length = 400, poster, beats, className, label, labelledBy, id, children }: {
  name: string; wide: number; tall?: number; length?: number; poster: string; beats: Beat[]; className?: string;
  label?: string; labelledBy?: string; id?: string; children?: ReactNode;
}) {
  const sec = useRef<HTMLElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const canvas = cvs.current, el = sec.current;
    if (!canvas || !el) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setStill(true); return; }
    let dead = false, kill = () => {}, want = 0, shown = -1, raf = 0;
    const pick = (): Set => (tall && window.innerWidth / window.innerHeight < 0.9 ? { dir: "tall", count: tall } : { dir: "wide", count: wide });
    let set = pick();
    const imgs: (HTMLImageElement | null)[] = [];
    const ok: boolean[] = [];

    function load(s: Set) {
      imgs.length = 0; ok.length = 0;
      const order: number[] = [], seen = new Set<number>();
      for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < s.count; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
      let next = 0, active = 0;
      const pump = () => {
        while (!dead && active < 6 && next < order.length) {
          const i = order[next++], im = new Image();
          active++;
          im.decoding = "async";
          im.onload = () => { ok[i] = true; active--; if (Math.abs(i - want) < Math.abs(shown - want) || shown < 0) paint(); pump(); };
          im.onerror = () => { active--; pump(); };
          im.src = `/media/film/${name}/${s.dir}/${String(i + 1).padStart(4, "0")}.webp`;
          imgs[i] = im;
        }
      };
      pump();
    }

    function nearest(i: number) {
      for (let d = 0; d < set.count; d++) {
        if (ok[i - d]) return i - d;
        if (ok[i + d]) return i + d;
      }
      return -1;
    }
    function paint() {
      raf = 0;
      const i = nearest(want);
      if (i < 0) return;
      const im = imgs[i]!;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1), cw = canvas!.clientWidth, ch = canvas!.clientHeight;
      if (canvas!.width !== Math.round(cw * dpr) || canvas!.height !== Math.round(ch * dpr)) { canvas!.width = Math.round(cw * dpr); canvas!.height = Math.round(ch * dpr); shown = -1; }
      if (i === shown) return;
      const s = Math.max(canvas!.width / im.naturalWidth, canvas!.height / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      ctx!.drawImage(im, (canvas!.width - w) / 2, (canvas!.height - h) / 2, w, h);
      shown = i;
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };

    function beatsAt(p: number) {
      beats.forEach((b, i) => {
        const node = beatEls.current[i];
        if (!node) return;
        // each beat fades in over the first 18% of its stretch and out over the last 18%
        const span = b.to - b.from, f = (p - b.from) / span, edge = 0.18;
        const o = f < 0 || f > 1 ? 0 : Math.min(1, f / edge, (1 - f) / edge);
        node.style.opacity = String(b.from <= 0 && p <= b.from ? 1 : o);
        node.style.transform = `translate3d(0, ${(1 - Math.min(1, f / edge)) * 24 - Math.max(0, (f - 1 + edge) / edge) * 24}px, 0)`;
        node.setAttribute("aria-hidden", o > 0.5 ? "false" : "true");
      });
    }

    load(set);
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (dead || !sec.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const st = ScrollTrigger.create({
        trigger: sec.current, start: "top top", end: "bottom bottom", scrub: true,
        onUpdate: (t) => { want = Math.round(t.progress * (set.count - 1)); queue(); beatsAt(t.progress); },
      });
      want = Math.round(st.progress * (set.count - 1)); beatsAt(st.progress); queue();
      const onResize = () => { const s = pick(); if (s.dir !== set.dir) { set = s; shown = -1; load(set); } shown = -1; queue(); };
      window.addEventListener("resize", onResize);
      kill = () => { st.kill(); window.removeEventListener("resize", onResize); };
    });
    return () => { dead = true; kill(); cancelAnimationFrame(raf); imgs.forEach((im) => { if (im) im.src = ""; }); };
  }, [name, wide, tall, beats]);

  return (
    <section ref={sec} id={id} className={`mk-film${still ? " is-still" : ""}${className ? ` ${className}` : ""}`} style={still ? undefined : { height: `${length}vh` }} aria-label={label} aria-labelledby={labelledBy}>
      <div className="mk-film-pin">
        {still
          ? <img className="mk-film-poster" src={poster} alt="" />
          : <canvas ref={cvs} className="mk-film-canvas" aria-hidden="true" style={{ backgroundImage: `url(${poster})` }} />}
        <div className="mk-film-shade" aria-hidden="true" />
        {children}
        {beats.map((b, i) => (
          <div key={i} ref={(n) => { beatEls.current[i] = n; }} className={`mk-film-beat${b.className ? ` ${b.className}` : ""}`} style={still ? { opacity: i === 0 ? 1 : 0 } : { opacity: i === 0 ? 1 : 0 }}>
            {b.node}
          </div>
        ))}
      </div>
    </section>
  );
}
