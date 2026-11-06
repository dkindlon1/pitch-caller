import { after } from "next/server";
import type Stripe from "stripe";
import { applyEvent, stripe } from "@/lib/billing";
import { runLapse } from "@/lib/exports";
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
    const result = await applyEvent(event, action);
    // a lapse: build and email everyone's exports once Stripe has its answer (spec: "Billing and lockout"). Running it
    // again for the same lapse only fills gaps, so a failure here is retried from the admin page.
    if (result === "applied" && action.status === "locked") {
      const site = process.env.SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
      after(async () => {
        try { console.log("lapse exports", event.id, JSON.stringify(await runLapse(action, site))); }
        catch (e) { console.error("lapse exports failed", event.id, (e as Error).message); }
      });
    }
    return reply({ result });
  } catch (e) {
    console.error("stripe webhook", event.id, event.type, (e as Error).message);
    return reply({ error: "not_applied" }, 500);
  }
}
export const maxDuration = 300;   // the lapse exports run after the reply (after())
