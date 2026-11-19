"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// The report's switches. Every number is already on the page (rendered on the server); these only choose which slice
// or layer shows, so a screen reader, print and the check script read the same numbers the eye does.

export function Seg({ label, items, value, onChange }: { label: string; items: { key: string; label: ReactNode }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="rp-seg" role="group" aria-label={label}>
      {items.map((it) => <button key={it.key} type="button" aria-pressed={value === it.key} onClick={() => onChange(it.key)}>{it.label}</button>)}
    </div>
  );
}

/** Tabs over server-rendered slices: children are elements with data-slice="key"; only the chosen one shows. */
export function Slices({ label, items, initial, children }: { label: string; items: { key: string; label: string }[]; initial?: string; children: ReactNode }) {
  const [v, setV] = useState(initial || items[0]?.key || "");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>(":scope > [data-slice]").forEach((el) => { el.hidden = el.dataset.slice !== v; });
  }, [v]);
  return (
    <div className="rp-slices">
      <Seg label={label} items={items} value={v} onChange={setV} />
      <div ref={ref} style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

const LAYERS = [{ key: "strike", label: "Strikes" }, { key: "ball", label: "Balls" }, { key: "positive", label: "Positive" }, { key: "negative", label: "Negative" }];
const VIEWS = [{ key: "called", label: "Where it was called" }, { key: "landed", label: "Where it landed" }];
const LAYER_WORD: Record<string, string> = { strike: "strikes", ball: "balls", positive: "positive outcomes", negative: "negative outcomes" };

/** The heat map's three switches: which pitch, which layer, which view. Children: one .rp-filter per pitch filter. */
export function HeatSwitch({ filters, children }: { filters: { key: string; label: ReactNode }[]; children: ReactNode }) {
  const [f, setF] = useState("all"), [layer, setLayer] = useState("strike"), [view, setView] = useState("called");
  const ref = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>(".rp-filter").forEach((el) => { if (el.dataset.filter === f) el.setAttribute("data-on", ""); else el.removeAttribute("data-on"); });
  }, [f]);
  // hover / focus: the cell's counts in words
  useEffect(() => {
    const root = ref.current, t = tip.current;
    if (!root || !t) return;
    const show = (e: Event) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>(".rp-cell[data-tip]");
      if (!c) { t.hidden = true; return; }
      const [n, st, b, p, ng] = (c.dataset.v || "0,0,0,0,0").split(",").map(Number);
      t.textContent = `${c.dataset.tip}: ${n} pitch${n === 1 ? "" : "es"} · ${st} strike${st === 1 ? "" : "s"}, ${b} ball${b === 1 ? "" : "s"} · ${p} positive, ${ng} negative`;
      const r = c.getBoundingClientRect();
      t.hidden = false;
      t.style.left = `${Math.min(window.innerWidth - 250, Math.max(8, r.left + r.width / 2 - 120))}px`;
      t.style.top = `${r.top - t.offsetHeight - 8 < 8 ? r.bottom + 8 : r.top - t.offsetHeight - 8}px`;
    };
    const hide = () => { t.hidden = true; };
    root.addEventListener("pointerover", show); root.addEventListener("focusin", show);
    root.addEventListener("pointerleave", hide); root.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, { passive: true });
    return () => { root.removeEventListener("pointerover", show); root.removeEventListener("focusin", show); root.removeEventListener("pointerleave", hide); root.removeEventListener("focusout", hide); window.removeEventListener("scroll", hide); };
  }, []);
  return (
    <div className="rp-heatwrap" data-layer={layer} data-view={view} ref={ref}>
      <div className="rp-switches">
        <Seg label="Pitch" items={filters} value={f} onChange={setF} />
        <Seg label="Layer" items={LAYERS} value={layer} onChange={setLayer} />
        <Seg label="View" items={VIEWS} value={view} onChange={setView} />
      </div>
      <p className="sr" aria-live="polite">{`Showing ${LAYER_WORD[layer]}, ${view === "called" ? "where each pitch was called" : "where each pitch landed"}.`}</p>
      <div style={{ marginTop: 14 }}>{children}</div>
      <div className="rp-tip" ref={tip} hidden role="tooltip" />
    </div>
  );
}
