import "./portal.css";
import type { ReactNode } from "react";
import { Frame } from "./app/_frame/Frame";

// The single screens outside a team (sign-in, join, your teams, billing, downloads): the light, the bar, one column.
// The way in (auth) sits on the film's rest frame instead: the watch, face-on, with the form beside it.
export function Shell({ title, children, actions, email, wide, auth }: { title: string; children: ReactNode; actions?: ReactNode; email?: string | null; wide?: boolean; auth?: boolean }) {
  return (
    <Frame end={actions} email={email} entry={auth}>
      <div className={wide ? "pq-wide" : auth ? "pq-solo auth" : "pq-solo"}>
        <h1 className="pq-h1">{title}</h1>
        {children}
      </div>
    </Frame>
  );
}
