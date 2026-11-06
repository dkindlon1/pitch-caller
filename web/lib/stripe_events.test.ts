import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./stripe_events.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const evt = (type: string, object: any) => ({ id: "evt_1", type, created: 1, data: { object } }) as any;
const ORG = "6f1c2a7e-1b2c-4d5e-8f90-1a2b3c4d5e6f";
const invoice = (over = {}) => ({ object: "invoice", customer: "cus_1", billing_reason: "subscription_cycle",
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: { org_id: ORG } } }, ...over });
const sub = (over = {}) => ({ object: "subscription", id: "sub_1", customer: { id: "cus_1" }, status: "active", metadata: { org_id: ORG },
  items: { data: [{ quantity: 3, current_period_end: 1825000000 }] }, ...over });

test("a paid Checkout switches the organization on for the teams it paid for", () => {
  const a = normalize(evt("checkout.session.completed", { mode: "subscription", payment_status: "paid", client_reference_id: ORG,
    customer: "cus_1", subscription: { id: "sub_1" }, metadata: { org_id: ORG, quantity: "2" } }));
  assert.deepEqual(a, { org: ORG, customer: "cus_1", subscription: "sub_1", adopt: true, status: "active", quantity: 2 });
});

test("a Checkout still waiting on a bank payment only links the ids", () => {
  const a = normalize(evt("checkout.session.completed", { mode: "subscription", payment_status: "unpaid", client_reference_id: ORG,
    customer: "cus_1", subscription: "sub_1", metadata: { quantity: "2" } }));
  assert.deepEqual(a, { org: ORG, customer: "cus_1", subscription: "sub_1", adopt: true });
});

test("a one-off payment Checkout is not ours", () => {
  assert.equal(normalize(evt("checkout.session.completed", { mode: "payment", payment_status: "paid" })), null);
});

test("invoices: paid unlocks, a failed renewal locks, a declined added team doesn't", () => {
  assert.deepEqual(normalize(evt("invoice.paid", invoice())), { org: ORG, subscription: "sub_1", customer: "cus_1", status: "active" });
  assert.deepEqual(normalize(evt("invoice.payment_failed", invoice())), { org: ORG, subscription: "sub_1", customer: "cus_1", status: "locked" });
  assert.equal(normalize(evt("invoice.payment_failed", invoice({ billing_reason: "subscription_create" })))!.status, "locked");
  assert.equal(normalize(evt("invoice.payment_failed", invoice({ billing_reason: "subscription_update" }))), null);
  assert.equal(normalize(evt("invoice.paid", invoice({ parent: null }))), null);
});

test("subscription events carry the quantity and the paid year's end from the item", () => {
  assert.deepEqual(normalize(evt("customer.subscription.updated", sub())),
    { org: ORG, subscription: "sub_1", customer: "cus_1", sub_status: "active", quantity: 3, period_end: 1825000000 });
  assert.deepEqual(normalize(evt("customer.subscription.created", sub({ status: "incomplete" }))),
    { org: ORG, subscription: "sub_1", customer: "cus_1", sub_status: "incomplete", quantity: 3, period_end: 1825000000, adopt: true });
});

test("past due waits for the failed invoice; unpaid, cancelled or deleted locks", () => {
  assert.equal(normalize(evt("customer.subscription.updated", sub({ status: "past_due" })))!.status, undefined);
  assert.equal(normalize(evt("customer.subscription.updated", sub({ status: "unpaid" })))!.status, "locked");
  const d = normalize(evt("customer.subscription.deleted", sub({ status: "canceled" })))!;
  assert.equal(d.status, "locked"); assert.equal(d.sub_status, "canceled");
});

test("anything else is ignored", () => {
  assert.equal(normalize(evt("charge.succeeded", {})), null);
  assert.equal(normalize(evt("customer.created", {})), null);
});
