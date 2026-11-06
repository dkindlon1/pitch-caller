// The files of a lapse export (spec: "Billing and lockout"): one CSV per table, a README, and for a player a one-page
// PDF summary, zipped. Pure functions (no network, no secrets): export_files.test.ts checks them.
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type Rows = Record<string, unknown>[];
export type ExportData = Record<string, Rows>;

// what each table holds, in plain words, for the README
const ABOUT: Record<string, string> = {
  pitchers: "pitcher records: profile and arsenal (each pitch's grade, command, velocity and shape)",
  catchers: "catchers",
  hitters: "hitters, yours and opponents', with any scouting notes",
  teams: "teams: yours and the opponents you've played or scouted",
  games: "games",
  events: "every pitch and event logged in a game, with the call that was made",
  checkins: "pitchers' check-ins",
  sessions: "bullpens and other sessions",
  packs: "game plans",
  readings: "readings",
  learned: "what the engine learned about each pitcher",
  uploads: "TrackMan, Rapsodo and other files uploaded",
  upload_pitches: "each pitch in those files",
  grade_history: "every change to a pitch's grade or command, who made it and when",
};

const FORMULA = /^[=+\-@\t\r]/;
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (typeof v === "string" && FORMULA.test(s)) s = "'" + s;   // a spreadsheet won't run it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows -> CSV: a column for every key any row has, in the order they first appear; nested values as JSON
export function toCsv(rows: Rows): string {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  const lines = [cols.map(cell).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export const rowCount = (d: ExportData) => Object.values(d).reduce((n, rows) => n + (rows?.length || 0), 0);

export type Who = { kind: "player" | "coach"; org: string; team: string; pitcher?: string; generated: string };

export function readme(d: ExportData, who: Who): string {
  const lines = [
    `PitchIQ data export: ${who.kind === "player" ? `${who.pitcher}, ` : ""}${who.team} (${who.org})`,
    `Made ${who.generated}, when the team's PitchIQ subscription lapsed. Your data is kept for 12 months, and paying again brings it all back.`,
    "",
    who.kind === "player"
      ? "This is your own data: your pitcher record, every game pitch logged for you, your sessions, uploads and grade history."
      : "This is the team's data. Players under 13 aren't included: their data goes only to their parent.",
    "",
    "Files (CSV, one row per record; nested values are JSON):",
  ];
  for (const [t, rows] of Object.entries(d)) if (rows?.length) lines.push(`  ${t}.csv  ${rows.length} rows: ${ABOUT[t] || t}`);
  lines.push("", `${rowCount(d)} rows in all.`);
  return lines.join("\n") + "\n";
}

// a player's one-page summary: his arsenal and what his game pitches add up to
type Pitch = { name?: string; kind?: string; grade?: number; command?: number; velo?: number; shape?: string };
const ascii = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "");

export function summaryOf(d: ExportData) {
  const me = (d.pitchers?.[0] || {}) as { name?: string; hand?: string; pitches?: Pitch[] };
  const pitches = (d.events || []).filter((e) => !e.type || e.type === "pitch");
  const res = (r: string) => pitches.filter((e) => e.res === r).length;
  const strikes = res("cstrike") + res("whiff") + res("foul") + res("play");
  const games = new Set(pitches.map((e) => e.gameId).filter(Boolean)).size;
  return {
    name: me.name || "Pitcher", hand: me.hand || "", arsenal: (me.pitches || []).filter((p) => p && p.name),
    games, pitches: pitches.length, strikes, whiffs: res("whiff"), swings: res("whiff") + res("foul") + res("play"),
    uploads: (d.uploads || []).length, uploadPitches: (d.upload_pitches || []).length,
  };
}

export async function summaryPdf(d: ExportData, who: Who): Promise<Uint8Array> {
  const s = summaryOf(d);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`PitchIQ summary: ${ascii(s.name)}`); pdf.setProducer("PitchIQ"); pdf.setCreator("PitchIQ");
  const page = pdf.addPage([612, 792]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const line = (t: string, size = 11, f = reg, x = 56) => { page.drawText(ascii(t), { x, y, size, font: f, color: rgb(0.1, 0.12, 0.15) }); };
  line(ascii(s.name), 24, bold); y -= 22;
  line(`${who.team}${s.hand ? `, throws ${s.hand === "L" ? "left" : "right"}` : ""}`, 12); y -= 16;
  line(`PitchIQ data export, ${who.generated}`, 10); y -= 34;
  line("Arsenal", 14, bold); y -= 20;
  if (s.arsenal.length) {
    line("Pitch", 10, bold); line("Grade", 10, bold, 250); line("Command", 10, bold, 310); line("Velo", 10, bold, 390); line("Shape", 10, bold, 450); y -= 16;
    for (const p of s.arsenal.slice(0, 12)) {
      line(p.name || "", 11); line(p.grade != null ? String(p.grade) : "-", 11, reg, 250); line(p.command != null ? String(p.command) : "-", 11, reg, 310);
      line(p.velo != null ? `${p.velo} mph` : "-", 11, reg, 390); line(p.shape || "-", 11, reg, 450); y -= 16;
    }
  } else { line("No pitches on his record.", 11); y -= 16; }
  y -= 18;
  line("Games called in PitchIQ", 14, bold); y -= 20;
  const pct = (a: number, b: number) => (b >= 10 ? `${Math.round((a / b) * 100)}%` : `${a} of ${b}, not enough yet`);
  line(`${s.pitches} pitches in ${s.games} ${s.games === 1 ? "game" : "games"}`); y -= 16;
  line(`Strikes: ${pct(s.strikes, s.pitches)} of pitches`); y -= 16;
  line(`Swings and misses: ${pct(s.whiffs, s.swings)} of swings`); y -= 28;
  line("Uploaded files", 14, bold); y -= 20;
  line(`${s.uploads} ${s.uploads === 1 ? "file" : "files"}, ${s.uploadPitches} pitches`); y -= 36;
  line("Every record is in the CSV files in this download.", 10);
  return pdf.save();
}

// the zip: CSVs, README and (for a player) the PDF
export async function buildZip(d: ExportData, who: Who): Promise<{ zip: Uint8Array; rows: number; files: string[] }> {
  const files: Record<string, Uint8Array> = { "README.txt": strToU8(readme(d, who)) };
  for (const [t, rows] of Object.entries(d)) if (rows?.length) files[`${t}.csv`] = strToU8(toCsv(rows));
  if (who.kind === "player") files["summary.pdf"] = await summaryPdf(d, who);
  return { zip: zipSync(files, { level: 6 }), rows: rowCount(d), files: Object.keys(files) };
}
