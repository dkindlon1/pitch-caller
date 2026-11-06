import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { pitchesOf, proposalsOf, teamToday, uploadsOf, type ProposalRow } from "@/lib/upload_data";
import { propose, REASONS, SESSION_LABEL, summarize } from "@/lib/uploads";
import { decideProposal, deleteUpload, reviewUpload } from "./actions";
import { UploadForm, type Template } from "./upload-form";
import type { UploadAccess } from "./access";

// The upload screens, the same for the pitcher (player portal) and his coaches (coach portal): his uploads, what
// they propose, and each upload's pitches to review.
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const OK: Record<string, string> = { uploaded: "Uploaded. Leave out any warmups below, and mark pitches you're still developing.", reviewed: "Saved. The proposals are worked out again from every upload.",
  deleted: "Upload deleted.", accepted: "Accepted: the value is in the arsenal now, and goes to the iPad on its next sync.", rejected: "Rejected: nothing changed." };
const ERROR: Record<string, string> = { not_allowed: "You can see these but not change them.", file: "That file couldn't be read.", empty: "There were no pitches to upload.",
  too_big: "That's over 5000 pitches: upload one session at a time.", date: "The session needs a date (not in the future).", daily: "That's 50 uploads for him today. Try again tomorrow.",
  upload: "That couldn't be uploaded. Try again in a moment.", missing: "That isn't there any more.", review: "Those changes couldn't be saved.", confirm: "Tick the box to confirm.",
  delete: "That couldn't be deleted.", decided: "That's already been decided.", pitch_gone: "That pitch isn't in the arsenal any more.", decide: "That couldn't be saved." };
const day = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const SRC: Record<string, string> = { trackman: "TrackMan", rapsodo: "Rapsodo", mapped: "Other" };

export function Notice({ sp }: { sp: SP }) {
  const e = ERROR[one(sp.error)], o = OK[one(sp.ok)];
  return e ? <p className="shell-alert" role="alert">{e}</p> : o ? <p className="shell-note ok-note" role="status">{o}</p> : null;
}

export function Tabs({ base, at, label }: { base: string; at: "profile" | "uploads" | "stats"; label: string }) {
  const tabs: [string, string, string][] = [["profile", "", label], ["uploads", "/uploads", "Uploads"], ["stats", "/stats", "Stats"]];
  return <nav className="sub-tabs" aria-label="Pitcher">{tabs.map(([k, h, l]) => <Link key={k} href={base + h} aria-current={k === at ? "page" : undefined}>{l}</Link>)}</nav>;
}

function what(p: ProposalRow) {
  const v = p.value as Record<string, unknown> | number | string;
  if (p.field === "velo") return { label: `${p.pitch_name} velocity`, now: p.current === null || p.current === "" ? "not set" : `${p.current} mph`, next: `${v} mph` };
  if (p.field === "shape") {
    const c = (p.current || {}) as Record<string, unknown>, n = v as Record<string, unknown>;
    const s = (x: Record<string, unknown>) => (x.ivb === null || x.ivb === undefined || x.ivb === "" ? `${x.shape || "no shape"}` : `${x.shape || "?"}, ${x.ivb} in up / ${x.hb} in arm side`);
    return { label: `${p.pitch_name} shape`, now: s(c), next: s(n) };
  }
  return { label: "Arm slot", now: String(p.current || "not set"), next: String(v) };
}

