"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Spot } from "@/lib/story";
import { Watch } from "./Watch";
import { MOVING, calm, kit, motion, useKit } from "./motion";

// Two wrists: the pitcher and the catcher get the same call. The one watch from the film, still showing its call,
// slides apart into two as you scroll. Between them sits the coach's Accept button (in the product the coach accepts
// each call before it is sent). Pressing it, or scrolling past, sends a green pulse out to both watches: both faces
// change to the next call together and both give one long shake. Press again and the call changes: two short shakes.
// That is the product's own buzz pattern (one long for a new call, two short for a changed one). The faces always
// show a call: the old one stays up until the pulse arrives, then the new one replaces it. On a phone that can
// vibrate, the press (and only the press) also vibrates. No claim about speed, range or battery here.
// `calls` are the film situation's leading calls, from the engine.
export function TwoWrists({ calls }: { calls: Spot[] }) {
  const sec = useRef<HTMLElement>(null);
  const tl = useRef<{ kill(): unknown; progress(n: number): { kill(): unknown } } | null>(null);
  const sends = useRef(0);
  const landed = useRef(0);
  const [shown, setShown] = useState(0);          // which call is on both faces
  const [sent, setSent] = useState(0);            // how many calls have gone out
  const [say, setSay] = useState("");
  const name = (c: Spot) => `${c.pitch}${c.words.length ? `, ${c.words.join(" ").toLowerCase()}` : ""}`;

  const send = useCallback((byPress: boolean) => {
    const n = ++sends.current, changed = n > 1, next = n % calls.length, el = sec.current;
    setSent(n);
    setSay(`${changed ? "Changed call" : "New call"} on both watches: ${name(calls[next])}. ${changed ? "Two short buzzes." : "One long buzz."}`);
    if (byPress && typeof navigator !== "undefined" && "vibrate" in navigator) { try { navigator.vibrate(changed ? [90, 70, 90] : 380); } catch { /* not allowed here */ } }
    const k = kit();
    if (!el || !k || calm()) { setShown(next); return; }
    const { gsap } = k, M = motion(), words = el.querySelectorAll(".pq-tw-watch .pq-wwords"), pulse = el.querySelectorAll(".pq-tw-pulse i");
    tl.current?.progress(1).kill();
    // the pulse leaves the button toward both watches; the call that is up stays up until it gets there
    tl.current = gsap.timeline()
      .fromTo(pulse, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.36, ease: "power2.out" }, 0)
      .to(pulse, { opacity: 0, duration: 0.5, ease: "power2.out" }, 0.34)
      .to(words, { opacity: 0, y: -6, duration: 0.09, ease: M.inn, onComplete: () => setShown(next) }, 0.3);
  }, [calls]);

  // the new call is on the faces: bring it in, flash the rim, and buzz (one long, or two short for a change)
  useLayoutEffect(() => {
    const el = sec.current;
    const k = kit();
    if (!el || !k || landed.current === shown || calm()) { landed.current = shown; return; }      // only when the call on the faces changed
    landed.current = shown;
    const { gsap } = k, M = motion(), ws = el.querySelectorAll(".pq-tw-watch .pq-w"), words = el.querySelectorAll(".pq-tw-watch .pq-wwords"), rings = el.querySelectorAll(".pq-tw-watch .pq-wring");
    const t = gsap.timeline();
    t.fromTo(words, { opacity: 0.2, y: 7 }, { opacity: 1, y: 0, duration: 0.26, ease: M.out }, 0)
      .fromTo(rings, { opacity: 0.9 }, { opacity: 0, duration: 1.2, ease: "power2.out" }, 0);
    const shake = (at: number, dur: number) => t.to(ws, { keyframes: { x: [0, -5, 5, -4, 4, -3, 3, -2, 2, 0], rotation: [0, -0.6, 0.6, -0.5, 0.5, -0.3, 0.3, 0, 0, 0] }, duration: dur, ease: "none" }, at);
    if (sent > 1) { shake(0.04, 0.16); shake(0.3, 0.16); } else shake(0.04, 0.52);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useKit(({ gsap, ScrollTrigger }) => {
    const el = sec.current; if (!el) return;
    const M = motion(), mm = gsap.matchMedia();
    mm.add(MOVING, () => {
      const wide = window.matchMedia("(min-width: 861px)").matches;
      const a = el.querySelector(".pq-tw-watch.is-p"), b = el.querySelector(".pq-tw-watch.is-c"), labels = el.querySelectorAll(".pq-tw-watch .who"), mid = el.querySelector(".pq-tw-mid");
      // the split: both start on the same spot (one watch) and slide apart
      // (measured from layout, not from the screen: a refresh can ask again while the watches are already moved)
      const stage = el.querySelector<HTMLElement>(".pq-tw-stage")!;
      const off = (w: Element | null) => (w && wide ? stage.offsetWidth / 2 - ((w as HTMLElement).offsetLeft + (w as HTMLElement).offsetWidth / 2) : 0);
      const offY = (w: Element | null) => (w && !wide ? stage.offsetHeight / 2 - ((w as HTMLElement).offsetTop + (w as HTMLElement).offsetHeight / 2) : 0);
      const split = gsap.timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: { trigger: stage, start: "top 64%", end: "top 20%", scrub: M.scrub, invalidateOnRefresh: true } });
      split.fromTo(a, { x: () => off(a), y: () => offY(a) }, { x: 0, y: 0, duration: 1 }, 0)
        .fromTo(b, { x: () => off(b), y: () => offY(b) }, { x: 0, y: 0, duration: 1 }, 0)
        .fromTo(labels, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: M.out }, 0.72)
        .fromTo(mid, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: M.out }, 0.7);
      // scrolling past sends the next call once, if nobody pressed
      const st = ScrollTrigger.create({ trigger: stage, start: "top 14%", once: true, onEnter: () => { if (sends.current === 0) send(false); } });
      return () => { st.kill(); };
    });
    return () => { mm.revert(); tl.current?.kill(); };
  }, [send], sec);

  const c = calls[shown];
  return (
    <section ref={sec} id="wrists" className="pq-sec pq-tw" aria-labelledby="tw-h" tabIndex={-1}>
      <div className="pq-glowbg" aria-hidden="true" style={{ "--gx": "15%", "--gy": "30%" } as React.CSSProperties} />
      <div className="pq-wrap">
        <div className="pq-sec-head">
          <h2 id="tw-h">Two wrists. One call.</h2>
          <p>You accept the call. The pitcher and the catcher both get it, and both feel it.</p>
        </div>
        <div className="pq-tw-stage">
          <figure className="pq-tw-watch is-p"><Watch pitch={c.pitch} words={c.words} /><figcaption className="who">Pitcher</figcaption></figure>
          <div className="pq-tw-mid">
            <span className="pq-tw-pulse is-l" aria-hidden="true"><i /></span>
            <button type="button" className="pq-tw-accept pq-glass" onClick={() => send(true)}>
              <span className="k">{sent === 0 ? "Accept" : "Change the call"}</span>
              <span className="s">{sent === 0 ? "Send the next call" : "Send a different one"}</span>
            </button>
            <span className="pq-tw-pulse is-r" aria-hidden="true"><i /></span>
          </div>
          <figure className="pq-tw-watch is-c"><Watch pitch={c.pitch} words={c.words} /><figcaption className="who">Catcher</figcaption></figure>
        </div>
        <ul className="pq-tw-facts">
          <li className={sent === 1 ? "is-on" : ""}><span className="glyph" aria-hidden="true"><i className="long" /></span><b>One long buzz</b><span>A new call is on both wrists.</span></li>
          <li className={sent > 1 ? "is-on" : ""}><span className="glyph" aria-hidden="true"><i /><i /></span><b>Two short</b><span>The call changed. Look again.</span></li>
          <li><span className="glyph" aria-hidden="true"><i className="off" /></span><b>No link</b><span>The watch says so, and the coach gives the sign.</span></li>
        </ul>
        <p className="pq-fine pq-tw-fine">Illustration. The watch is a prototype, and the real one shows the catcher&rsquo;s sign number with the spot.</p>
        <p className="pq-sr" role="status" aria-live="polite">{say}</p>
      </div>
    </section>
  );
}
