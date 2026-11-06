/*
 * A small stand-in for Stripe, for billing_e2e.js: the handful of API calls the website makes (Checkout, the billing
 * portal, reading and updating a subscription), a Checkout page to pay on, and webhooks signed with the real library's
 * test signer (stripe.webhooks.generateTestHeaderString) so the website verifies them exactly as it would Stripe's.
 * Object shapes follow API version 2026-09-30.endive (the period end on the subscription item, an invoice's
 * subscription under parent.subscription_details). The real Stripe check (card 4242, test clocks) needs Drew's test
 * keys: docs/plans/2026-11-05-pitchiq-billing.md.
 */
const http = require("http"), crypto = require("crypto");
const Stripe = require("stripe");

function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((p, i) => {
      const last = i === path.length - 1, nextIsIndex = !last && /^\d+$/.test(path[i + 1]);
      if (last) o[p] = v;
      else o = o[p] = o[p] || (nextIsIndex ? [] : {});
    });
  }
  return out;
}
const rid = (p) => `${p}_${crypto.randomBytes(8).toString("hex")}`;
const nowS = () => Math.floor(Date.now() / 1000);
const YEAR = 365 * 86400;

function start({ port, webhookUrl, secret }) {
  const signer = new Stripe("sk_test_signer").webhooks;
  const S = { sessions: {}, customers: {}, subs: {}, calls: [], deliveries: [], events: {}, decline: new Set() };

  async function send(type, object, created = nowS()) {
    const event = { id: rid("evt"), object: "event", api_version: "2026-09-30.endive", created, type, livemode: false, data: { object } };
    S.events[event.id] = event;
    return deliver(event);
  }
  async function deliver(event, { badSig = false } = {}) {
    const payload = JSON.stringify(event);
    const header = signer.generateTestHeaderString({ payload, secret: badSig ? "whsec_wrong" : secret });
    const res = await fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
    const json = await res.json().catch(() => null);
    const d = { id: event.id, type: event.type, status: res.status, result: json && (json.result || json.error) };
    S.deliveries.push(d);
    return d;
  }
  const invoice = (sub, reason) => ({ id: rid("in"), object: "invoice", customer: sub.customer, billing_reason: reason, status: "paid",
    parent: { type: "subscription_details", subscription_details: { subscription: sub.id, metadata: { ...sub.metadata } } } });
  const subObj = (sub) => JSON.parse(JSON.stringify({ ...sub, object: "subscription", items: { object: "list", data: sub.items } }));

  async function pay(sessionId, card) {
    const cs = S.sessions[sessionId];
    if (card !== "4242") return { declined: true };
    const customer = cs.customer || rid("cus");
    S.customers[customer] = { id: customer, email: cs.customer_email };
    const sub = { id: rid("sub"), customer, status: "active", metadata: { ...(cs.subscription_data && cs.subscription_data.metadata) },
      items: [{ id: rid("si"), object: "subscription_item", quantity: +cs.line_items[0].quantity, price: { id: cs.line_items[0].price }, current_period_end: nowS() + YEAR }],
      discounts: cs.discounts || [] };
    S.subs[sub.id] = sub;
    Object.assign(cs, { status: "complete", payment_status: "paid", customer, subscription: sub.id });
    await send("customer.subscription.created", subObj(sub));
    await send("checkout.session.completed", { ...cs, object: "checkout.session", url: null });
    await send("invoice.paid", invoice(sub, "subscription_create"));
    return { ok: true, url: cs.success_url };
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);
    let body = ""; for await (const c of req) body += c;
    const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    const html = (code, h) => { res.writeHead(code, { "content-type": "text/html" }); res.end(`<!doctype html><meta charset=utf-8><title>Fake Stripe</title><body>${h}`); };
    const p = u.pathname, form = parseForm(body);
    if (p.startsWith("/v1/")) S.calls.push({ method: req.method, path: p, body: form, auth: req.headers.authorization, version: req.headers["stripe-version"] });
    try {
      // ------------------------------------------------ the API the website calls
      if (req.method === "POST" && p === "/v1/checkout/sessions") {
        const id = rid("cs_test");
        S.sessions[id] = { id, ...form, status: "open" };
        return json(200, { id, object: "checkout.session", url: `http://localhost:${port}/pay/${id}`, ...form });
      }
      if (req.method === "POST" && p === "/v1/billing_portal/sessions") {
        if (!S.customers[form.customer]) return json(404, { error: { type: "invalid_request_error", message: "No such customer" } });
        return json(200, { id: rid("bps"), object: "billing_portal.session", url: `http://localhost:${port}/portal/${form.customer}?return=${encodeURIComponent(form.return_url)}` });
      }
      let m = p.match(/^\/v1\/subscriptions\/(sub_\w+)$/);
      if (m) {
        const sub = S.subs[m[1]];
        if (!sub) return json(404, { error: { type: "invalid_request_error", message: "No such subscription" } });
        if (req.method === "GET") return json(200, subObj(sub));
        const q = +form.items[0].quantity, item = sub.items.find((x) => x.id === form.items[0].id);
        if (!item) return json(400, { error: { type: "invalid_request_error", message: "No such item" } });
        if (form.proration_behavior === "always_invoice" && S.decline.has(sub.customer)) {
          // pending_if_incomplete: the change waits for a payment that failed; the subscription stays as it was
          await send("invoice.payment_failed", { ...invoice(sub, "subscription_update"), status: "open" });
          return json(200, { ...subObj(sub), pending_update: { subscription_items: [{ id: item.id, quantity: q }] } });
        }
        item.quantity = q;
        await send("customer.subscription.updated", subObj(sub));
        if (form.proration_behavior === "always_invoice") await send("invoice.paid", invoice(sub, "subscription_update"));
        return json(200, subObj(sub));
      }
      // ------------------------------------------------ the pages a person sees
      m = p.match(/^\/pay\/(cs_test_\w+)$/);
      if (m && S.sessions[m[1]]) {
        if (req.method === "GET") return html(200, `<h1>Pay PitchIQ</h1><form method=post action="/pay/${m[1]}?card=4242"><button>Pay with 4242</button></form>
          <form method=post action="/pay/${m[1]}?card=0341"><button>Pay with a card that declines</button></form>`);
        const r = await pay(m[1], u.searchParams.get("card"));
        if (r.declined) return html(402, "<p role=alert>Your card was declined.</p>");
        res.writeHead(303, { location: r.url }); return res.end();
      }
      m = p.match(/^\/portal\/(cus_\w+)$/);
      if (m) return html(200, `<h1>Billing portal for ${m[1]}</h1><a href="${u.searchParams.get("return")}">Return to PitchIQ</a>`);
      // ------------------------------------------------ what a test clock would do
      if (p === "/test/card") { const c = u.searchParams.get("customer"); u.searchParams.get("decline") === "1" ? S.decline.add(c) : S.decline.delete(c); return json(200, { ok: true }); }
      if (p === "/test/renew") {
        const sub = S.subs[u.searchParams.get("sub")];
        if (u.searchParams.get("fail") === "1") {
          sub.status = "past_due";
          const d = await send("invoice.payment_failed", { ...invoice(sub, "subscription_cycle"), status: "open" });
          await send("customer.subscription.updated", subObj(sub));
          return json(200, d);
        }
        sub.status = "active"; sub.items[0].current_period_end = Math.max(sub.items[0].current_period_end, nowS()) + YEAR;
        await send("customer.subscription.updated", subObj(sub));
        return json(200, await send("invoice.paid", invoice(sub, "subscription_cycle")));
      }
      if (p === "/test/cancel") {
        const sub = S.subs[u.searchParams.get("sub")]; sub.status = "canceled";
        return json(200, await send("customer.subscription.deleted", subObj(sub)));
      }
      if (p === "/test/replay") return json(200, await deliver(S.events[u.searchParams.get("event")], { badSig: u.searchParams.get("bad") === "1" }));
      if (p === "/test/send") { const e = JSON.parse(body); return json(200, await send(e.type, e.object, e.created)); }
      return json(404, { error: { type: "invalid_request_error", message: `fake Stripe has no ${req.method} ${p}` } });
    } catch (e) {
      return json(500, { error: { type: "api_error", message: String(e && e.stack || e) } });
    }
  });
  return new Promise((resolve) => server.listen(port, "localhost", () => resolve({ S, server, close: () => new Promise((r) => server.close(r)) })));
}

module.exports = { start, parseForm };
