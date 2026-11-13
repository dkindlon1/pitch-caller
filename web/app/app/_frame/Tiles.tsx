import Link from "next/link";
import { Icon } from "./Icon";
import type { NavItem } from "@/lib/nav";

// The launcher's tiles: one per screen this account may open, the main job first and wider.
export function Tiles({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <>
    <h2 className="sr">{label}</h2>
    <ul className="pq-tiles" aria-label={label}>
      {items.map((x) => (
        <li key={x.key} className={`pq-tile glass${x.main ? " main" : ""}`}>
          <Icon name={x.icon} />
          {x.badge ? <span className="badge" aria-label={`${x.badge} waiting for review`}>{x.badge}</span> : null}
          <h3>{x.external ? <a href={x.href}>{x.label}</a> : <Link href={x.href}>{x.label}</Link>}</h3>
          <p>{x.sub}</p>
        </li>
      ))}
    </ul>
    </>
  );
}
