import Link from "next/link";
import { Suspense } from "react";
import { adminOnly, day, STATUS } from "./lib";

type Search = Promise<Record<string, string | string[] | undefined>>;
type Org = { id: string; name: string; level: string | null; owner_email: string | null; status: string; sub_status: string | null; quantity: number | null;
  period_ends_at: string | null; created_at: string; teams: number; coaches: number; players: number };
type List = { signups: { users_7d: number; users_30d: number; orgs_7d: number; orgs_30d: number }; orgs: Org[] };

export default function Admin({ searchParams }: { searchParams: Search }) {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body searchParams={searchParams} /></Suspense>;
}

async function Body({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = String(Array.isArray(sp.q) ? sp.q[0] : sp.q || "").slice(0, 100);
  const { sb } = await adminOnly("/admin");
  const { data, error } = await sb.rpc("pc_admin_orgs", { search: q || null });
  if (error || !data) return <p className="shell-alert" role="alert">The organizations couldn&apos;t be loaded.</p>;
  const d = data as List;
  return (
    <>
      <h1 className="shell-h1">Organizations</h1>
      <div className="dash">
        <section className="dash-card" aria-label="Sign-ups"><h2 className="lbl">New accounts</h2><p className="big-num mono">{d.signups.users_7d}<small> this week, {d.signups.users_30d} in 30 days</small></p></section>
        <section className="dash-card" aria-label="New organizations"><h2 className="lbl">New organizations</h2><p className="big-num mono">{d.signups.orgs_7d}<small> this week, {d.signups.orgs_30d} in 30 days</small></p></section>
      </div>
      <form className="shell-form tight" role="search" aria-label="Find an organization">
        <label>Find by name or owner email<input name="q" defaultValue={q} maxLength={100} /></label>
        <button type="submit" className="shell-btn">Find</button>
      </form>
      <div className="tbl-scroll"><table className="data-tbl" aria-label="Organizations">
        <thead><tr><th>Organization</th><th>Owner</th><th>Billing</th><th className="num">Teams</th><th className="num">Coaches</th><th className="num">Players</th><th>Started</th></tr></thead>
        <tbody>{d.orgs.map((o) => (
          <tr key={o.id}>
            <td><Link href={`/admin/org/${o.id}`}>{o.name}</Link></td>
            <td>{o.owner_email}</td>
            <td><span className={o.status === "active" ? "pill-ok" : "pill-warn"}>{STATUS[o.status] || o.status}</span>{o.period_ends_at ? <small> to {day(o.period_ends_at)}</small> : null}</td>
            <td className="num mono">{o.teams}</td><td className="num mono">{o.coaches}</td><td className="num mono">{o.players}</td>
            <td>{day(o.created_at)}</td>
          </tr>))}</tbody>
      </table></div>
      {d.orgs.length ? null : <p className="shell-note">No organizations{q ? " match" : " yet"}.</p>}
    </>
  );
}
