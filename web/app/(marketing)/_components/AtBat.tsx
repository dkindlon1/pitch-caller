"use client";
import { useRef, useState } from "react";
import type { AtBatPitch } from "@/lib/story_server";
import { pct } from "@/lib/story";
import { Watch } from "./Watch";
import { motion, useKit } from "./motion";

// The at-bat: one real at-bat as a strip of watch faces, one per pitch, with the result under each. The film showed
// one call; this shows how each call depends on the last. As you scroll, a blue thread leaves the face that was just
// thrown, carrying that pitch's speed and height, and runs into the next face, which lights as its call lands. On the
// last pitch the whole thread turns green, so the at-bat reads as one plan. Any face opens the mix the engine was
// choosing from at that count (replayed through the engine when the page is built: lib/story_server.ts, atBat()).
// Wide screens pin the row and scrub it; phones stack it and run the thread down the left edge; reduced motion gets
// the same content as a plain list (the stylesheet's default state is the finished one).
export function AtBat({ pitches }: { pitches: AtBatPitch[] }) {
  const sec = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const last = pitches.length - 1;

  useKit(({ gsap }) => {
    const el = sec.current; if (!el) return;
    const M = motion(), mm = gsap.matchMedia();
    const q = <T extends Element = HTMLElement>(s: string) => Array.from(el.querySelectorAll(s)) as unknown as T[];
    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 861px)", () => {
      el.classList.add("is-scrub");
      const items = q(".pq-ab-item"), lines = q(".pq-ab-line > span"), segs = q(".pq-ab-seg"), n = items.length, step = 1 / (n + 0.9);
      const tl = gsap.timeline({ defaults: { ease: M.out }, scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: M.scrub } });
      gsap.set(lines, { opacity: 0 });
      gsap.set(lines[0], { opacity: 1 });
      items.forEach((it, k) => {
        const t = k * step + 0.04, face = it.querySelector(".pq-w")!, words = it.querySelector(".pq-wwords"), dash = it.querySelector(".pq-wdash"), ring = it.querySelector(".pq-wring"), meta = it.querySelector(".pq-ab-meta");
        if (k > 0) {
          tl.to(lines[k - 1], { opacity: 0, y: -14, duration: step * 0.14, ease: M.inn }, t - step * 0.2)
            .fromTo(lines[k], { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: step * 0.3 }, t - step * 0.04);
        }
        // the call lands on this face
        tl.fromTo(face, { opacity: k === 0 ? 1 : 0.34 }, { opacity: 1, duration: step * 0.2 }, t)
          .fromTo(dash, { opacity: 1 }, { opacity: 0, duration: step * 0.1 }, t)
          .fromTo(words, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: step * 0.22 }, t + step * 0.06)
          .fromTo(ring, { opacity: 0 }, { opacity: 1, duration: step * 0.12, ease: "none" }, t).to(ring, { opacity: 0, duration: step * 0.5, ease: "none" }, t + step * 0.2)
          .fromTo(meta, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: step * 0.25 }, t + step * 0.3);
        // then the thread carries it to the next face (a mask slides off the line: transforms only)
        const seg = segs[k];
        if (seg) {
          const inn = seg.querySelector(".in"), svg = seg.querySelector(".in > svg"), lab = seg.querySelector(".lab");
          tl.fromTo(inn, { xPercent: -101 }, { xPercent: 0, duration: step * 0.5, ease: "power1.inOut" }, t + step * 0.42)
            .fromTo(svg, { xPercent: 101 }, { xPercent: 0, duration: step * 0.5, ease: "power1.inOut" }, t + step * 0.42)
            .fromTo(lab, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: step * 0.2 }, t + step * 0.5);
        }
      });
      // the last pitch: the whole thread lights at once
      const end = (n - 1) * step + 0.04 + step * 0.55;
      tl.fromTo(q(".pq-ab-seg .g"), { opacity: 0 }, { opacity: 1, duration: step * 0.3, ease: "none" }, end)
        .fromTo(q(".pq-ab-item .pq-wring"), { opacity: 0 }, { opacity: 0.75, duration: step * 0.3, ease: "none", immediateRender: false }, end)
        .to(lines[n - 1], { opacity: 0, y: -14, duration: step * 0.14, ease: M.inn }, end - step * 0.05)
        .fromTo(lines[n], { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: step * 0.3 }, end + step * 0.12)
        .to({}, { duration: 0.001 }, 0.999);
      return () => { el.classList.remove("is-scrub"); };
    });
    mm.add("(prefers-reduced-motion: no-preference) and (max-width: 860px)", () => {
      // phone: the thread runs down the left edge as the stack scrolls by; each pitch arrives as it comes into view
      gsap.fromTo(el.querySelector(".pq-ab-rail i"), { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: el.querySelector(".pq-ab-row"), start: "top 70%", end: "bottom 60%", scrub: M.scrub } });
      q(".pq-ab-item").forEach((it) => gsap.from(it, { opacity: 0, y: 34, duration: M.durIn, ease: M.out, scrollTrigger: { trigger: it, start: "top 82%", once: true } }));
    });
    return () => mm.revert();
  }, [], sec);

  return (
    <section ref={sec} id="at-bat" className="pq-ab" aria-labelledby="ab-h" tabIndex={-1}>
      <div className="pq-ab-pin">
        <div className="pq-glowbg" aria-hidden="true" style={{ "--gx": "38%", "--gy": "26%" } as React.CSSProperties} />
        <div className="pq-wrap">
          <div className="pq-sec-head">
            <h2 id="ab-h">Each call sets up the next.</h2>
            <p>One at-bat the engine called, pitch by pitch. Open any watch to see what it was choosing from.</p>
          </div>
          <p className="pq-ab-line" aria-hidden="true">
            {pitches.map((p) => <span key={p.n}><b>{p.count}.</b> {p.why}</span>)}
            <span>Four calls. One plan.</span>
          </p>
          <ol className="pq-ab-row">
            <li className="pq-ab-rail" role="presentation" aria-hidden="true"><i /></li>
            {pitches.map((p, k) => {
              const call = `${p.pitch}${p.words.length ? `, ${p.words.join(" ").toLowerCase()}` : ""}`, isOpen = open === k;
              return (
                <li key={p.n} className={`pq-ab-item${isOpen ? " is-open" : ""}`} onMouseEnter={() => setOpen(k)} onMouseLeave={() => setOpen((o) => (o === k ? null : o))}>
                  <button type="button" className="pq-ab-face" aria-expanded={isOpen} aria-controls={`ab-mix-${k}`} onClick={() => setOpen(isOpen ? null : k)}
                    aria-label={`Pitch ${p.n}, count ${p.count}: ${call}. ${p.result}. Show the mix.`}>
                    <Watch pitch={p.pitch} words={p.words} />
                  </button>
                  <div className="pq-ab-meta">
                    <span className="n">Pitch {p.n} <i>{p.count}</i></span>
                    <b>{p.result}{k === last ? ". Strike three." : ""}</b>
                    <span className="why">{p.why}</span>
                  </div>
                  <div className="pq-ab-mix pq-glass" id={`ab-mix-${k}`} hidden={!isOpen}>
                    <span className="pq-lbl">The mix at {p.count}</span>
                    {p.mix.map((g) => (
                      <div key={g.key} className="pq-ab-mrow"><span className="t"><span>{g.name}</span><span>{pct(g.p)}%</span></span><span className="pq-bar" aria-hidden="true"><b style={{ transform: `scaleX(${(g.p / p.mix[0].p).toFixed(3)})` }} /></span></div>
                    ))}
                    {p.share != null ? <span className="pq-fine">This call was {pct(p.share)}% of it.</span> : null}
                  </div>
                  {k < last ? (
                    <span className="pq-ab-seg" aria-hidden="true">
                      <span className="in">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                          <path className="b" d={`M0 ${p.h * 100} C50 ${p.h * 100} 50 ${pitches[k + 1].h * 100} 100 ${pitches[k + 1].h * 100}`} />
                          <path className="g" d={`M0 ${p.h * 100} C50 ${p.h * 100} 50 ${pitches[k + 1].h * 100} 100 ${pitches[k + 1].h * 100}`} />
                        </svg>
                      </span>
                      <span className="lab">{p.velo} mph, {p.height}</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="pq-fine pq-ab-fine">A real at-bat from the engine: the calls, the reasons and each mix are its own. The results were picked by hand to play it out. Sample starter against a same-side hitter; the watch faces are an illustration.</p>
        </div>
      </div>
    </section>
  );
}
