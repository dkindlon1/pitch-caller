"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mark } from "./Mark";

// The glass pill at the top: it tightens once the page is scrolled and marks the section on screen. On phones the
// links fold into a glass sheet behind a Menu button (Escape or a tap outside closes it, focus returns to the button).
const LINKS = [
  { id: "pg", label: "Try the engine" },
  { id: "at-bat", label: "The at-bat" },
  { id: "wrists", label: "Two wrists" },
  { id: "programs", label: "For programs" },
];
const SHEET = [...LINKS, { id: "faq", label: "Questions" }];

export function Nav() {
  const [tight, setTight] = useState(false);
  const [here, setHere] = useState("");
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const film = document.getElementById("top"), pg = document.getElementById("pg");
    const onScroll = () => {
      setTight(window.scrollY > window.innerHeight * 0.3);
      // the playground lives inside the film's pinned scene, so it is "here" while its panels are live
      if (film && film.getBoundingClientRect().bottom > window.innerHeight * 0.5) setHere(pg?.classList.contains("is-live") ? "pg" : "top");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setHere(e.target.id); }, { rootMargin: "-45% 0px -50% 0px" });
    for (const l of ["at-bat", "wrists", "programs", "faq", "contact"]) { const el = document.getElementById(l); if (el) io.observe(el); }
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!sheet.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <header className={`pq-nav${tight ? " is-tight" : ""}${open ? " is-open" : ""}`}>
      <nav className="pq-nav-pill pq-glass" aria-label="Main">
        <Link href="/" className="pq-brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link>
        {LINKS.map((l) => (
          <a key={l.id} className={`pq-nav-link${here === l.id ? " is-here" : ""}`} href={`#${l.id}`} aria-current={here === l.id ? "location" : undefined}>{l.label}</a>
        ))}
        <Link className="pq-nav-link" href="/login">Sign in</Link>
        <button type="button" className="pq-nav-menu" ref={btn} aria-expanded={open} aria-controls="pq-sheet" onClick={() => setOpen((o) => !o)}>
          <span className="pq-sr">{open ? "Close menu" : "Menu"}</span>
          <i aria-hidden="true" /><i aria-hidden="true" />
        </button>
        <a className="pq-cta is-sm" href="#contact">Talk to us</a>
      </nav>
      <div className="pq-sheet pq-glass" id="pq-sheet" ref={sheet} hidden={!open}>
        <ul>
          {SHEET.map((l) => (
            <li key={l.id}><a href={`#${l.id}`} onClick={() => setOpen(false)} aria-current={here === l.id ? "location" : undefined}>{l.label}</a></li>
          ))}
          <li><Link href="/login" onClick={() => setOpen(false)}>Sign in</Link></li>
        </ul>
      </div>
    </header>
  );
}
