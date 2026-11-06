import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { adminOnly, day, when, STATUS } from "../../lib";
import { resendExports, transferOwner } from "../../actions";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Org = { id: string; name: string; level: string | null; owner_email: string | null; status: string; sub_status: string | null; quantity: number | null;
  period_ends_at: string | null; created_at: string; billing_changed_at: string | null; has_customer: boolean;
  teams: { id: string; name: string; status: string; ends_at: string | null; created_at: string; coaches: number; players: number }[];
  staff: { team: string; email: string; role: string }[]; events: { type: string; result: string; created_at: string }[] };
const ERROR: Record<string, string> = { reason: "Give a reason: it goes in the audit log.", not_coach: "The new owner has to be a coach on one of its teams (with a confirmed email).", transfer: "That couldn't be done.",
  not_locked: "It isn't locked, so there's nothing to send.", resend: "The exports couldn't be sent. Check the logs and try again." };
type Exports = { locked: boolean; lapses: { lapse_at: string; files: number; people: number; sent: number; failed: number; no_provider: number; pending: number }[] };

export default function AdminOrg({ params, searchParams }: { params: Params; searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body params={params} searchParams={searchParams} /></Suspense>;
}

async function Body({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { org } = await params, sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(org)) notFound();
  const { sb } = await adminOnly(`/admin/org/${org}`);
  const [{ data, error }, { data: ex }] = await Promise.all([sb.rpc("pc_admin_org", { org }), sb.rpc("pc_admin_exports", { org })]);
  if (error || !data) notFound();
  const o = data as Org;
  const x = (ex || { locked: false, lapses: [] }) as Exports;
  const e = ERROR[String(sp.error || "")];
  return (
    <>
      <p><Link href="/admin">Organizations</Link></p>
      <h1 className="shell-h1">{o.name}</h1>
      {e ? <p className="shell-alert" role="alert">{e}</p> : sp.ok === "transferred" ? <p className="shell-note ok-note" role="status">Ownership moved. It&apos;s in the audit log.</p>
        : sp.ok === "resent" ? <p className="shell-note ok-note" role="status">Exports sent again to anyone missing one, and failed emails retried.</p> : null}
      <section className="dash-card" aria-label="Billing">
        <p><span className={o.status === "active" ? "pill-ok" : "pill-warn"}>{STATUS[o.status] || o.status}</span> Stripe: {o.sub_status || "no subscription"}{o.quantity !== null ? `, ${o.quantity} team${o.quantity === 1 ? "" : "s"}` : ""}{o.period_ends_at ? `, paid to ${day(o.period_ends_at)}` : ""}</p>
        <p className="shell-note small">Owner {o.owner_email} · started {day(o.created_at)}{o.billing_changed_at ? ` · billing last changed ${when(o.billing_changed_at)}` : ""}{o.has_customer ? "" : " · no Stripe customer yet"}</p>
      </section>
      <h2 className="shell-h2">Teams</h2>
      <div className="tbl-scroll"><table className="data-tbl" aria-label="Teams">
        <thead><tr><th>Team</th><th>Status</th><th className="num">Coaches</th><th className="num">Players</th><th>Started</th></tr></thead>
        <tbody>{o.teams.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.status}{t.ends_at ? ` (ends ${day(t.ends_at)})` : ""}</td><td className="num mono">{t.coaches}</td><td className="num mono">{t.players}</td><td>{day(t.created_at)}</td></tr>)}</tbody>
      </table></div>
      <h2 className="shell-h2">Staff</h2>
      <ul className="plain-list" aria-label="Staff">{o.staff.map((s, i) => <li key={i}>{s.team}: {s.email} <span className="lbl">{s.role}</span></li>)}</ul>
      <h2 className="shell-h2">Billing events</h2>
      {o.events.length ? <div className="tbl-scroll"><table className="data-tbl" aria-label="Billing events">
        <thead><tr><th>When</th><th>Event</th><th>Result</th></tr></thead>
        <tbody>{o.events.map((ev, i) => <tr key={i}><td>{when(ev.created_at)}</td><td className="mono">{ev.type}</td><td>{ev.result}</td></tr>)}</tbody>
      </table></div> : <p className="shell-note">None.</p>}
      <h2 className="shell-h2">Lapse exports</h2>
      {x.lapses.length ? <div className="tbl-scroll"><table className="data-tbl" aria-label="Lapse exports">
        <thead><tr><th>Lapse</th><th className="num">Files</th><th className="num">People</th><th className="num">Emailed</th><th className="num">Failed</th><th className="num">No email service</th></tr></thead>
        <tbody>{x.lapses.map((l) => <tr key={l.lapse_at}><td>{when(l.lapse_at)}</td><td className="num mono">{l.files}</td><td className="num mono">{l.people}</td><td className="num mono">{l.sent}</td><td className="num mono">{l.failed}</td><td className="num mono">{l.no_provider + l.pending}</td></tr>)}</tbody>
      </table></div> : <p className="shell-note">None.</p>}
      {x.locked ? (
        <form action={resendExports} className="shell-form" aria-label="Send the exports again">
          <input type="hidden" name="org" value={o.id} />
          <button type="submit" className="shell-btn">Send the exports again</button>
        </form>
      ) : null}
      <h2 className="shell-h2">Support</h2>
      <form action={transferOwner} className="shell-form" aria-label="Transfer ownership">
        <input type="hidden" name="org" value={o.id} />
        <label>New owner&apos;s email (a coach on one of its teams)<input name="email" type="email" required /></label>
        <label>Reason (goes in the audit log)<input name="reason" required maxLength={500} /></label>
        <button type="submit" className="shell-btn">Transfer ownership</button>
      </form>
    </>
  );
}
