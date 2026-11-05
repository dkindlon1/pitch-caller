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
 *
 * PitchIQ (2.0): a "program" is a team (supabase/migrations/20261106000000_pitchiq_teams.sql). A team that isn't paid
 * up refuses pushes as team_locked and pulls nothing (locked); refused rows stay on the iPad and are tried again at
 * every sync. Given the signed-in user (opts.userId), an iPad another account last synced is handed over only when
 * none of that account's changes are still waiting: its local copy is cleared first, so the new account sees only what
 * the server gives it. With changes waiting, the sync refuses (code "other-user") until that account sends them.
 */
(function (root) {
  "use strict";
  const VERSION = "2.0.0";
  // the device stores that sync, in the order they go up (parents before what points at them); meta stays on the device
  const TABLES = ["teams", "pitchers", "catchers", "hitters", "checkins", "sessions", "readings", "games", "packs", "events", "learned"];
  const BATCH = 400;

  // Strings the server can't store: a NUL character, or half of an emoji (a lone surrogate, as a cut-off paste leaves).
  // Postgres refuses the whole request over either, so they're cleaned before anything goes up.
  const BAD_CHARS = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
  function clean(v) {
    if (typeof v === "string") return BAD_CHARS.test(v) ? v.replace(BAD_CHARS, (c) => (c === "\u0000" ? "" : "\ufffd")) : v;
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = clean(v[k]); return o; }
    return v;
  }
  const DAY = 864e5;

  function createSync(opts) {
    const db = opts.db, transport = opts.transport, programId = opts.programId, userId = opts.userId || null;
    if (!db || !transport || !programId) throw new Error("sync needs a database, a transport and a program");
    const now = opts.now || (() => Date.now());
    const key = "sync:" + programId;

    async function state() {
      const s = await db.get("meta", key);
      return Object.assign({ id: key, programId, lastPush: {}, cursor: {}, parked: {}, rejected: [], log: [], access: null, userId: null, userEmail: null }, s || {});
    }
    async function saveState(s) { s.log = (s.log || []).slice(-30); return db.put("meta", s); }

    // One iPad holds one program's data. The first program it syncs with claims it; another program is refused (its
    // records would otherwise go up into the wrong program), until the iPad is started fresh.
    async function bind() {
      const b = await db.get("meta", "boundProgram");
      if (b && b.programId !== programId) {
        const e = new Error(`This iPad holds the data for ${b.programName || "another program"}. To use it for this program, back it up and start this iPad fresh.`);
        e.code = "other-program"; e.boundTo = b; throw e;
      }
      if (!b) await db.put("meta", { id: "boundProgram", programId, programName: opts.programName || null, at: now() });
      await handOver();
    }

    // A shared iPad: the account that synced it last owns what's waiting on it. Another account takes over only once
    // nothing is waiting, and then starts from a clean local copy (a player never inherits a coach's cached data).
    async function handOver() {
      if (!userId) return;
      const s = await state();
      if (s.userId === userId) return;
      if (s.userId) {
        const waiting = Object.values(await pending()).reduce((a, n) => a + n, 0);
        if (waiting) {
          const e = new Error(`${waiting} change${waiting === 1 ? "" : "s"} from ${s.userEmail || "another account"} ${waiting === 1 ? "is" : "are"} still waiting to go up from this iPad. ${s.userEmail || "That account"} signs in here and syncs first.`);
          e.code = "other-user"; e.owner = s.userEmail || null; e.waiting = waiting; throw e;
        }
        for (const t of TABLES) for (const x of await db.all(t, true)) await db.forget(t, x.id);
      }
      await saveState(Object.assign(s, { userId, userEmail: opts.userEmail || null, lastPush: {}, cursor: {}, parked: {}, rejected: [], access: null }));
    }

    // A record that came down from the server carries _pulled (the updatedAt it arrived with). Until it's changed here
    // its updatedAt still equals _pulled, so it isn't sent back up: the server already has it.
    const changedHere = (x, since) => (x.updatedAt || 0) > since && x._pulled !== x.updatedAt;
    const forServer = (x) => { const y = Object.assign({}, x); delete y._pulled; return clean(y); };
    // records to send whatever the watermark says: ones refused before (another account may be allowed to write them,
    // e.g. the head coach after a charter used this iPad) and ones a restore brought in
    async function wanted(s) {
      const extra = (await db.get("meta", "pushExtra")) || { tables: {} }, out = {};
      for (const t of TABLES) out[t] = new Set([...((s.parked || {})[t] || []), ...((extra.tables || {})[t] || [])]);
      return out;
    }

    // what's waiting to go up, per table
    async function pending() {
      const s = await state(), out = {}, w = await wanted(s);
      const changed = await db.changedSince(0);
      for (const t of TABLES) {
        const since = s.lastPush[t] || 0, ids = new Set((changed[t] || []).filter((x) => changedHere(x, since)).map((x) => x.id));
        for (const id of w[t]) ids.add(id);
        out[t] = ids.size;
      }
      return out;
    }

    // one batch; if the server can't take it whole (a 400 over something in it), halves until the bad record is alone
    async function pushBatch(t, rows) {
      try { return await transport.push(t, rows); }
      catch (e) {
        if (e.status !== 400) throw e;   // no signal, signed out, server down: nothing is marked pushed
        if (rows.length === 1) return { applied: 0, skipped: 0, rejected: [{ id: rows[0].id, reason: "bad record: " + e.message }], server: [] };
        const h = Math.ceil(rows.length / 2), a = await pushBatch(t, rows.slice(0, h)), b = await pushBatch(t, rows.slice(h));
        return { applied: a.applied + b.applied, skipped: (a.skipped || 0) + (b.skipped || 0), rejected: (a.rejected || []).concat(b.rejected || []), server: (a.server || []).concat(b.server || []) };
      }
    }

    async function push() {
      await bind();
      const s = await state(), w = await wanted(s);
      const started = now();                 // anything written from here on goes up next time
      const changed = await db.changedSince(Math.min(...TABLES.map((t) => s.lastPush[t] || 0)));
      const stats = { applied: 0, skipped: 0, rejected: [] }, parked = {}, restamp = [];
      for (const t of TABLES) {
        const since = s.lastPush[t] || 0;
        const rows = (changed[t] || []).filter((x) => changedHere(x, since));
        if (w[t].size) {
          const have = new Set(rows.map((x) => x.id));
          for (const x of await db.all(t, true)) if (w[t].has(x.id) && !have.has(x.id)) rows.push(x);
        }
        rows.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        const take = [];
        for (let i = 0; i < rows.length; i += BATCH) {
          const r = await pushBatch(t, rows.slice(i, i + BATCH).map(forServer));
          stats.applied += r.applied || 0; stats.skipped += r.skipped || 0;
          // the server's copy of what it didn't take because its own is as new or newer: this iPad takes it
          for (const x of r.server || []) if (x && x.doc) take.push(x.doc);
          for (const x of r.rejected || []) {
            stats.rejected.push(Object.assign({ table: t }, x));
            (parked[t] = parked[t] || []).push(x.id);     // kept and tried again (never written off)
            if (/^clock/.test(x.reason || "")) restamp.push([t, x.id]);
          }
        }
        if (take.length) await db.mergeRows(t, take.map((d) => Object.assign({}, d, { _pulled: d.updatedAt })), { force: true });
        s.lastPush[t] = started - 1;
      }
      // a record stamped by a clock more than a day fast: once this iPad's clock is right again it gets a fresh stamp
      for (const [t, id] of restamp) {
        const x = (await db.all(t, true)).find((y) => y.id === id);
        if (x && (x.updatedAt || 0) > now() + DAY) await db.put(t, Object.assign({}, x, { updatedAt: 0 }));
      }
      for (const t of Object.keys(parked)) parked[t] = [...new Set(parked[t])].slice(0, 500);
      s.parked = parked;
      s.rejected = stats.rejected.slice(0, 50);
      s.lastPushAt = started;
      s.log = (s.log || []).concat({ at: started, push: { applied: stats.applied, skipped: stats.skipped, rejected: stats.rejected.length } });
      await saveState(s);
      if (await db.get("meta", "pushExtra")) { if (db.forget) await db.forget("meta", "pushExtra"); else await db.del("meta", "pushExtra"); }
      return stats;
    }

    async function pull() {
      await bind();
      const s = await state();
      const stats = { merged: 0, received: 0, held: false, locked: false };
      for (let pass = 0; pass < 2; pass++) {
        let restart = false;
        for (const t of TABLES) {
          let cur = s.cursor[t] || { xid: 0, id: "" };
          for (let guard = 0; guard < 10000; guard++) {
            const r = await transport.pull(t, cur);
            // a new role or pitcher record: rows it couldn't see before were stepped past, so every cursor starts over
            if (r.access && s.access && r.access !== s.access) { s.access = r.access; s.cursor = {}; await saveState(s); restart = true; break; }
            if (r.access) s.access = r.access;
            if (r.reset) { cur = { xid: 0, id: "" }; s.cursor[t] = cur; continue; }   // the server was restored: from the start
            if (r.locked) { stats.locked = true; break; }                              // not paid up: nothing comes down
            stats.received += r.rows.length;
            if (r.rows.length) stats.merged += await db.mergeRows(t, r.rows.map((x) => Object.assign({}, x, { _pulled: x.updatedAt })));
            if (r.held) stats.held = true;
            cur = r.next || cur;
            s.cursor[t] = cur;
            await saveState(s);                 // a pull cut off halfway resumes from here
            if (!r.more) break;
          }
          if (restart) break;
        }
        if (!restart) break;
      }
      s.lastPullAt = now();
      s.log = (s.log || []).concat({ at: s.lastPullAt, pull: stats });
      await saveState(s);
      return stats;
    }

    // push first, so this device's newest work is on the server before it merges anyone else's. A push the server
    // couldn't finish doesn't stop the pull (other iPads' games still come down); no signal, a sign-in problem or the
    // wrong program stops both.
    async function syncNow() {
      let up, upErr = null;
      try { up = await push(); }
      catch (e) { if (!e.status || e.status === 401 || e.status === 403 || e.code === "other-program" || e.code === "other-user") throw e; upErr = e; up = { applied: 0, skipped: 0, rejected: [], error: e.message }; }
      const down = await pull();
      const locked = down.locked || (up.rejected || []).some((x) => x.reason === "team_locked");
      return { push: up, pull: down, locked, error: upErr ? upErr.message : null };
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
      // teams and organizations (programId is the team)
      myTeams: () => rpc("pc_my_teams", {}),
      createOrg: (name, level) => rpc("pc_create_org", { name, level }),
      createTeam: (org, name, level, timezone, joinAs) => rpc("pc_create_team", { org, name, level, timezone: timezone || "America/New_York", join_as: joinAs || null }),
      // invites are link tokens, optionally tied to one email; the server checks who may do each of these
      myInvites: () => rpc("pc_my_invites", {}),
      inviteInfo: (token) => rpc("pc_invite_info", { tok: token }),
      acceptInvite: (token, declaresUnder13, parentEmail) => rpc("pc_accept_invite", { tok: token, declares_under13: !!declaresUnder13, parent_email: parentEmail || null }),
      declineInvite: (token) => rpc("pc_decline_invite", { tok: token }),
      giveConsent: (token, method) => rpc("pc_record_guardian_consent", { tok: token, method }),
      invite: (role, pitcherId, email, under13) => rpc("pc_invite", { p: programId, member_role: role, pitcher: pitcherId || null, invite_email: email || null, under13: !!under13 }),
      cancelInvite: (token) => rpc("pc_cancel_invite", { tok: token }),
      staff: () => rpc("pc_staff", { p: programId }),
      setMember: (userId, role, perms) => rpc("pc_set_member", { p: programId, member: userId, member_role: role, member_perms: perms || {} }),
      removeMember: (userId) => rpc("pc_remove_member", { p: programId, member: userId }),
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
    // one refresh at a time: calls that need a token while a refresh is under way wait for it (two refreshes with the
    // same refresh token can make Supabase treat the second as a stolen token and end the session)
    let refreshing = null;
    return {
      signIn: (email, password) => call("password", { email, password }),
      async token() {
        const s = await db.get("meta", key);
        if (!s) return null;
        if (s.expiresAt - clock() > 60000) return s.access;
        if (!refreshing) refreshing = call("refresh_token", { refresh_token: s.refresh }).finally(() => { refreshing = null; });
        return (await refreshing).access;
      },
      async session() { return db.get("meta", key); },
      // a hard delete: a soft-deleted session would still hold the refresh token on the device
      async signOut() { return db.forget ? db.forget("meta", key) : db.del("meta", key); },
    };
  }

  const PCSync = { VERSION, TABLES, createSync, restTransport, supabaseAuth };
  if (typeof module !== "undefined" && module.exports) module.exports = PCSync;
  else root.PCSync = PCSync;
})(typeof window !== "undefined" ? window : this);
