/*
 * Pitch Caller sync: the iPad's database (app/db.js) is the outbox, Supabase is the copy every device shares.
 *
 *   push  every record changed on this device since its last push goes up; the server keeps whichever version is
 *         newer (updatedAt), the same rule as Restore, and reports any record this account may not write
 *   pull  every record changed on the server since this device's cursor comes down and is merged the same way
 *
 * Nothing waits on the network during a game: pitches are written to the device first, and a push that fails (no
 * signal) leaves them pending until the next sync. Sync state (last push time, pull cursors, the session) lives in the
 * device's meta store, which is never synced.
 *
 * Works in the browser (window.PCSync) and in Node (module.exports) for tests. A transport carries the calls:
 *   restTransport  Supabase's REST API (the pc_push / pc_pull functions in supabase/migrations)
 *   any object with push(table, rows) and pull(table, cursor) works the same (tests use one that talks to Postgres)
 */
(function (root) {
  "use strict";
  const VERSION = "1.1.0";
  // the device stores that sync, in the order they go up (parents before what points at them); meta stays on the device
  const TABLES = ["teams", "pitchers", "catchers", "hitters", "checkins", "sessions", "readings", "games", "packs", "events", "learned"];
  const BATCH = 400;

  function createSync(opts) {
    const db = opts.db, transport = opts.transport, programId = opts.programId;
    if (!db || !transport || !programId) throw new Error("sync needs a database, a transport and a program");
    const now = opts.now || (() => Date.now());
    const key = "sync:" + programId;

    async function state() {
      const s = await db.get("meta", key);
      return s || { id: key, programId, lastPush: {}, cursor: {}, rejected: [], log: [] };
    }
    async function saveState(s) { s.log = (s.log || []).slice(-30); return db.put("meta", s); }

    // A record that came down from the server carries _pulled (the updatedAt it arrived with). Until it's changed here
    // its updatedAt still equals _pulled, so it isn't sent back up: the server already has it, and an account that
    // can only read it (a charter and the pitcher records) would otherwise see it refused on every sync.
    const changedHere = (x, since) => (x.updatedAt || 0) > since && x._pulled !== x.updatedAt;
    const forServer = (x) => { if (!("_pulled" in x)) return x; const y = Object.assign({}, x); delete y._pulled; return y; };

    // what's waiting to go up, per table
    async function pending() {
      const s = await state(), out = {};
      const changed = await db.changedSince(0);
      for (const t of TABLES) { const since = s.lastPush[t] || 0; out[t] = (changed[t] || []).filter((x) => changedHere(x, since)).length; }
      return out;
    }

    async function push() {
      const s = await state();
      const started = now();                 // anything written from here on goes up next time
      const changed = await db.changedSince(Math.min(...TABLES.map((t) => s.lastPush[t] || 0)));
      const stats = { applied: 0, skipped: 0, rejected: [] };
      for (const t of TABLES) {
        const since = s.lastPush[t] || 0;
        const rows = (changed[t] || []).filter((x) => changedHere(x, since)).sort((a, b) => a.updatedAt - b.updatedAt).map(forServer);
        for (let i = 0; i < rows.length; i += BATCH) {
          const r = await transport.push(t, rows.slice(i, i + BATCH));   // a network failure throws: nothing is marked pushed
          stats.applied += r.applied; stats.skipped += r.skipped;
          for (const x of r.rejected || []) stats.rejected.push(Object.assign({ table: t }, x));
        }
        // a refused record isn't retried forever: it's reported (the account isn't allowed to write it)
        s.lastPush[t] = started - 1;
      }
      s.rejected = stats.rejected.slice(0, 50);
      s.lastPushAt = started;
      s.log = (s.log || []).concat({ at: started, push: { applied: stats.applied, skipped: stats.skipped, rejected: stats.rejected.length } });
      await saveState(s);
      return stats;
    }

    async function pull() {
      const s = await state();
      const stats = { merged: 0, received: 0 };
      for (const t of TABLES) {
        let cur = s.cursor[t] || { xid: 0, id: "" };
        for (let guard = 0; guard < 10000; guard++) {
          const r = await transport.pull(t, cur);
          stats.received += r.rows.length;
          if (r.rows.length) stats.merged += await db.mergeRows(t, r.rows.map((x) => Object.assign({}, x, { _pulled: x.updatedAt })));
          cur = r.next || cur;
          s.cursor[t] = cur;
          await saveState(s);                 // a pull cut off halfway resumes from here
          if (!r.more) break;
        }
      }
      s.lastPullAt = now();
      s.log = (s.log || []).concat({ at: s.lastPullAt, pull: stats });
      await saveState(s);
      return stats;
    }

    // push first, so this device's newest work is on the server before it merges anyone else's
    async function syncNow() {
      const up = await push();
      const down = await pull();
      return { push: up, pull: down };
    }

    return { push, pull, syncNow, pending, state, TABLES };
  }

  // ------------------------------------------------------------------ Supabase REST transport
  // restUrl: "<project url>/rest/v1". apiKey: the project's publishable key (sb_publishable_..., or the legacy anon key). token(): the signed-in user's access token.
  function restTransport({ restUrl, apiKey, token, programId, fetch: f }) {
    const fx = f || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    if (!fx) throw new Error("no fetch available");
    async function rpc(name, body) {
      const t = await token();
      const res = await fx(`${restUrl.replace(/\/$/, "")}/rpc/${name}`, {
        method: "POST",
        // the project key goes on apikey only (Supabase's publishable keys must not be sent as a Bearer token); the
        // signed-in user's own token, when there is one, is what Authorization carries
        headers: Object.assign({ "content-type": "application/json", apikey: apiKey }, t ? { authorization: `Bearer ${t}` } : {}),
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
      if (!res.ok) {
        const msg = (json && (json.message || json.error_description || json.error)) || text || `HTTP ${res.status}`;
        const err = new Error(`${name}: ${msg}`); err.status = res.status; err.code = json && json.code; throw err;
      }
      return json;
    }
    return {
      push: (table, rows) => rpc("pc_push", { p: programId, tbl: table, rows }),
      pull: (table, cur) => rpc("pc_pull", { p: programId, tbl: table, after_xid: cur.xid || 0, after_id: cur.id || "", lim: 500 }),
      myPrograms: () => rpc("pc_my_programs", {}),
      createProgram: (name, level) => rpc("pc_create_program", { name, level }),
      // head coach only (the server checks): give an account a role in this program; a pitcher is tied to his roster record
      setMember: (email, role, pitcherId) => rpc("pc_set_member", { p: programId, email, member_role: role, member_pitcher: pitcherId || null }),
    };
  }

  // ------------------------------------------------------------------ Supabase auth (email and password)
  // The session is kept in the device's meta store; the access token is refreshed a minute before it expires.
  function supabaseAuth({ url, apiKey, db, fetch: f, now }) {
    const fx = f || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    const clock = now || (() => Date.now());
    const key = "auth";
    async function call(grant, body) {
      const res = await fx(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=${grant}`, {
        method: "POST", headers: { "content-type": "application/json", apikey: apiKey }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error_description || json.msg || json.error || `sign-in failed (HTTP ${res.status})`);
      const s = { id: key, access: json.access_token, refresh: json.refresh_token, expiresAt: clock() + (json.expires_in || 3600) * 1000,
        userId: json.user && json.user.id, email: json.user && json.user.email };
      await db.put("meta", s);
      return s;
    }
    return {
      signIn: (email, password) => call("password", { email, password }),
      async token() {
        const s = await db.get("meta", key);
        if (!s) return null;
        if (s.expiresAt - clock() > 60000) return s.access;
        return (await call("refresh_token", { refresh_token: s.refresh })).access;
      },
      async session() { return db.get("meta", key); },
      async signOut() { return db.del("meta", key); },
    };
  }

  const PCSync = { VERSION, TABLES, createSync, restTransport, supabaseAuth };
  if (typeof module !== "undefined" && module.exports) module.exports = PCSync;
  else root.PCSync = PCSync;
})(typeof window !== "undefined" ? window : this);
