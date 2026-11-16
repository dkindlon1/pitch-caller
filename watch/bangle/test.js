/*
 * The watch app (pitchiq.app.js) run in Node against stand-ins for the Bangle.js 2 firmware (g, Bangle, NRF, E):
 * what it registers, what it draws for every spot, the buzzes, the message rules and NO LINK. It can't show that the
 * real watch draws, buzzes or links: that's the desk test on the watch. Run: node watch/bangle/test.js
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails++; };
const src = fs.readFileSync(path.join(__dirname, "pitchiq.app.js"), "utf8");

function firmware() {
  let now = 0;
  const timers = [];
  const fw = { strings: [], rects: 0, circles: [], buzz: [], services: null, serviceOpts: null, updates: [], ui: null, options: null, lcd: 0, handlers: {}, font: 0 };
  const g = {
    getWidth: () => 176, getHeight: () => 176,
    reset() { return g; }, setBgColor() { return g; }, clearRect() { fw.strings = []; fw.rects = 0; fw.circles = []; return g; },
    setColor(c) { fw.color = c; return g; }, fillCircle(x, y, r) { fw.circles.push(fw.color); return g; }, setFontAlign() { return g; },
    setFont(n, s) { fw.font = s; return g; }, stringWidth: (t) => Math.round(t.length * fw.font * 0.62),
    drawString(t, x, y) { fw.strings.push({ t: String(t), size: fw.font, y, color: fw.color, w: Math.round(String(t).length * fw.font * 0.62) }); return g; },
    fillRect() { fw.rects++; return g; },
  };
  const ctx = {
    g, global: null, Date: { now: () => now }, Math, parseInt, JSON, String, Promise,
    setTimeout: (f, ms) => { timers.push({ at: now + ms, f }); return timers.length; },
    setInterval: (f, ms) => { const t = { at: now + ms, f, every: ms }; timers.push(t); return timers.length; },
    clearInterval: () => {},
    E: { toString: (b) => Buffer.from(b).toString("latin1"), getBattery: () => 87 },
    Bangle: { buzz: (ms, s) => { fw.buzz.push(ms); return Promise.resolve(); }, setLCDPower: (v) => { fw.lcd += v; }, setUI: (o) => { fw.ui = o; }, setOptions: (o) => { fw.options = o; } },
    NRF: { setServices: (s, o) => { fw.services = s; fw.serviceOpts = o; }, updateServices: (s) => { fw.updates.push(s); }, on: (ev, f) => { fw.handlers[ev] = f; },
      setConnectionInterval: (v) => { fw.interval = v; } },
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  fw.advance = async (ms) => {
    const end = now + ms;
    while (now < end) {
      now += 50;
      for (const t of timers) if (t.at <= now && !t.done) { if (t.every) t.at += t.every; else t.done = true; t.f(); }
      await new Promise((r) => setImmediate(r));
    }
  };
  fw.write = (text) => fw.services[ctx.PQ_SVC][ctx.PQ_RX].onWrite({ data: Buffer.from(text, "latin1") });
  fw.texts = () => fw.strings.map((s) => s.t);
  fw.ctx = ctx;
  fw.notifies = () => fw.updates.map((u) => u[ctx.PQ_SVC][ctx.PQ_TX].value);
  return fw;
}

(async () => {
  console.log("1. What the app registers");
  {
    const fw = firmware(), c = fw.ctx;
    const s = fw.services && fw.services[c.PQ_SVC];
    check(!!s && s[c.PQ_RX].writable && s[c.PQ_RX].maxLen === 20 && typeof s[c.PQ_RX].onWrite === "function", "its own service: a writable characteristic, 20 bytes, data handler");
    check(s[c.PQ_TX].notify === true && s[c.PQ_TX].readable === true, "a notify characteristic for receipts");
    check(c.PQ_SVC === require("../../app/watch.js").SVC && c.PQ_RX === require("../../app/watch.js").RX && c.PQ_TX === require("../../app/watch.js").TX, "the same UUIDs as the coach's app");
    check(!/\beval\s*\(|new Function/.test(src), "never runs code it receives (no eval)");
    check(fw.ui && fw.ui.mode === "custom" && typeof fw.ui.btn === "function" && fw.options && fw.options.btnLoadTimeout === 3000, "a short button press does nothing; hold 3 s to leave");
    check(fw.texts().includes("NO LINK"), "before the coach connects: NO LINK");
  }

  console.log("2. What it shows");
  {
    const fw = firmware();
    fw.handlers.connect();
    check(!fw.texts().length && fw.rects === 1 && fw.circles[0] === "#0f0", "connected: — (a bar), green link dot");
    const cases = [["HI", ["HIGH AND", "INSIDE"]], ["HO", ["HIGH AND", "OUTSIDE"]], ["LI", ["LOW AND", "INSIDE"]], ["LO", ["LOW AND", "OUTSIDE"]],
      ["L", ["LOW"]], ["CH", ["CHASE", "HIGH"]], ["CL", ["CHASE", "LOW"]], ["M", []]];
    let n = 1;
    for (const [loc, words] of cases) {
      fw.write(`C${n++},3,${loc},0`);
      const t = fw.texts();
      check(t[0] === "3" && JSON.stringify(t.slice(1)) === JSON.stringify(words), `${loc}: ${t.join(" / ")}`);
      check(fw.strings.every((s) => s.w <= 176), `${loc}: every line fits the 176 px width (widest ${Math.max(...fw.strings.map((s) => s.w))} px, estimated)`);
      const tops = fw.strings.map((s) => [s.y - s.size / 2, s.y + s.size / 2]);
      check(tops.every(([a, b]) => a >= 0 && b <= 176) && tops.every((r, i) => i === 0 || r[0] >= tops[i - 1][1] - 1 || i === 1 && r[0] >= tops[0][1] - 1),
        `${loc}: fits the height, no overlap (sign ${fw.strings[0].size}px, ${tops.map(([a, b]) => `${Math.round(a)}-${Math.round(b)}`).join(", ")})`);
    }
    const signSize = fw.strings[0].size;
    check(signSize >= 140, `get it over: the sign alone, larger (${signSize})`);
    fw.write(`X${n++}`);
    check(!fw.texts().length && fw.rects === 1, "clear: back to —");
  }

  console.log("3. Buzz, receipts, message rules");
  {
    const fw = firmware();
    fw.handlers.connect();
    fw.write("C1,5,LO,0");
    check(fw.buzz.join() === "450" && fw.lcd === 1, "new call: one long buzz, backlight on");
    check(fw.notifies()[0] === "A1" && fw.notifies()[1] === "B87", "receipt A1, then the battery (first message of the connection)");
    fw.write("C1,5,LO,0");
    check(fw.buzz.length === 1 && fw.notifies().slice(-1)[0] === "A1", "the same message again: receipt only, no buzz");
    fw.write("C2,1,HI,1"); await fw.advance(300);
    check(fw.buzz.slice(1).join() === "120,120", "changed call: two short buzzes");
    fw.write("C1,6,CL,0");
    check(fw.texts()[0] === "1", "an older number is dropped");
    const before = fw.notifies().length;
    fw.write("C3,0,LO,0"); fw.write("C4,3,ZZ,0"); fw.write("Cx,3,LO,0");
    check(fw.notifies().length === before && fw.texts()[0] === "1", "bad sign, bad spot, bad number: not shown, no receipt");
    // reconnect: numbers restart
    fw.handlers.disconnect();
    check(fw.texts().includes("NO LINK") && !fw.texts().includes("1"), "disconnect: NO LINK, call taken off");
    fw.handlers.connect();
    check(fw.interval === 20, "on connect it asks for a steady 20 ms link");
    fw.write("C1,2,L,0");
    check(fw.texts()[0] === "2", "reconnected: message 1 is shown again (the watch reset its count)");
    check(fw.notifies().includes("B87"), "battery sent with the first message after connecting (B87), once the coach's app is listening");
    fw.write("C5,3,HI,0"); fw.write("S");
    check(!fw.texts().length && fw.rects === 1, "S: a new session, the call is taken off and the count starts again");
    fw.write("C1,4,LO,0");
    check(fw.texts()[0] === "4", "after S, message 1 shows even though the watch had seen 5 (no disconnect needed)");
  }

  console.log("4. NO LINK without heartbeats");
  {
    const fw = firmware();
    fw.handlers.connect(); fw.write("C1,4,LI,0");
    for (let i = 0; i < 3; i++) { await fw.advance(3000); fw.write("H"); }
    check(fw.texts()[0] === "4", "heartbeats every 3 s: the call stays");
    await fw.advance(7000);
    check(fw.texts().includes("NO LINK") && !fw.texts().includes("4"), "7 s without a message: NO LINK, call taken off");
    fw.write("H");
    check(!fw.texts().includes("NO LINK") && !fw.texts().includes("4"), "a plain heartbeat: link back, — (the old call doesn't come back on its own)");
    const nb = fw.buzz.length;
    fw.write("C1,4,LI,0");
    check(fw.texts()[0] === "4" && fw.buzz.length === nb, "the coach's app repeats the same message: the call goes back up, no buzz");
    await fw.advance(7000);
    fw.write("C2,6,CL,0");
    check(fw.texts()[0] === "6" && fw.buzz.length === nb + 1, "after another quiet spell a newer message shows and buzzes as usual");
    fw.handlers.disconnect(); fw.handlers.connect(); fw.write("C1,4,LI,0");
    check(fw.texts()[0] === "4" && fw.buzz.length === nb + 2, "after a real disconnect nothing is held: message 1 of the new session is new (it buzzes)");
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