export async function UploadsPanel({ a, sp }: { a: UploadAccess; sp: SP }) {
  const t = a.team.team_id, today = await teamToday(a.team.timezone);
  const sb = await getServerSupabase();
  const [ups, pend, all, { data: tpl }] = await Promise.all([uploadsOf(t, a.pitcher.id), proposalsOf(t, a.pitcher.id, "pending"), pitchesOf(t, a.pitcher.id),
    sb.from("upload_templates").select("name, header_sig, mapping").eq("program_id", t).limit(50)]);
  const sum = summarize(all, today), { unmatched, notes } = propose(a.pitcher, sum);
  const dev = sum.filter((s) => s.developing > 0);
  return (
    <>
      <Notice sp={sp} />
      <section aria-labelledby="prop-h">
        <h2 id="prop-h" className="shell-h2">Proposed from uploads {pend.length ? <span className="pill-warn">{pend.length} to review</span> : null}</h2>
        {pend.length ? (
          <ul className="plain-list props" aria-label="Proposals">{pend.map((p) => {
            const w = what(p);
            return (
              <li key={p.id}>
                <span><b>{w.label}</b>: {w.now} → <b>{w.next}</b> <span className="lbl">from {p.basis.n} {p.basis.type || ""} pitches{p.basis.angle !== undefined ? `, arm angle ${p.basis.angle}°` : ""}</span></span>
                {a.edit ? (
                  <span className="btn-row inline">
                    <form action={decideProposal} aria-label={`Accept ${w.label}`}><input type="hidden" name="team" value={t} /><input type="hidden" name="pitcher" value={a.pitcher.id} />
                      <input type="hidden" name="proposal" value={p.id} /><input type="hidden" name="accept" value="yes" /><button type="submit" className="shell-btn">Accept</button></form>
                    <form action={decideProposal} aria-label={`Reject ${w.label}`}><input type="hidden" name="team" value={t} /><input type="hidden" name="pitcher" value={a.pitcher.id} />
                      <input type="hidden" name="proposal" value={p.id} /><input type="hidden" name="accept" value="no" /><button type="submit" className="shell-btn text">Reject</button></form>
                  </span>) : null}
              </li>);
          })}</ul>
        ) : <p className="shell-note">{ups.length ? "Nothing to change: the arsenal matches the uploads." : "Upload a session and its velocity, shape and arm slot are proposed here."} Nothing changes until it&apos;s accepted.</p>}
        {unmatched.length ? <p className="shell-note small">In the uploads but not in the arsenal: {unmatched.map((u) => `${u.type} (${u.n})`).join(", ")}. Add it on {a.asPlayer ? "Arsenal" : "the arsenal"} to get its values.</p> : null}
        {notes.length ? <ul className="plain-list small">{notes.map((n, i) => <li key={i} className="shell-note small">{n}</li>)}</ul> : null}
      </section>

      {sum.length ? (
        <section aria-labelledby="sum-h">
          <h2 id="sum-h" className="shell-h2">Summary, weighted</h2>
          <div className="tbl-scroll"><table className="data-tbl" aria-label="Summary by pitch type">
            <thead><tr><th>Pitch</th><th className="num">Pitches</th><th className="num">Velo</th><th className="num">Max</th><th className="num">Up (in)</th><th className="num">Arm side (in)</th><th className="num">Spin</th><th className="num">Left out</th></tr></thead>
            <tbody>{sum.map((s) => (
              <tr key={s.type}><td>{s.type}</td><td className="num mono">{s.n}</td><td className="num mono">{s.velo ?? "–"}</td><td className="num mono">{s.veloMax ?? "–"}</td>
                <td className="num mono">{s.ivb ?? "–"}</td><td className="num mono">{s.hb ?? "–"}</td><td className="num mono">{s.spin ?? "–"}</td><td className="num mono">{s.excluded + s.developing || ""}</td></tr>))}</tbody>
          </table></div>
          <p className="shell-note small">Games count 1.0, live BP 0.7, bullpens 0.4, and a session counts half as much every 60 days. Excluded pitches count nowhere; developing ones are kept apart.</p>
          {dev.length ? <p className="shell-note small"><b>In development:</b> {dev.map((s) => `${s.type} (${s.developing})`).join(", ")}. They never feed the engine until they&apos;re no longer marked developing.</p> : null}
        </section>
      ) : null}

      {a.edit ? (
        <section aria-labelledby="up-h">
          <h2 id="up-h" className="shell-h2">Upload a session</h2>
          <UploadForm team={t} pitcher={a.pitcher.id} hand={a.pitcher.hand === "L" ? "L" : "R"} pitcherName={a.pitcher.name || ""} templates={(tpl || []) as Template[]} today={today} />
        </section>
      ) : null}

      <section aria-labelledby="list-h">
        <h2 id="list-h" className="shell-h2">Uploads</h2>
        {ups.length ? (
          <div className="tbl-scroll"><table className="data-tbl" aria-label="Uploads">
            <thead><tr><th>Date</th><th>Session</th><th>Source</th><th className="num">Pitches</th><th>File</th></tr></thead>
            <tbody>{ups.map((u) => (
              <tr key={u.id}><td><Link href={`${a.base}/uploads/${u.id}`}>{day(u.session_date)}</Link></td><td>{SESSION_LABEL[u.session_type]}</td><td>{SRC[u.source]}</td>
                <td className="num mono">{u.n_pitches}</td><td className="small">{u.file_name}</td></tr>))}</tbody>
          </table></div>
        ) : <p className="shell-note">None yet.</p>}
      </section>
    </>
  );
}

