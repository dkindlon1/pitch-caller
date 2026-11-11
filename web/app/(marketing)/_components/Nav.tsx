"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mark } from "./Mark";

// The glass pill at the top: condenses once the hero is scrolled past and marks the section on screen. On phones the
// links fold into a glass sheet behind a Menu button (Escape or a tap outside closes it, focus returns to the button).
const LINKS = [
  { id: "at-bat", label: "How it calls" },
  { id: "demo", label: "Try it" },
  { id: "dugout", label: "In the dugout" },
];
const SHEET = [...LINKS, { id: "gameday", label: "A game with PitchIQ" }, { id: "faq", label: "Questions" }];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [here, setHere] = useState("");
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setHere(e.target.id); }, { rootMargin: "-45% 0px -50% 0px" });
    for (const l of [...SHEET.map((x) => x.id), "contact", "between", "reads", "program", "rules"]) { const el = document.getElementById(l); if (el) io.observe(el); }
    return () => { window.removeEventListener("scroll", onScroll); io.disconnect(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const first = sheet.current?.querySelector<HTMLElement>("a");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!sheet.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <header className={`mk-nav${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <nav className="mk-nav-pill mk-glass" aria-label="Main">
        <Link href="/" className="mk-nav-brand" aria-label="PitchIQ home"><Mark /><span>PitchIQ</span></Link>
        {LINKS.map((l) => (
          <a key={l.id} className={`mk-nav-link${here === l.id ? " is-here" : ""}`} href={`#${l.id}`} aria-current={here === l.id ? "location" : undefined}>{l.label}</a>
        ))}
        <Link className="mk-nav-link" href="/login">Sign in</Link>
        <button type="button" className="mk-nav-menu" ref={btn} aria-expanded={open} aria-controls="mk-sheet" onClick={() => setOpen((o) => !o)}>
          <span className="mk-sr">{open ? "Close menu" : "Menu"}</span>
          <i aria-hidden="true" /><i aria-hidden="true" />
        </button>
        <a className="mk-btn mk-btn-sm" href="#contact">Talk to us</a>
      </nav>
      <div className="mk-sheet mk-glass" id="mk-sheet" ref={sheet} hidden={!open}>
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
