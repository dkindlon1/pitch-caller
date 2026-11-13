"use client";
import { useEffect, useRef, useState } from "react";

// Stadium lights out of focus, drifting (a Runway Gen-4.5 clip, looped with a crossfade; web/public/media/runway).
// The video only loads near the screen and only plays on it; under reduced motion the first frame stands still.
export function Haze() {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const el = box.current;
    if (!el) return;
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setLoad(true); near.disconnect(); } }, { rootMargin: "60% 0px" });
    const seen = new IntersectionObserver(([e]) => {
      const v = vid.current;
      if (!v) return;
      if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
    });
    near.observe(el); seen.observe(el);
    return () => { near.disconnect(); seen.disconnect(); };
  }, []);

  return (
    <div className="mk-haze" ref={box} aria-hidden="true">
      {still || !load
        ? <img src="/media/runway/haze-loop.jpg" alt="" decoding="async" loading="lazy" />
        : (
          <video ref={vid} muted loop playsInline autoPlay preload="auto" poster="/media/runway/haze-loop.jpg">
            <source src="/media/runway/haze-loop.webm" type="video/webm" />
            <source src="/media/runway/haze-loop.mp4" type="video/mp4" />
          </video>
        )}
    </div>
  );
}
