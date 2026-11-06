import "server-only";

// Email through Resend (spec: "Constraints and stack"). Without RESEND_API_KEY nothing is sent and the caller records
// "no_provider", so a lapse still builds the exports and each person can download theirs from the site. Tests point a
// test key ("re_test_...") at a local fake (RESEND_FAKE_API) that keeps what it gets.
export type Mail = { to: string; subject: string; text: string; html: string };
export type Sent = { status: "sent" | "failed" | "no_provider"; id?: string; error?: string };

export async function sendMail(m: Mail): Promise<Sent> {
  // without a verified domain of its own, Resend only sends from its test address (and only to the account owner)
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM || "PitchIQ <onboarding@resend.dev>";
  if (!key) return { status: "no_provider" };
  const base = key.startsWith("re_test_") && process.env.RESEND_FAKE_API ? process.env.RESEND_FAKE_API.replace(/\/$/, "") : "https://api.resend.com";
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) return { status: "failed", error: `${res.status} ${json?.message || ""}`.trim() };
    return { status: "sent", id: json?.id };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// the lapse email: what happened, the download link (30 days), and how to get everything back
export function lapseMail(o: { to: string; kind: "player" | "coach"; team: string; org: string; pitcher?: string; link: string; expires: string; site: string }): Mail {
  const what = o.kind === "player" ? `${o.pitcher ? o.pitcher + "'s" : "Your"} pitching data from ${o.team}` : `${o.team}'s team data`;
  const subject = `Your PitchIQ data: ${o.kind === "player" ? o.team : o.team + " (team)"}`;
  const lines = [
    `${o.org}'s PitchIQ subscription has lapsed, so ${o.team} is locked for now.`,
    "",
    `Here is ${what}: CSV files${o.kind === "player" ? " and a one-page summary" : ""}, in one zip.`,
    `Download it: ${o.link}`,
    `The link works until ${o.expires}. After that, sign in at ${o.site}/app/exports for a new one.`,
    "",
    "Nothing is deleted: the team's data is kept for 12 months, and paying again brings it all back.",
    "",
    "PitchIQ",
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14181d;max-width:560px">
<p>${esc(o.org)}'s PitchIQ subscription has lapsed, so ${esc(o.team)} is locked for now.</p>
<p>Here is ${esc(what)}: CSV files${o.kind === "player" ? " and a one-page summary" : ""}, in one zip.</p>
<p><a href="${esc(o.link)}" style="display:inline-block;background:#14181d;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Download your data</a></p>
<p style="color:#4a5561;font-size:13px">The link works until ${esc(o.expires)}. After that, sign in at <a href="${esc(o.site)}/app/exports">${esc(o.site.replace(/^https?:\/\//, ""))}/app/exports</a> for a new one.</p>
<p>Nothing is deleted: the team's data is kept for 12 months, and paying again brings it all back.</p>
<p>PitchIQ</p></div>`;
  return { to: o.to, subject, text: lines.join("\n"), html };
}

const ROLE_WORD: Record<string, string> = { head: "head coach", pitching: "pitching coach", caller: "pitch caller", viewer: "viewer", player: "player" };

// an invite to join a team: as staff, as a player, or (for a player under 13) to the parent who joins for him
export function inviteMail(o: { to: string; team: string; role: string; pitcher?: string | null; forParent?: boolean; link: string; by?: string | null }): Mail {
  const who = o.forParent ? `${o.pitcher || "your child"} to ${o.team}` : o.role === "player" ? `${o.team} as ${o.pitcher || "a player"}` : `${o.team} as ${ROLE_WORD[o.role] ? (/^[aeiou]/.test(ROLE_WORD[o.role]) ? "an " : "a ") + ROLE_WORD[o.role] : "a coach"}`;
  const subject = o.forParent ? `Your child's invite to ${o.team} on PitchIQ` : `You're invited to ${o.team} on PitchIQ`;
  const intro = o.forParent
    ? `${o.by ? o.by + " invited" : "You're invited to add"} ${o.pitcher || "your child"} to ${o.team} on PitchIQ, the pitch-calling app the team uses. Players under 13 join through a parent or guardian: you make the account and agree first, and you can see or delete his data at any time.`
    : `${o.by ? o.by + " invited you" : "You're invited"} to join ${who} on PitchIQ.`;
  const lines = [intro, "", `Join here: ${o.link}`, "The link works once, for 14 days.", "", "PitchIQ"];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14181d;max-width:560px">
<p>${esc(intro)}</p>
<p><a href="${esc(o.link)}" style="display:inline-block;background:#14181d;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">${o.forParent ? "Join for your child" : "Join " + esc(o.team)}</a></p>
<p style="color:#4a5561;font-size:13px">The link works once, for 14 days. If you weren't expecting this, you can ignore it.</p>
<p>PitchIQ</p></div>`;
  return { to: o.to, subject, text: lines.join("\n"), html };
}
