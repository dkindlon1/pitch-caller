/*
 * PitchIQ watch (prototype, docs/PLAN_watch_prototype_2026-11-15.md rev 3), for Bangle.js 2.
 *
 * Shows only the call the coach accepted: the catcher's sign, large, and the location in words under it ("get it over"
 * shows the sign alone). Both watches, pitcher's and catcher's, look the same: inside and outside are the hitter's.
 * One long buzz = a new call; two short buzzes = the call changed before the pitch. "—" between calls.
 *
 * The coach's app (app/watch.js) writes codes to this app's own Bluetooth service. It takes data, never code, so the
 * watch's "Programmable" setting can stay off except while uploading this file.
 *   C<n>,<sign>,<loc>,<chg>   a call            X<n>   clear            H   heartbeat (every 3 s)
 * Back to the coach, by notification (only while the coach has "Delivery receipt" on): A<n> receipt, B<pct> battery.
 * Message numbers restart at 1 on every connection; an older number is dropped, the same number again only gets its
 * receipt again (no second buzz). No message for 6 s, or a disconnect: NO LINK, and the call is taken off the screen.
 */
var PQ_SVC = "7a1d0001-5c3e-4b8f-9a62-2f0c8e4d1b70";
var PQ_RX = "7a1d0002-5c3e-4b8f-9a62-2f0c8e4d1b70";
var PQ_TX = "7a1d0003-5c3e-4b8f-9a62-2f0c8e4d1b70";
var PQ_WORDS = { HI: ["HIGH AND", "INSIDE"], HO: ["HIGH AND", "OUTSIDE"], LI: ["LOW AND", "INSIDE"], LO: ["LOW AND", "OUTSIDE"],
  L: ["LOW"], M: [], CH: ["CHASE", "HIGH"], CL: ["CHASE", "LOW"] };
var PQ_LINK_MS = 6000;

// ------------------------------------------------------------------ core: no Bangle calls (watch/bangle/test.js runs it)
// io: { draw(view), buzz("new" | "changed"), light(), notify(text), now() }
function PQCore(io) {
  var st = { lastN: 0, show: null, link: false, lastRx: 0 };
  function view() { return { link: st.link, sign: st.show ? st.show.sign : null, words: st.show ? PQ_WORDS[st.show.loc] : null }; }
  function onConnect() { st.lastN = 0; st.link = true; st.lastRx = io.now(); st.show = null; io.draw(view()); }
  function onDisconnect() { st.link = false; st.show = null; io.draw(view()); }
  function onWrite(text) {
    st.lastRx = io.now();
    var redraw = false;
    if (!st.link) { st.link = true; redraw = true; }
    var c = text.charAt(0);
    if (c === "C" || c === "X") {
      var parts = text.slice(1).split(",");
      var n = parseInt(parts[0], 10);
      if (!(n > 0)) { if (redraw) io.draw(view()); return; }
      if (n < st.lastN) { if (redraw) io.draw(view()); return; }            // older than what's shown: dropped
      if (n === st.lastN) { if (redraw) io.draw(view()); io.notify("A" + n); return; }   // a repeat: receipt only
      if (c === "C") {
        var sign = parts[1], loc = parts[2];
        if (!/^[1-9]$/.test(sign) || !PQ_WORDS.hasOwnProperty(loc)) { if (redraw) io.draw(view()); return; }   // not shown, not acknowledged
        st.lastN = n;
        st.show = { sign: sign, loc: loc };
        io.draw(view());
        io.light();
        io.buzz(parts[3] === "1" ? "changed" : "new");
      } else {
        st.lastN = n;
        st.show = null;
        io.draw(view());
      }
      io.notify("A" + n);
      return;
    }
    if (redraw) io.draw(view());   // a heartbeat after NO LINK
  }
  function tick() {
    if (st.link && io.now() - st.lastRx > PQ_LINK_MS) { st.link = false; st.show = null; io.draw(view()); }
  }
  return { onConnect: onConnect, onDisconnect: onDisconnect, onWrite: onWrite, tick: tick, view: view, st: st };
}

