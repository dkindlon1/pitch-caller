import Link from "next/link";
import { signOf } from "@/lib/docs";
import { v11Pitch } from "@/lib/engine_server";
import { Tabs } from "./panels";

import type { Pitcher } from "@/lib/docs";
type P = Pick<Pitcher, "id" | "name" | "number" | "hand" | "role" | "pitches">;

// The top of every coach screen about one pitcher: his number in the big condensed figures, his name, how he throws,
// and his arsenal as chips (sign number on the pitch's colour, with its name), then the tabs.
export function PitcherHead({ team, p, at }: { team: string; p: P; at: "profile" | "uploads" | "stats" }) {
  const live = (p.pitches || []).filter((d) => d.active !== false);
  return (
    <>
      <Link className="pq-crumb" href={`/app/t/${team}/roster`}><span aria-hidden="true">←</span> Roster</Link>
      <header className="pq-who">
        {p.number ? <span className="fig" aria-hidden="true">{p.number}</span> : null}
        <div>
          <h1 className="shell-h1">{p.number ? <span className="sr">#{p.number} </span> : null}{p.name || "Unnamed"}</h1>
          <p>{p.hand === "L" ? "Left-handed" : "Right-handed"} {p.role === "RP" ? "reliever" : "starter"}{live.length ? `, ${live.length} ${live.length === 1 ? "pitch" : "pitches"}` : ""}</p>
        </div>
        {live.length ? (
          <ul className="pq-arsenal" aria-label="Arsenal">
            {live.map((d) => { const v = v11Pitch(d); return <li key={d.id}><span className={`chip k-${v.kind}`} aria-hidden="true">{signOf(v)}</span>{d.name}</li>; })}
          </ul>
        ) : null}
      </header>
      <Tabs base={`/app/t/${team}/roster/${p.id}`} at={at} label="Profile and arsenal" />
    </>
  );
}
