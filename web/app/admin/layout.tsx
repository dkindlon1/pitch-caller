import type { Metadata } from "next";
import "../portal.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "../login/actions";
import { Frame } from "../app/_frame/Frame";

export const metadata: Metadata = { title: "Admin · PitchIQ", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Frame brandHref="/admin" current="Admin" end={<form action={signOut}><button type="submit" className="shell-btn text">Sign out</button></form>}>
      <nav className="portal-nav" aria-label="Admin">
        <Link href="/admin">Organizations</Link><Link href="/admin/audit">Audit log</Link>
      </nav>
      <p className="shell-note small" style={{ marginBottom: 18 }}>Every page and action here is written to the audit log.</p>
      {children}
    </Frame>
  );
}
