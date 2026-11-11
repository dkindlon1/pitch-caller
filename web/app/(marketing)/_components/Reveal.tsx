"use client";

import { useEffect, useRef } from "react";

// A paragraph that brightens word by word as it scrolls through the screen, so it's read at the pace it's scrolled.
// Under reduced motion, or before the script loads, every word is at full strength.
export function Reveal({ text, className, clock }: { text: string; className?: string; clock?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !ref.current) return;
    let kill = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (!ref.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const spans = ref.current.querySelectorAll("span");
      const tween = gsap.fromTo(
        spans,
        { opacity: 0.3 },
        { opacity: 1, ease: "none", stagger: 0.08, scrollTrigger: { trigger: ref.current, start: "top 78%", end: "bottom 42%", scrub: 0.6 } },
      );
      // the clock: a thin line under the words that runs out with them and turns red on the last ones
      const t2 = bar.current ? gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: ref.current, start: "top 78%", end: "bottom 42%", scrub: 0.6,
        onUpdate: (st) => bar.current?.classList.toggle("is-late", st.progress > 0.86) } }) : null;
      kill = () => { tween.scrollTrigger?.kill(); tween.kill(); t2?.scrollTrigger?.kill(); t2?.kill(); };
    });
    return () => kill();
  }, []);

  return (
    <>
    <p ref={ref} className={className}>
      {words.map((w, n) => (
        <span key={n}>{w}{n < words.length - 1 ? " " : ""}</span>
      ))}
    </p>
    {clock ? <span className="mk-clock" aria-hidden="true"><span ref={bar} /></span> : null}
    </>
  );
}
