import "server-only";
import Stripe from "stripe";
import { serviceRpc } from "./supabase/admin";
import type { BillingAction } from "./stripe_events";

// Stripe for PitchIQ (Plan 2). One product, a yearly price per team (STRIPE_PRICE_ID), one subscription per
// organization whose quantity is its paid team count, and a first-year coupon (STRIPE_COUPON_ID, duration "once").
// The API version is pinned (A5). Every state change comes back through the webhook; the calls here only ask Stripe.
export const API_VERSION = "2026-09-30.endive" as const;

export type BillingIds = { customer: string | null; subscription: string | null; sub_status: string | null; quantity: number | null;
  seats: number; active: number; owner_email: string | null };

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // tests point a test key at a local fake Stripe (web/tests/fake_stripe.js); a live key never goes anywhere but Stripe
  const fake = key.startsWith("sk_test_") && process.env.STRIPE_FAKE_API ? new URL(process.env.STRIPE_FAKE_API) : null;
  return new Stripe(key, {
    apiVersion: API_VERSION, maxNetworkRetries: 2, appInfo: { name: "PitchIQ" },
    ...(fake ? { host: fake.hostname, port: fake.port, protocol: fake.protocol.replace(":", "") as "http" | "https" } : {}),
  });
}

export const billingConfigured = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);

export const applyEvent = (e: Pick<Stripe.Event, "id" | "type" | "created">, a: BillingAction) =>
  serviceRpc<string>("pc_billing_event", { event_id: e.id, event_type: e.type, event_created: new Date(e.created * 1000).toISOString(), a });

export const billingIds = (org: string) => serviceRpc<BillingIds>("pc_billing_ids", { org });

// Checkout for the organization's teams (active and waiting). The coupon is for the first year only: an organization
// that already had a subscription pays full price when it comes back.
export async function checkoutUrl(org: string, origin: string): Promise<string> {
  const s = stripe(), price = process.env.STRIPE_PRICE_ID;
  if (!s || !price) throw new Error("not_configured");
  const ids = await billingIds(org);
  if (!ids.seats) throw new Error("no_teams");
  const coupon = process.env.STRIPE_COUPON_ID;
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: ids.seats }],
    client_reference_id: org,
    metadata: { org_id: org, quantity: String(ids.seats) },
    subscription_data: { metadata: { org_id: org } },
    ...(ids.customer ? { customer: ids.customer } : ids.owner_email ? { customer_email: ids.owner_email } : {}),
    ...(coupon && !ids.subscription ? { discounts: [{ coupon }] } : {}),
    success_url: `${origin}/app/billing?org=${org}&checkout=done`,
    cancel_url: `${origin}/app/billing?org=${org}&checkout=cancelled`,
  });
  if (!session.url) throw new Error("no_url");
  return session.url;
}

// Stripe's billing portal: the card, invoices and cancelling. Its configuration (STRIPE_PORTAL_CONFIG, set up in the
// Stripe dashboard) must not let customers change the quantity (A5): teams are added and removed here.
export async function portalUrl(org: string, origin: string): Promise<string> {
  const s = stripe();
  if (!s) throw new Error("not_configured");
  const ids = await billingIds(org);
  if (!ids.customer) throw new Error("no_customer");
  const cfg = process.env.STRIPE_PORTAL_CONFIG;
  const p = await s.billingPortal.sessions.create({ customer: ids.customer, return_url: `${origin}/app/billing?org=${org}`, ...(cfg ? { configuration: cfg } : {}) });
  return p.url;
}

// Set the subscription's team count. "now": a new team, charged now for the rest of the year, and the change only goes
// through if the card pays (pending_if_incomplete). "next_year": a team removed (no refund: it stays until the year
// ends) or kept again (already paid this year); only the next renewal changes.
export async function setQuantity(org: string, quantity: number, charge: "now" | "next_year"): Promise<void> {
  const s = stripe();
  if (!s) throw new Error("not_configured");
  const ids = await billingIds(org);
  if (!ids.subscription) throw new Error("no_subscription");
  const sub = await s.subscriptions.retrieve(ids.subscription);
  const item = sub.items.data[0];
  if (!item) throw new Error("no_item");
  if (item.quantity === quantity) return;
  await s.subscriptions.update(ids.subscription, {
    items: [{ id: item.id, quantity }],
    proration_behavior: charge === "now" ? "always_invoice" : "none",
    ...(charge === "now" ? { payment_behavior: "pending_if_incomplete" as const } : {}),
  });
}
