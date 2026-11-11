"use client";
import { useEffect, useRef } from "react";

// A baseball's seam, close up (a Runway still; web/public/media/runway), behind the few seconds between pitches. It
// settles as the section scrolls through, like a ball turning in the hand before the sign.
export function Seam() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let kill = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      const node = el.current;
      if (!node) return;
      gsap.registerPlugin(ScrollTrigger);
      const t = gsap.fromTo(node, { scale: 1.18, rotate: -4, yPercent: 6 }, {
        scale: 1, rotate: 0, yPercent: -4, ease: "none",
        scrollTrigger: { trigger: node.parentElement, start: "top bottom", end: "bottom top", scrub: true },
      });
      kill = () => { t.scrollTrigger?.kill(); t.kill(); };
    });
    return () => kill();
  }, []);
  return <div className="mk-seam" ref={el} aria-hidden="true" />;
}
