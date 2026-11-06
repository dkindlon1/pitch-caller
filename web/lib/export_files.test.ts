import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { buildZip, readme, rowCount, summaryOf, toCsv, type ExportData } from "./export_files.ts";

const DATA: ExportData = {
  pitchers: [{ id: "p1", updatedAt: 1, name: "Avery “Ace” Brooks", hand: "R", pitches: [{ id: "pt1", name: "Fastball", grade: 4, command: 3, velo: 90, shape: "ride" }, { id: "pt2", name: "Slider", grade: 3 }] }],
  games: [{ id: "g1", updatedAt: 1, date: "2026-10-01" }, { id: "g2", updatedAt: 1, date: "2026-10-08" }],
  // 12 pitches: 4 balls, 3 called strikes, 2 whiffs, 2 fouls, 1 in play -> 8 strikes (67%), 2 whiffs of 5 swings (not enough yet)
  events: [
    ...["ball", "ball", "ball", "ball", "cstrike", "cstrike", "cstrike", "whiff", "whiff", "foul", "foul", "play"].map((res, i) => ({ id: `e${i}`, updatedAt: 1, type: "pitch", gameId: i < 6 ? "g1" : "g2", pitcherId: "p1", res })),
    { id: "sub1", updatedAt: 1, type: "sub", gameId: "g1", pitcherId: "p1" },
  ],
  hitters: [],
  uploads: [{ id: "u1", pitcher_id: "p1", file_name: "=cmd|' /C calc'!A0", n_pitches: 2 }],
  upload_pitches: [{ upload_id: "u1", idx: 0, velo_mph: 90.1 }, { upload_id: "u1", idx: 1, velo_mph: null }],
};
const WHO = { kind: "player" as const, org: "Lakeside Baseball", team: "Varsity", pitcher: "Avery Brooks", generated: "2026-11-06" };

test("CSV: a column for every key, quoting, nested values as JSON, and no formulas", () => {
  const csv = toCsv([{ a: 1, b: 'say "hi", ok' }, { a: null, c: { x: [1, 2] } }, { a: "=SUM(A1)", b: "-5", c: "line\nbreak" }]);
  assert.equal(csv, 'a,b,c\r\n1,"say ""hi"", ok",\r\n,,"{""x"":[1,2]}"\r\n\'=SUM(A1),\'-5,"line\nbreak"\r\n');
});

test("the player summary adds up by hand", () => {
  const s = summaryOf(DATA);
  assert.deepEqual([s.name, s.games, s.pitches, s.strikes, s.whiffs, s.swings, s.uploads, s.uploadPitches, s.arsenal.length], ["Avery “Ace” Brooks", 2, 12, 8, 2, 5, 1, 2, 2]);
});

test("the zip: one CSV per table with rows, the README, the PDF; row counts match", async () => {
  const { zip, rows, files } = await buildZip(DATA, WHO);
  assert.equal(rows, rowCount(DATA));
  assert.equal(rows, 1 + 2 + 13 + 0 + 1 + 2);
  const un = unzipSync(zip);
  assert.deepEqual(Object.keys(un).sort(), ["README.txt", "events.csv", "games.csv", "pitchers.csv", "summary.pdf", "upload_pitches.csv", "uploads.csv"]);
  assert.deepEqual(files.sort(), Object.keys(un).sort());
  for (const t of ["pitchers", "games", "events", "uploads", "upload_pitches"]) {
    const lines = strFromU8(un[`${t}.csv`]).split("\r\n").filter((l) => l !== "");
    // a quoted newline doesn't occur in this data, so lines = header + rows
    assert.equal(lines.length - 1, DATA[t].length, t);
  }
  assert.match(strFromU8(un["uploads.csv"]), /,'=cmd/);
  assert.equal(strFromU8(un["summary.pdf"].slice(0, 5)), "%PDF-");
  const r = strFromU8(un["README.txt"]);
  assert.match(r, /events\.csv  13 rows/);
  assert.match(r, /19 rows in all\./);
  assert.doesNotMatch(r, /hitters\.csv/);
});

test("a coach's export has no PDF and says children's data isn't in it", async () => {
  const { files } = await buildZip({ pitchers: DATA.pitchers }, { kind: "coach", org: "Lakeside", team: "Varsity", generated: "2026-11-06" });
  assert.deepEqual(files.sort(), ["README.txt", "pitchers.csv"]);
  assert.match(readme({ pitchers: DATA.pitchers }, { kind: "coach", org: "Lakeside", team: "Varsity", generated: "x" }), /under 13 aren't included/);
});
