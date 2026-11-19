// Build 2: the hitter sheet's new columns (power, contact, speed, spray, hot, cold) for the opponent database.
const I = require("./import.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "  ok   " : "  FAIL ") + m); if (!ok) fails++; };
const hs = I.parseHitters('Name,B,Power,Contact,Speed,Spray,Hot,Cold\nRuiz,R,3,unknown,1,pull,up-in | middle,"down-away"\nChen,L,u,2,,oppo field,"up in;chase down",\nPatel,S,4,x,,,nowhere,\n');
check(JSON.stringify(hs[0].ratings) === JSON.stringify({ power: 3, contact: "unknown", speed: 1 }), "ratings 1 / 2 / 3 and Unknown read");
check(JSON.stringify(hs[1].ratings) === JSON.stringify({ power: "unknown", contact: 2 }), "u reads as Unknown; a blank rating is left out (keeps his)");
check(hs[2].ratings === undefined && hs[2].zone === undefined, "a 4, an x and an unknown spot are ignored");
check(hs[0].scoutTags.spray === "pull" && !(hs[1].scoutTags || {}).spray && !hs[2].scoutTags, "spray words read (\"oppo field\" isn't one of them, so it's left out)");
check(JSON.stringify(hs[0].zone) === JSON.stringify({ "1,1": "hot", "2,2": "hot", "3,3": "cold" }), "a right-handed hitter's up-in is the catcher's left; down-away the right");
check(JSON.stringify(hs[1].zone) === JSON.stringify({ "1,3": "hot", "4,2": "hot" }), "a lefty's up-in is the catcher's right; chase down is below the zone; a quoted cell keeps its \";\"");
const old = I.parseHitters("Name,K%\nA,22%\n");
check(old[0].ratings === undefined && old[0].zone === undefined && old[0].scoutTags === undefined, "an old sheet without the columns imports as before");
console.log(fails ? `${fails} check(s) failed` : "all opponent import checks passed"); process.exit(fails ? 1 : 0);
