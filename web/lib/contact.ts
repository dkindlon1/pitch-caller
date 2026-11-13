// The site's "Talk to us" form: what it accepts and the email it becomes. Kept apart from the route so it can be
// tested without a server.
export const ROLES = ["Head coach", "Pitching coach", "Program director or AD", "Player or parent", "Something else"] as const;
export const LEVELS = ["High school", "Travel ball", "College", "Other"] as const;

export type Contact = { name: string; email: string; role: string; level: string; org: string; message: string };
export type Checked = { ok: true; value: Contact } | { ok: false; errors: Partial<Record<keyof Contact, string>> };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function checkContact(body: Record<string, unknown>): Checked {
  const value: Contact = {
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    role: clean(body.role, 60),
    level: clean(body.level, 40),
    org: clean(body.org, 160),
    message: typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "",
  };
  const errors: Partial<Record<keyof Contact, string>> = {};
  if (!value.name) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) errors.email = "Enter an email we can reply to.";
  if (!(ROLES as readonly string[]).includes(value.role)) errors.role = "Choose the one closest to you.";
  if (!(LEVELS as readonly string[]).includes(value.level)) errors.level = "Choose a level.";
  if (value.message.length < 10) errors.message = "Tell us a little about your team (a sentence is fine).";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function contactMail(c: Contact, to: string) {
  const rows: [string, string][] = [["Name", c.name], ["Email", c.email], ["Role", c.role], ["Level", c.level], ["Team or school", c.org || "Not given"]];
  return {
    to,
    subject: `PitchIQ: ${c.name}, ${c.role.toLowerCase()} (${c.level})`,
    text: [...rows.map(([k, v]) => `${k}: ${v}`), "", c.message].join("\n"),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${k}</td><td>${esc(v)}</td></tr>`).join("")}</table>
<p style="white-space:pre-wrap">${esc(c.message)}</p></div>`,
  };
}

// a small per-address limit so the form can't be used to flood the inbox: 5 messages an hour
const seen = new Map<string, number[]>();
export function allow(key: string, now = Date.now()): boolean {
  const hour = 3_600_000, list = (seen.get(key) || []).filter((t) => now - t < hour);
  if (list.length >= 5) { seen.set(key, list); return false; }
  list.push(now);
  seen.set(key, list);
  return true;
}
