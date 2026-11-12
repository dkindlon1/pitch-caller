import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { Ball, Icon } from "./Icon";
import { Night } from "./Night";
import { Dock } from "./Dock";
import type { NavItem } from "@/lib/nav";
import { portalSans } from "@/app/portal-font";

export type SwitchItem = { href: string; label: string; sub?: string };

// The signed-in frame: the night ballpark, a glass bar (the mark, which organization and team you're in, a switcher
// when you're on more than one, the account menu) and the dock. Pages render inside.
export function Frame({ children, org, current, switchTo = [], dock, home, email, off, end, brandHref = "/app" }: {
  children: ReactNode; org?: string; current?: string; switchTo?: SwitchItem[]; dock?: NavItem[]; home?: string; email?: string | null; off?: string; end?: ReactNode; brandHref?: string;
}) {
  return (
    <div className={`pq ${portalSans.variable}`}>
      <Night />
      <div className={`pq-frame${dock && dock.length ? "" : " no-dock"}`}>
        <header className="pq-bar">
          <div className="pq-bar-in glass">
            <Link href={brandHref} className="pq-brand" aria-label="PitchIQ, your teams"><Ball /> <span>PitchIQ</span></Link>
            {current ? (
              <div className="pq-scope">
                {org ? <span className="pq-scope-org">{org}</span> : null}
                {switchTo.length ? (
                  <details className="pq-switch">
                    <summary aria-label={`${current}: switch team`}>{current} <Icon name="chevron" size={16} /></summary>
                    <div className="pq-menu glass">
                      {switchTo.map((x) => <Link key={x.href} href={x.href}>{x.label}{x.sub ? <small>{x.sub}</small> : null}</Link>)}
                      <hr /><Link href="/app">All your teams</Link>
                    </div>
                  </details>
                ) : <b className="pq-switch-one">{current}</b>}
              </div>
            ) : null}
            <div className="pq-bar-end">
              {off ? <span className="pq-off" role="status">{off}</span> : null}
              {end}
              {email !== undefined ? (
                <details className="pq-switch pq-me">
                  <summary aria-label="Your account">{(email || "?").slice(0, 1).toUpperCase()}</summary>
                  <div className="pq-menu glass">
                    <span style={{ padding: "8px 12px", color: "var(--text-2)", fontSize: ".875rem" }}>{email}</span>
                    <Link href="/app">Your teams</Link>
                    <Link href="/app/exports">Data downloads</Link>
                    <hr />
                    <form action={signOut}><button type="submit">Sign out</button></form>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </header>
        {dock && dock.length ? <Dock items={dock} home={home || ""} /> : null}
        <main className="pq-main" id="main">{children}</main>
      </div>
    </div>
  );
}
