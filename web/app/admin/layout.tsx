import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "../components/Mark";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Admin · PitchIQ", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell field-grid">
      <header className="shell-top wrap">
        <Link href="/admin" className="shell-brand" aria-label="PitchIQ admin"><Mark /> <span>PitchIQ admin</span></Link>
        <form action={signOut}><button type="submit" className="shell-btn text">Sign out</button></form>
      </header>
      <nav className="portal-nav wrap" aria-label="Admin">
        <Link href="/admin">Organizations</Link><Link href="/admin/audit">Audit log</Link>
        <span className="team-off">Every page and action here is written to the audit log</span>
      </nav>
      <main className="shell-main portal wrap">{children}</main>
    </div>
  );
}
