"use client";
import { useRef, useState } from "react";
import PCImport, { type Field, type Parsed } from "@/lib/pc_import";
import { fileDate, looksLikeGame, normalize, sourceOf, SESSION_LABEL, type SessionType, type UploadPitch } from "@/lib/uploads";
import { addUpload } from "./actions";

// Drag and drop (or pick) a TrackMan, Rapsodo or other pitch file. It's read here, in the browser, with the game
// app's own parser: nothing leaves the device until "Upload", and then only the normalized pitches do.
export type Template = { name: string; header_sig: string; mapping: Partial<Record<Field, string>> };
type Props = { team: string; pitcher: string; hand: "R" | "L"; pitcherName: string; templates: Template[]; today: string };

const MAP_FIELDS: [Field, string][] = [["type", "Pitch type (needed)"], ["velo", "Velocity (mph)"], ["ivb", "Induced vertical break (in)"], ["hb", "Horizontal break (in)"],
  ["spin", "Spin rate"], ["relH", "Release height"], ["relS", "Release side"], ["ext", "Extension"], ["date", "Date"], ["call", "Pitch result"],
  ["balls", "Balls"], ["strikes", "Strikes"], ["side", "Batter side"], ["exit", "Exit speed"], ["px", "Plate side"], ["pz", "Plate height"]];
const MAX_BYTES = 5 * 1024 * 1024;

export function UploadForm({ team, pitcher, hand, pitcherName, templates, today }: Props) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [rows, setRows] = useState<UploadPitch[]>([]);
  const [warn, setWarn] = useState<string[]>([]);
  const [session, setSession] = useState<SessionType>("bullpen");
  const [date, setDate] = useState(today);
  const [mapping, setMapping] = useState<{ header: string[]; sig: string; sample: string[][] } | null>(null);
  const [map, setMap] = useState<Partial<Record<Field, string>>>({});
  const [save, setSave] = useState("");
  const [used, setUsed] = useState<Template | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function reset() { setParsed(null); setRows([]); setWarn([]); setError(""); setMapping(null); setUsed(null); }

  function read(t: string, forced?: Partial<Record<Field, string>>, tpl?: Template | null) {
    reset();
    const head = PCImport.headerOf(t);
    const saved = tpl ?? templates.find((x) => x.header_sig === head.sig) ?? null;
    const mapUse = forced || saved?.mapping;
    const extra: string[] = [];
    let p: Parsed;
    try {
      try { p = PCImport.parse(t, { hand, pitcherName, mapping: mapUse }); }
      catch (e) {
        // the Pitcher column didn't match his name: read every row, and say so
        if (!/No usable pitches/.test((e as Error).message)) throw e;
        p = PCImport.parse(t, { hand, mapping: mapUse });
        extra.push(`None of the rows are under "${pitcherName}": showing every row. Make sure this file is his.`);
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "no_header" || code === "no_type") { setMapping(head); setMap(forced || {}); setError("This file isn't TrackMan or Rapsodo. Match its columns once and it'll be read the same way next time."); return; }
      setError((e as Error).message); return;
    }
    const r = normalize(p);
    if (p.hand && p.hand !== hand) extra.push(`The file says he throws ${p.hand === "L" ? "left" : "right"}-handed; his profile says ${hand === "L" ? "left" : "right"}.`);
    setParsed(p); setRows(r); setWarn(p.warnings.concat(extra)); setUsed(saved && !forced ? saved : null);
    setSession(looksLikeGame(r) ? "game" : "bullpen");
    setDate(fileDate(p) || today);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    reset(); setName(file.name);
    if (file.size > MAX_BYTES) { setError("That file is over 5 MB. Export one session or one game at a time."); return; }
    const t = await file.text();
    setText(t); read(t);
  }

  const types = rows.reduce<Record<string, number>>((a, r) => ((a[r.pitch_type] = (a[r.pitch_type] || 0) + 1), a), {});
  return (
    <div className="upload-box">
      <div className={`drop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <p><b>Drop a TrackMan or Rapsodo file here</b> (CSV), or</p>
        <button type="button" className="shell-btn" onClick={() => input.current?.click()}>Choose a file</button>
        <input ref={input} type="file" accept=".csv,.txt,text/csv" hidden aria-label="Pitch file" onChange={(e) => pick(e.target.files?.[0])} />
        {name ? <p className="shell-note small mono">{name}</p> : null}
      </div>
      {error ? <p className="shell-alert" role="alert">{error}</p> : null}

      {mapping ? (
        <form className="shell-form" aria-label="Match the columns" onSubmit={(e) => { e.preventDefault(); if (!map.type) { setError("Pick the pitch type column."); return; } read(text, map); }}>
          <div className="tbl-scroll"><table className="data-tbl small" aria-label="The file's first rows">
            <thead><tr>{mapping.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{mapping.sample.map((r, i) => <tr key={i}>{mapping.header.map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody>
          </table></div>
          <div className="map-grid">{MAP_FIELDS.map(([f, label]) => (
            <label key={f}>{label}<select value={map[f] || ""} onChange={(e) => setMap({ ...map, [f]: e.target.value || undefined })}>
              <option value="">(none)</option>{mapping.header.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}</select></label>))}</div>
          <label>Save this for the team as (optional)<input value={save} onChange={(e) => setSave(e.target.value)} maxLength={60} placeholder="Yakkertech bullpen" /></label>
          <button type="submit" className="shell-btn">Read the file</button>
        </form>
      ) : null}

      {parsed ? (
        <form action={addUpload} className="shell-form" aria-label="Upload">
          <input type="hidden" name="team" value={team} /><input type="hidden" name="pitcher" value={pitcher} />
          <input type="hidden" name="rows" value={JSON.stringify(rows)} /><input type="hidden" name="source" value={sourceOf(parsed)} />
          <input type="hidden" name="file_name" value={name} /><input type="hidden" name="warnings" value={JSON.stringify(warn)} />
          {mapping === null && parsed.source === "Mapped" && save ? (<>
            <input type="hidden" name="template_name" value={save} /><input type="hidden" name="template_sig" value={PCImport.headerOf(text).sig} />
            <input type="hidden" name="template_map" value={JSON.stringify(map)} /></>) : null}
          <p className="upload-sum"><b>{rows.length} pitches</b> · {parsed.source === "Mapped" ? (used ? `read with "${used.name}"` : "read with your column match") : parsed.source}
            {parsed.flipped ? " · break flipped to arm side" : ""}</p>
          <p className="shell-note small">{Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(" · ")}</p>
          {warn.length ? <ul className="plain-list warn" aria-label="Notes on this file">{warn.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
          <div className="row-fields">
            <label className="w-sel">Session<select name="session_type" value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
              {(Object.keys(SESSION_LABEL) as SessionType[]).map((s) => <option key={s} value={s}>{SESSION_LABEL[s]}</option>)}</select></label>
            <label className="w-sel">Date<input type="date" name="session_date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></label>
          </div>
          <p className="shell-note small">Games count most, then live BP, then bullpens, and older sessions less. You can leave out warmups and mark pitches you&apos;re still developing on the next page.</p>
          <button type="submit" className="shell-btn primary">Upload {rows.length} pitches</button>
          <button type="button" className="shell-btn text" onClick={() => { reset(); setName(""); setText(""); if (input.current) input.current.value = ""; }}>Cancel</button>
        </form>
      ) : null}
    </div>
  );
}