export async function ReviewPanel({ a, upload, sp }: { a: UploadAccess; upload: string; sp: SP }) {
  const t = a.team.team_id;
  const [ups, ps] = await Promise.all([uploadsOf(t, a.pitcher.id), pitchesOf(t, a.pitcher.id, upload)]);
  const u = ups.find((x) => x.id === upload);
  if (!u) return <p className="shell-note">That upload isn&apos;t there any more. <Link href={`${a.base}/uploads`}>Back to uploads</Link></p>;
  const hidden = (<><input type="hidden" name="team" value={t} /><input type="hidden" name="pitcher" value={a.pitcher.id} /><input type="hidden" name="upload" value={u.id} /></>);
  const left = ps.filter((p) => p.excluded).length, dev = ps.filter((p) => p.developing && !p.excluded).length;
  return (
    <>
      <p><Link href={`${a.base}/uploads`}>Uploads</Link></p>
      <h2 className="shell-h2">{SESSION_LABEL[u.session_type]}, {day(u.session_date)} <span className="lbl">{SRC[u.source]} · {u.n_pitches} pitches{u.file_name ? ` · ${u.file_name}` : ""}</span></h2>
      <Notice sp={sp} />
      {u.warnings.length ? <ul className="plain-list warn" aria-label="Notes on this file">{u.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
      <p className="shell-note">{ps.length - left - dev} counted · {left} left out · {dev} developing. Leave out warmups, grips you were trying and mis-tags; mark a pitch you&apos;re still building as developing.</p>
      <form action={reviewUpload} aria-label="Review pitches" className="shell-form">
        {hidden}<input type="hidden" name="n" value={ps.length} />
        <div className="tbl-scroll"><table className="data-tbl review" aria-label="Pitches">
          <thead><tr><th className="num">#</th><th>Pitch</th><th className="num">Velo</th><th className="num">Up</th><th className="num">Arm side</th><th className="num">Spin</th>
            {u.session_type === "game" ? <><th>Count</th><th>Result</th></> : null}<th>Leave out</th><th>Why</th><th>Developing</th></tr></thead>
          <tbody>{ps.map((p) => (
            <tr key={p.idx} className={p.excluded ? "out" : p.developing ? "dev" : undefined}>
              <td className="num mono">{p.idx + 1}<input type="hidden" name={`seen_${p.idx}`} value="1" /></td><td>{p.pitch_type}</td>
              <td className="num mono">{p.velo_mph ?? "–"}</td><td className="num mono">{p.ivb_in ?? "–"}</td><td className="num mono">{p.hb_in ?? "–"}</td><td className="num mono">{p.spin_rpm ?? "–"}</td>
              {u.session_type === "game" ? <><td className="mono">{p.balls !== null ? `${p.balls}-${p.strikes}` : ""}</td><td>{p.res || ""}{p.contact ? `, ${p.contact}` : ""}</td></> : null}
              <td><input type="checkbox" name={`ex_${p.idx}`} defaultChecked={p.excluded} disabled={!a.edit} aria-label={`Leave out pitch ${p.idx + 1}`} /></td>
              <td><select name={`reason_${p.idx}`} defaultValue={p.reason || ""} disabled={!a.edit} aria-label={`Why pitch ${p.idx + 1} is left out`}>
                <option value="">–</option>{Object.entries(REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td><input type="checkbox" name={`dev_${p.idx}`} defaultChecked={p.developing} disabled={!a.edit} aria-label={`Pitch ${p.idx + 1} developing`} /></td>
            </tr>))}</tbody>
        </table></div>
        {a.edit ? <button type="submit" className="shell-btn primary">Save</button> : null}
      </form>
      {a.edit ? (
        <details className="danger"><summary className="shell-btn text">Delete this upload</summary>
          <form action={deleteUpload} aria-label="Delete upload" className="shell-form tight">{hidden}
            <label className="check"><input type="checkbox" name="confirm" /> Delete these {u.n_pitches} pitches for good</label>
            <button type="submit" className="shell-btn">Delete</button>
          </form>
        </details>) : null}
    </>
  );
}
