import type { Metadata, Viewport } from "next";
import "../portal.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "../login/actions";
import { Frame } from "../app/_frame/Frame";

// the portal's own bar colour for the browser chrome (the public site keeps its own in the root layout)
export const viewport: Viewport = { themeColor: "#121316", colorScheme: "dark", width: "device-width", initialScale: 1 };

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
