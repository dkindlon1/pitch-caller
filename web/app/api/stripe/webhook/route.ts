import type Stripe from "stripe";
import { applyEvent, stripe } from "@/lib/billing";
import { normalize } from "@/lib/stripe_events";

// Stripe's webhook (spec: "Billing and lockout", A5). The signature is checked on the raw body; each event is applied
// once, in one transaction with its effect (pc_billing_event). A database failure answers 500 so Stripe sends it again.
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const s = stripe(), secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return reply({ error: "not_configured" }, 503);
  const sig = request.headers.get("stripe-signature");
  const body = await request.text();
  let event: Stripe.Event;
  try {
    if (!sig) throw new Error("no signature");
    event = s.webhooks.constructEvent(body, sig, secret);
  } catch {
    return reply({ error: "bad_signature" }, 400);
  }
  const action = normalize(event);
  if (!action) return reply({ result: "ignored" });
  try {
    return reply({ result: await applyEvent(event, action) });
  } catch (e) {
    console.error("stripe webhook", event.id, event.type, (e as Error).message);
    return reply({ error: "not_applied" }, 500);
  }
}
