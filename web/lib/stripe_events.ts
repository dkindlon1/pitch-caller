// Turns a verified Stripe event into the small action the database applies (public.pc_billing_event). No secrets and
// no network here, so it's unit-tested on its own (stripe_events.test.ts). Field paths are for API version
// 2026-09-30.endive (stripe@23): the period end lives on the subscription item, and an invoice names its subscription
// under parent.subscription_details.
import type Stripe from "stripe";

export type BillingAction = {
  org?: string; customer?: string; subscription?: string;
  status?: "active" | "locked"; sub_status?: string; quantity?: number; period_end?: number; adopt?: boolean;
};

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id) || undefined;
const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

function compact(a: BillingAction): BillingAction {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== "")) as BillingAction;
}

function fromInvoice(i: Stripe.Invoice) {
  const d = i.parent?.subscription_details;
  return { org: d?.metadata?.org_id, subscription: idOf(d?.subscription), customer: idOf(i.customer) };
}

export function normalize(e: Stripe.Event): BillingAction | null {
  switch (e.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = e.data.object;
      if (s.mode !== "subscription") return null;
      const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
      const q = Number(s.metadata?.quantity);
      // a bank payment still on its way: link the ids now, switch on when it lands
      return compact({ org: s.client_reference_id || s.metadata?.org_id, customer: idOf(s.customer), subscription: idOf(s.subscription), adopt: true,
        ...(paid ? { status: "active" as const, ...(Number.isInteger(q) && q > 0 ? { quantity: q } : {}) } : {}) });
    }
    case "invoice.paid": {
      const i = e.data.object;
      if (!i.parent?.subscription_details) return null;
      return compact({ ...fromInvoice(i), status: "active" });
    }
    case "invoice.payment_failed": {
      const i = e.data.object;
      if (!i.parent?.subscription_details) return null;
      // adding a team is charged with payment_behavior=pending_if_incomplete: a declined card leaves that team waiting
      // and the rest of the organization as it was. Any other failed charge (the yearly renewal) locks (spec: lock on
      // the first failed payment).
      if (i.billing_reason === "subscription_update") return null;
      return compact({ ...fromInvoice(i), status: "locked" });
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const s = e.data.object;
      const item = s.items?.data?.[0];
      const gone = e.type === "customer.subscription.deleted" || ENDED.has(s.status);
      return compact({
        org: s.metadata?.org_id, subscription: s.id, customer: idOf(s.customer),
        sub_status: e.type === "customer.subscription.deleted" ? "canceled" : s.status,
        quantity: typeof item?.quantity === "number" ? item.quantity : undefined,
        period_end: typeof item?.current_period_end === "number" ? item.current_period_end : undefined,
        adopt: e.type === "customer.subscription.created" ? true : undefined,
        status: gone ? "locked" : undefined,
      });
    }
    default:
      return null;
  }
}
