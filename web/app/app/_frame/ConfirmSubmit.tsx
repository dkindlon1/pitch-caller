"use client";
import { useState } from "react";

// A destructive form button that asks once, in place: the first press turns it into "Yes, <do it>" and "Keep it".
export function ConfirmSubmit({ label, confirm, keep = "Keep it" }: { label: string; confirm: string; keep?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="shell-btn text" onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="pq-confirm" role="group" aria-label={label}>
      <button type="submit" className="shell-btn danger">{confirm}</button>
      <button type="button" className="shell-btn" onClick={() => setAsking(false)} autoFocus>{keep}</button>
    </span>
  );
}
