import "./portal.css";
import type { ReactNode } from "react";
import { Frame } from "./app/_frame/Frame";

// The single screens outside a team (sign-in, join, your teams, billing, downloads): the night, the bar, one column.
export function Shell({ title, children, actions, email, wide, auth }: { title: string; children: ReactNode; actions?: ReactNode; email?: string | null; wide?: boolean; auth?: boolean }) {
  return (
    <Frame end={actions} email={email}>
      <div className={wide ? undefined : auth ? "pq-solo auth" : "pq-solo"}>
        <h1 className="pq-h1">{title}</h1>
        {children}
      </div>
    </Frame>
  );
}
