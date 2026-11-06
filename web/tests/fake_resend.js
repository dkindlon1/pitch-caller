/*
 * A stand-in for Resend's send API (POST /emails), for the end-to-end tests: it checks the request the way Resend
 * would (a bearer key, a from, one or more to, a subject and a body), keeps each email, and answers with an id.
 * GET /emails lists what it got.
 */
const http = require("http"), crypto = require("crypto");

function start({ port }) {
  const inbox = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const json = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.method === "GET" && req.url === "/emails") return json(200, inbox);
      if (req.method !== "POST" || req.url !== "/emails") return json(404, { message: "not found" });
      if (!/^Bearer re_/.test(req.headers.authorization || "")) return json(401, { message: "missing API key" });
      let m;
      try { m = JSON.parse(body); } catch { return json(422, { message: "bad JSON" }); }
      if (!m.from || !Array.isArray(m.to) || !m.to.length || !m.subject || !(m.html || m.text)) return json(422, { message: "missing fields" });
      const id = crypto.randomUUID();
      inbox.push({ id, ...m, at: Date.now() });
      json(200, { id });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ inbox, close: () => new Promise((r) => server.close(r)) })));
}
module.exports = { start };