// ------------------------------------------------------------------ on the watch
function pqFit(text, size, maxW) {
  g.setFont("Vector", size);
  while (size > 12 && g.stringWidth(text) > maxW) { size -= 2; g.setFont("Vector", size); }
  return size;
}
function pqDraw(v) {
  var W = g.getWidth(), H = g.getHeight(), cx = W / 2;
  g.reset();
  g.setBgColor("#fff").clearRect(0, 0, W - 1, H - 1);   // black on white: the most readable in sun on this screen
  g.setColor(v.link ? "#0f0" : "#f00").fillCircle(W - 10, 10, 5);
  g.setFontAlign(0, 0);
  if (!v.link) {
    g.setColor("#f00"); pqFit("NO LINK", 40, W - 16); g.drawString("NO LINK", cx, H / 2 - 16);
    g.setColor("#000"); pqFit("Coach gives the sign", 18, W - 16); g.drawString("Coach gives the sign", cx, H / 2 + 26);
    return;
  }
  g.setColor("#000");
  if (!v.sign) { g.fillRect(cx - 30, H / 2 - 4, cx + 30, H / 2 + 4); return; }   // "—": no call
  var lines = v.words || [];
  if (!lines.length) { g.setFont("Vector", 150); g.drawString(v.sign, cx, H / 2 + 6); return; }   // get it over: the sign alone
  // the words at the bottom, the sign filling what's left above them (a Vector font's height is about its size)
  var size = 30;
  for (var i = 0; i < lines.length; i++) size = Math.min(size, pqFit(lines[i], 30, W - 10));
  var last = H - 6 - size / 2, first = last - (lines.length - 1) * (size + 4);
  var room = first - size / 2 - 6;
  g.setFont("Vector", Math.min(110, room)); g.drawString(v.sign, cx, room / 2 + 2);
  g.setFont("Vector", size);
  for (var j = 0; j < lines.length; j++) g.drawString(lines[j], cx, first + j * (size + 4));
}
function pqBuzz(kind) {
  if (kind === "changed") Bangle.buzz(120, 1).then(function () { return new Promise(function (r) { setTimeout(r, 120); }); }).then(function () { return Bangle.buzz(120, 1); });
  else Bangle.buzz(450, 1);
}
function pqNotify(text) {
  try { var s = {}; s[PQ_SVC] = {}; s[PQ_SVC][PQ_TX] = { value: text, notify: true }; NRF.updateServices(s); } catch (e) {}
}

if (typeof Bangle !== "undefined") {
  var PQ = PQCore({ draw: pqDraw, buzz: pqBuzz, light: function () { Bangle.setLCDPower(1); }, notify: pqNotify, now: function () { return Date.now(); } });
  global.PQ_CORE = PQ;
  var svc = {};
  svc[PQ_SVC] = {};
  svc[PQ_SVC][PQ_RX] = { value: "", maxLen: 20, writable: true, onWrite: function (evt) { PQ.onWrite(E.toString(evt.data)); } };
  svc[PQ_SVC][PQ_TX] = { value: "", maxLen: 20, readable: true, notify: true };
  NRF.setServices(svc, {});
  var pqBattery = null;
  NRF.on("connect", function () {
    PQ.onConnect();
    setTimeout(function () { pqNotify("B" + E.getBattery()); }, 800);   // after the coach's app has subscribed
    if (pqBattery) clearInterval(pqBattery);
    pqBattery = setInterval(function () { pqNotify("B" + E.getBattery()); }, 60000);
  });
  NRF.on("disconnect", function () { if (pqBattery) clearInterval(pqBattery); pqBattery = null; PQ.onDisconnect(); });
  // a stray press (a glove) does nothing; hold the button 3 s to leave the app
  Bangle.setUI({ mode: "custom", btn: function () {} });
  Bangle.setOptions({ btnLoadTimeout: 3000 });
  setInterval(function () { PQ.tick(); }, 1000);
  pqDraw(PQ.view());
}
