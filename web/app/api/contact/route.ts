import { NextResponse, type NextRequest } from "next/server";
import { allow, checkContact, contactMail } from "@/lib/contact";
import { sendMail } from "@/lib/email";

// The "Talk to us" form. Sends one email to CONTACT_TO through Resend (lib/email.ts). Until RESEND_API_KEY and
// CONTACT_TO are set, it answers 503 and the form says the site can't send messages yet, so nothing is silently lost.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "That didn't send. Try again." }, { status: 400 }); }
  // a field people never see: anything filled in here is a bot, and it gets a normal-looking answer
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const checked = checkContact(body);
  if (!checked.ok) return NextResponse.json({ errors: checked.errors }, { status: 422 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!allow(ip)) return NextResponse.json({ error: "That's a lot of messages from here. Try again in an hour." }, { status: 429 });

  const to = process.env.CONTACT_TO;
  if (!to || !process.env.RESEND_API_KEY) return NextResponse.json({ error: "This site can't send messages yet." }, { status: 503 });
  const sent = await sendMail(contactMail(checked.value, to));
  if (sent.status !== "sent") return NextResponse.json({ error: "That didn't send. Try again in a minute." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
