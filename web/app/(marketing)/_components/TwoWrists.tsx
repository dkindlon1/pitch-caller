"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Spot } from "@/lib/story";
import { Watch } from "./Watch";
import { motion, reducedMotion } from "./motion";

// Two wrists: the pitcher and the catcher get the same call. The one watch from the film slides apart into two as you
// scroll. Between them sits the coach's Accept button (in the product the coach accepts each call before it is sent).
// Pressing it, or scrolling past, sends a green pulse out to both watches: both faces redraw together and both give one
// long shake. Press again and the call changes: two short shakes. That is the product's own buzz pattern (one long for
// a new call, two short for a changed one). On a phone that can vibrate, the press (and only the press) also vibrates.
// No claim about speed, range or battery here. `calls` are the film situation's two leading calls, from the engine.
export function TwoWrists({ calls }: { calls: Spot[] }) {
  const sec = useRef<HTMLElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const count = useRef(0);
  const [sent, setSent] = useState(0);            // how many calls have gone out
  const [say, setSay] = useState("");
  const shown = sent === 0 ? null : calls[(sent - 1) % calls.length];

  const send = useCallback((byPress: boolean) => {
    const next = ++count.current, changed = next > 1, c = calls[(next - 1) % calls.length], el = sec.current;
    setSent(next);
    setSay(`${changed ? "Changed call" : "New call"} on both watches: ${c.pitch}${c.words.length ? `, ${c.words.join(" ").toLowerCase()}` : ""}. ${changed ? "Two short buzzes." : "One long buzz."}`);
    if (byPress && typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(changed ? [90, 70, 90] : 380); } catch { /* not allowed here */ } }
    if (!el || reducedMotion()) return;
    const M = motion(), ws = el.querySelectorAll(".pq-tw-watch .pq-w"), words = el.querySelectorAll(".pq-wwords"), rings = el.querySelectorAll(".pq-wring"), pulse = el.querySelectorAll(".pq-tw-pulse i");
    tl.current?.progress(1).kill();
    const t = gsap.timeline();
    // the pulse leaves the button toward both watches, the faces redraw together, then the buzz
    t.fromTo(pulse, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.42, ease: "power2.out" }, 0).to(pulse, { opacity: 0, duration: 0.5, ease: "power2.out" }, 0.36)
      .fromTo(words, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: M.out }, 0.34)
      .fromTo(rings, { opacity: 1 }, { opacity: 0, duration: 1.1, ease: "power2.out" }, 0.34);
    const shake = (at: number, dur: number) => t.to(ws, { keyframes: { x: [0, -5, 5, -4, 4, -3, 3, -2, 2, 0], rotation: [0, -0.6, 0.6, -0.5, 0.5, -0.3, 0.3, 0, 0, 0] }, duration: dur, ease: "none" }, at);
    if (changed) { shake(0.4, 0.16); shake(0.66, 0.16); } else shake(0.4, 0.52);
    tl.current = t;
  }, [calls]);
  // reduced motion: two still watches already showing the same call
  useEffect(() => { if (reducedMotion() && count.current === 0) { count.current = 1; setSent(1); } }, []);

  useGSAP(() => {
    const el = sec.current; if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const M = motion(), mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const wide = window.matchMedia("(min-width: 861px)").matches;
      const a = el.querySelector(".pq-tw-watch.is-p"), b = el.querySelector(".pq-tw-watch.is-c"), labels = el.querySelectorAll(".pq-tw-watch .who"), mid = el.querySelector(".pq-tw-mid");
      // the split: both start on the same spot (one watch) and slide apart
      const off = (w: Element | null, dir: number) => { if (!w) return 0; const r = (w as HTMLElement).getBoundingClientRect(), s = el.querySelector(".pq-tw-stage")!.getBoundingClientRect(); return wide ? (s.left + s.width / 2) - (r.left + r.width / 2) : 0 * dir; };
      const offY = (w: Element | null) => { if (!w || wide) return 0; const r = (w as HTMLElement).getBoundingClientRect(), s = el.querySelector(".pq-tw-stage")!.getBoundingClientRect(); return (s.top + s.height / 2) - (r.top + r.height / 2); };
      const split = gsap.timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: { trigger: el.querySelector(".pq-tw-stage"), start: "top 78%", end: "center 52%", scrub: M.scrub, invalidateOnRefresh: true } });
      split.fromTo(a, { x: () => off(a, 1), y: () => offY(a) }, { x: 0, y: 0, duration: 1 }, 0)
        .fromTo(b, { x: () => off(b, -1), y: () => offY(b) }, { x: 0, y: 0, duration: 1 }, 0)
        .fromTo(labels, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: M.out }, 0.72)
        .fromTo(mid, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: M.out }, 0.7);
      // scrolling past sends the first call once, if nobody pressed
      const st = ScrollTrigger.create({ trigger: el.querySelector(".pq-tw-stage"), start: "center 46%", once: true, onEnter: () => { if (count.current === 0) send(false); } });
      return () => { st.kill(); };
    });
    return () => { mm.revert(); tl.current?.kill(); };
  }, { scope: sec, dependencies: [send] });

  const c = shown || calls[0];
  return (
    <section ref={sec} id="wrists" className="pq-sec pq-tw" aria-labelledby="tw-h" tabIndex={-1}>
      <div className="pq-glowbg" aria-hidden="true" style={{ "--gx": "15%", "--gy": "30%" } as React.CSSProperties} />
      <div className="pq-wrap">
        <div className="pq-sec-head">
          <h2 id="tw-h">Two wrists. One call.</h2>
          <p>You accept the call. The pitcher and the catcher both get it, and both feel it: one long buzz for a new call, two short if it changed.</p>
        </div>
        <div className="pq-tw-stage">
          <figure className="pq-tw-watch is-p"><Watch pitch={c.pitch} words={c.words} blank={!shown} /><figcaption className="who">Pitcher</figcaption></figure>
          <div className="pq-tw-mid">
            <span className="pq-tw-pulse is-l" aria-hidden="true"><i /></span>
            <button type="button" className="pq-tw-accept pq-glass" onClick={() => send(true)}>
              <span className="k">{sent === 0 ? "Accept" : "Change the call"}</span>
              <span className="s">{sent === 0 ? "Send it to both" : "Send a new one"}</span>
            </button>
            <span className="pq-tw-pulse is-r" aria-hidden="true"><i /></span>
          </div>
          <figure className="pq-tw-watch is-c"><Watch pitch={c.pitch} words={c.words} blank={!shown} /><figcaption className="who">Catcher</figcaption></figure>
        </div>
        <p className="pq-tw-buzz" aria-hidden="true">
          <span className={sent === 1 ? "is-on" : ""}><i className="long" />New call: one long buzz</span>
          <span className={sent > 1 ? "is-on" : ""}><i /><i />Changed call: two short</span>
        </p>
        <p className="pq-fine pq-tw-fine">Illustration. The watch is a prototype, and the real one shows the catcher&rsquo;s sign number with the spot.</p>
        <p className="pq-sr" role="status" aria-live="polite">{say}</p>
      </div>
    </section>
  );
}
