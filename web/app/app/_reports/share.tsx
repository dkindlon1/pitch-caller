import { createShare, revokeShare, saveSections } from "./share_actions";
import type { Sections } from "./recap";

// The pitcher's sharing panel: make a public link, choose its sections (summary on by default; heat maps, pitch by
// pitch and the outing list off until he turns them on), turn it off. Coach notes, style and overrides are never on it.
export type ShareRow = { token: string; sections: Sections; approved_at: string | null };
export function SharePanel({ team, pitcher, season, share, live, minor, site }: { team: string; pitcher: string; season: string; share: ShareRow | null; live: boolean; minor: boolean; site: string }) {
  const path = `/app/me/${team}/${pitcher}/recap${season ? `/${season}` : ""}`;
  if (!share) return (
    <section className="rp-sec rp-card rp-share" aria-labelledby="h-share">
      <header><h2 id="h-share">Share this recap</h2></header>
      <p className="rp-note">Make a link anyone can open, without signing in, for recruiters or family. You choose what it shows, and you can turn it off at any time. Coach notes, style and the calls behind each pitch are never on it.{minor ? " Because you're under 18, it stays off until your parent approves it; we'll email them." : ""}</p>
      <form action={createShare}><input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={pitcher} /><input type="hidden" name="season" value={season} />
        <button className="shell-btn" type="submit">Make a public link</button></form>
    </section>
  );
  const url = `${site}/r/${share.token}`, s = share.sections;
  const box = (name: keyof Sections, label: string, hint: string) => (
    <label className="rp-check" style={{ alignItems: "flex-start" }}><input type="checkbox" name={name} defaultChecked={s[name]} style={{ marginTop: 2 }} /><span><b style={{ fontWeight: 600, color: "var(--text)" }}>{label}</b><br /><span className="rp-note">{hint}</span></span></label>);
  return (
    <section className="rp-sec rp-card rp-share" aria-labelledby="h-share">
      <header><h2 id="h-share">Public link</h2><span className={`rp-pill${live ? " shared" : ""}`} role="status">{live ? "Live" : minor ? "Waiting for your parent" : "Off"}</span></header>
      {live ? <p className="rp-note">Anyone with this link can see the sections below. Nothing else.</p>
        : minor ? <p className="rp-note">Your parent needs to approve this link before anyone can open it. We emailed them; they can approve it after signing in with that email.</p> : null}
      <p className="url" data-k="share.url">{url}</p>
      <form action={saveSections} style={{ display: "grid", gap: 6 }}>
        <input type="hidden" name="token" value={share.token} /><input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={pitcher} /><input type="hidden" name="season" value={season} />
        {box("summary", "Summary stats", "The season line, the level comparison, pitch mix and results, and trends")}
        {box("heat", "Heat maps", "Where pitches were called and where they landed")}
        {box("outings", "Outing list", "Each outing's date and line (no opponents)")}
        {box("pitches", "Pitch by pitch", "Every pitch's count, type, spot and result")}
        <div><button className="shell-btn small" type="submit">Save what it shows</button></div>
      </form>
      <form action={revokeShare}><input type="hidden" name="token" value={share.token} /><input type="hidden" name="path" value={path} />
        <button className="shell-btn text small" type="submit">Turn the link off for good</button>
        <span className="rp-note"> A new link gets a new address; the old one stops working.</span></form>
      {live ? <p className="rp-note"><a href={`/r/${share.token}/pdf`} download>Download the PDF</a> of what the link shows, or <a href={`/r/${share.token}`}>open the page</a>.</p> : null}
    </section>
  );
}
