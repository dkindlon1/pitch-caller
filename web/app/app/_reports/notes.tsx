"use client";
import { useActionState, useEffect, useRef } from "react";
import { addNote, deleteNote, setNoteShared, type NoteState } from "./actions";

export type Note = { id: string; scope: string; at_bat: string | null; body: string; shared: boolean; created_at: string; deleted_at?: string | null };
const when = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** A list of notes (staff view: each with its share switch) and, for a coach who may write, the form. */
export function Notes({ notes, team, game, pitcher, atBat, canWrite, path, compact }: { notes: Note[]; team: string; game: string; pitcher: string; atBat?: string | null;
  canWrite: boolean; path: string; compact?: boolean }) {
  const [state, act, pending] = useActionState<NoteState, FormData>(addNote, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  const label = atBat ? "Note on this at-bat" : "Note on this outing";
  return (
    <div className="rp-noteblock" style={{ display: "grid", gap: 8 }}>
      {notes.length ? <ul className="rp-notes">{notes.map((n) => (
        <li key={n.id}>
          <p>{n.body}</p>
          <div className="by">
            <span>{when(n.created_at)}</span>
            <span className={`rp-pill${n.shared ? " shared" : ""}`}>{n.shared ? "Shared with the pitcher" : "Staff only"}</span>
            {canWrite ? <form action={setNoteShared}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="team" value={team} /><input type="hidden" name="path" value={path} />
              <input type="hidden" name="shared" value={n.shared ? "0" : "1"} /><button className="shell-btn text small" type="submit">{n.shared ? "Make staff only" : "Share with the pitcher"}</button></form> : null}
            {canWrite ? <form action={deleteNote}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="team" value={team} /><input type="hidden" name="path" value={path} />
              <button className="shell-btn text small" type="submit">Delete</button></form> : null}
          </div>
        </li>))}</ul> : compact ? null : <p className="rp-note">No notes yet.</p>}
      {canWrite ? (
        <details className="rp-addnote" open={!compact && !notes.length ? true : undefined}>
          <summary className="shell-btn text small">{atBat ? "Add a note on this at-bat" : "Add a note"}</summary>
          <form ref={form} action={act} className="rp-noteform" style={{ marginTop: 8 }}>
            <input type="hidden" name="team" value={team} /><input type="hidden" name="game" value={game} /><input type="hidden" name="pitcher" value={pitcher} />
            {atBat ? <input type="hidden" name="at_bat" value={atBat} /> : null}
            <label className="sr" htmlFor={`note-${game}-${atBat || "o"}`}>{label}</label>
            <textarea id={`note-${game}-${atBat || "o"}`} name="body" required maxLength={4000} placeholder={atBat ? "What to remember about this at-bat…" : "What to remember about this outing…"} />
            <div className="row">
              <label className="rp-check"><input type="checkbox" name="shared" /> Share with the pitcher</label>
              <button className="shell-btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save note"}</button>
              {state?.error ? <span className="pq-err" role="alert">{state.error}</span> : null}
              {state?.ok ? <span className="rp-note" role="status">Saved.</span> : null}
            </div>
            <p className="rp-note">Notes are staff-only unless you share them. Shared notes show on the pitcher&rsquo;s own report, never on a public recap.</p>
          </form>
        </details>
      ) : null}
    </div>
  );
}
