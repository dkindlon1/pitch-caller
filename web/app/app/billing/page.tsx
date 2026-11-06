import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { Shell } from "../../shell";
import { addTeam, keepTeam, openPortal, payWaiting, removeTeam, startCheckout } from "./actions";
import { Activating } from "./activating";

export const metadata: Metadata = { title: "Billing · PitchIQ", robots: { index: false } };
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

type Team = { id: string; name: string; status: "pending" | "active" | "ending"; ends_at: string | null };
type Info = { id: string; name: string; level: string | null; status: "pending" | "active" | "locked"; sub_status: string | null; quantity: number | null;
  period_ends_at: string | null; has_customer: boolean; has_subscription: boolean; live: boolean; teams: Team[] };

const OK: Record<string, string> = {
  team_waiting: "Team added. It's included when you pay.", team_adding: "Team added: it switches on as soon as Stripe confirms the charge.",
  team_ending: "Removed. The team stays usable until the paid year ends, and isn't charged next year.", team_removed: "Removed.",
  team_kept: "Kept: the team is back in next year's count.",
};
const ERROR: Record<string, string> = {
  not_configured: "Payments aren't set up on this site yet. Your organization is saved: come back to pay once they are.",
  stripe: "Stripe couldn't be reached. Nothing was charged; try again in a moment.", live: "This organization is already paying.",
  no_teams: "Add a team first.", no_customer: "There's no card on file yet: pay first.", locked: "Billing is locked: update the card first.",
  team_name: "A team needs a name.", team: "That team couldn't be added.", payment: "The charge for the new team didn't go through. The team is waiting: try again, or update the card.",
  confirm: "Tick the box to confirm.", missing: "That team isn't in this organization.", last_team: "That's the last team: to stop altogether, cancel in Card and invoices.",
  not_yet: "Stripe hasn't confirmed the paid year yet: try again in a minute.", remove: "That team couldn't be removed.", keep: "That team can't be kept now.",
  name: "Your organization needs a name.",
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

export default function Billing({ searchParams }: { searchParams: Search }) {
  return (
    <Shell title="Billing" actions={<Link href="/app" className="shell-btn text">Your teams</Link>}>
      <Suspense fallback={<p className="shell-note">Loading billing…</p>}><Body searchParams={searchParams} /></Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login?next=/app/billing");
  const sb = await getServerSupabase();
  const { data: orgs } = await sb.from("organizations").select("id, name").eq("owner_id", user.id).order("name");
  if (!orgs || !orgs.length) return <p className="shell-note">You don&apos;t own an organization. <Link href="/app/new">Start one</Link>: name it, add your teams, pay by card.</p>;
  const pick = orgs.find((o) => o.id === one(sp.org)) || (orgs.length === 1 ? orgs[0] : null);
  if (!pick) return (
    <ul className="org-list" aria-label="Your organizations">{orgs.map((o) => <li key={o.id}><Link href={`/app/billing?org=${o.id}`}>{o.name}</Link></li>)}</ul>
  );
  const { data, error } = await sb.rpc("pc_billing_info", { org: pick.id });
  if (error || !data) return <p className="shell-alert" role="alert">Billing couldn&apos;t be loaded. Try again in a moment.</p>;
  const b = data as Info, org = b.id;
  const e = ERROR[one(sp.error)], o = OK[one(sp.ok)];
  const returned = one(sp.checkout) === "done";
  const waiting = b.teams.filter((t) => t.status === "pending");
  const hidden = <input type="hidden" name="org" value={org} />;
  return (
    <>
      {orgs.length > 1 ? <nav className="org-switch" aria-label="Organization">{orgs.map((x) => <Link key={x.id} href={`/app/billing?org=${x.id}`} aria-current={x.id === org ? "page" : undefined}>{x.name}</Link>)}</nav> : null}
      {e ? <p className="shell-alert" role="alert">{e}</p> : o ? <p className="shell-note ok-note" role="status">{o}</p> : null}
      {one(sp.checkout) === "cancelled" ? <p className="shell-note" role="status">Checkout cancelled: nothing was charged.</p> : null}

      <section className="dash-card" aria-labelledby="org-h">
        <h2 id="org-h" className="shell-h2">{b.name}</h2>
        {b.status === "active" ? (
          <p><span className="pill-ok">Active</span> {b.quantity ? `${b.quantity} team${b.quantity === 1 ? "" : "s"}` : ""}{b.period_ends_at ? `, paid through ${day(b.period_ends_at)}` : ""}</p>
        ) : b.status === "locked" ? (
          <p className="shell-alert" role="alert">Locked: {b.live ? "the last payment didn't go through. Open Card and invoices, update the card and pay the open invoice; every team switches back on as soon as it's paid." : "the subscription ended. Pay again to switch your teams back on: their data is kept for 12 months."}</p>
        ) : returned ? (
          <Activating />
        ) : (
          <p><span className="pill-warn">Not paid yet</span> Your teams switch on once you pay.</p>
        )}
        <div className="btn-row">
          {!b.live ? <form action={startCheckout} aria-label="Pay">{hidden}<button type="submit" className="shell-btn primary">{b.has_subscription ? "Pay again" : "Pay and switch on"} ({b.teams.filter((t) => t.status !== "ending").length} team{b.teams.filter((t) => t.status !== "ending").length === 1 ? "" : "s"})</button></form> : null}
          {b.has_customer ? <form action={openPortal} aria-label="Card and invoices">{hidden}<button type="submit" className="shell-btn">Card and invoices</button></form> : null}
        </div>
        <p className="shell-note small">Charged yearly per team, by card, through Stripe. Stripe emails each invoice and receipt.</p>
      </section>

      <section aria-labelledby="teams-h">
        <h2 id="teams-h" className="shell-h2">Teams</h2>
        <div className="tbl-scroll"><table className="data-tbl" aria-label="Teams">
          <thead><tr><th>Team</th><th>Status</th><th></th></tr></thead>
          <tbody>{b.teams.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{b.status === "locked" && t.status !== "pending" ? <span className="pill-warn">Locked</span> : t.status === "active" ? <span className="pill-ok">Active</span> : t.status === "ending" ? <span className="pill-warn">Ends {day(t.ends_at)}</span> : <span className="pill-warn">Waiting for payment</span>}</td>
              <td className="row-actions">
                {t.status === "ending" ? (
                  <form action={keepTeam} aria-label={`Keep ${t.name}`}>{hidden}<input type="hidden" name="team" value={t.id} /><button type="submit" className="shell-btn text">Keep this team</button></form>
                ) : b.status !== "locked" ? (
                  <details><summary className="shell-btn text">Remove</summary>
                    <form action={removeTeam} aria-label={`Remove ${t.name}`} className="shell-form tight">{hidden}<input type="hidden" name="team" value={t.id} />
                      <label className="check"><input type="checkbox" name="confirm" /> {t.status === "active" ? `Remove ${t.name} at the end of the paid year (no refund; its data stays 12 months)` : `Remove ${t.name}`}</label>
                      <button type="submit" className="shell-btn">Remove</button>
                    </form>
                  </details>
                ) : null}
              </td>
            </tr>))}</tbody>
        </table></div>
        {b.live && b.status === "active" && waiting.length ? (
          <form action={payWaiting} aria-label="Pay for waiting teams" className="btn-row">{hidden}<button type="submit" className="shell-btn">Pay for {waiting.length} waiting team{waiting.length === 1 ? "" : "s"}</button></form>
        ) : null}
        {b.status !== "locked" ? (
          <form action={addTeam} className="shell-form" aria-label="Add a team">{hidden}
            <label>Add a team<input name="name" required maxLength={120} placeholder="Team name" /></label>
            <p className="shell-note small">{b.live ? "Charged now for the rest of the paid year, then yearly with the others." : "It's included when you pay."}</p>
            <button type="submit" className="shell-btn">Add team</button>
          </form>
        ) : null}
      </section>
    </>
  );
}
