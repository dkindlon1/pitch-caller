import Link from "next/link";
import { Suspense } from "react";
import { adminOnly, when } from "../lib";

type Row = { id: number; at: string; admin_email: string | null; action: string; org_id: string | null; org_name: string | null; detail: Record<string, unknown> };
const ACTION: Record<string, string> = { list_orgs: "Listed organizations", view_org: "Opened an organization", view_audit: "Opened the audit log", transfer_owner: "Transferred ownership" };

export default function Audit() {
  return <Suspense fallback={<p className="shell-note">Loading…</p>}><Body /></Suspense>;
}

async function Body() {
  const { sb } = await adminOnly("/admin/audit");
  const { data, error } = await sb.rpc("pc_admin_audit", { lim: 200 });
  if (error || !data) return <p className="shell-alert" role="alert">The audit log couldn&apos;t be loaded.</p>;
  const rows = data as Row[];
  return (
    <>
      <h1 className="shell-h1">Audit log</h1>
      <div className="tbl-scroll"><table className="data-tbl" aria-label="Audit log">
        <thead><tr><th>When</th><th>Admin</th><th>What</th><th>Organization</th><th>Detail</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td>{when(r.at)}</td><td>{r.admin_email}</td><td>{ACTION[r.action] || r.action}</td>
            <td>{r.org_id ? <Link href={`/admin/org/${r.org_id}`}>{r.org_name || r.org_id}</Link> : ""}</td>
            <td className="small">{typeof r.detail.reason === "string" ? r.detail.reason : typeof r.detail.search === "string" ? `search "${r.detail.search}"` : ""}</td>
          </tr>))}</tbody>
      </table></div>
    </>
  );
}
