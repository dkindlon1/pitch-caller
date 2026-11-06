import "./portal.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "./components/Mark";

// The signed-in pages' frame. Functional for now: the coach portal's design is Plan 3.
export function Shell({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="shell field-grid">
      <header className="shell-top wrap">
        <Link href="/" className="shell-brand" aria-label="PitchIQ home"><Mark /> <span>PitchIQ</span></Link>
        {actions}
      </header>
      <main className="shell-main wrap">
        <h1 className="shell-h1">{title}</h1>
        {children}
      </main>
    </div>
  );
}
