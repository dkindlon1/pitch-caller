"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

type Item = { key: string; href: string; icon: IconName; short: string; label: string; badge?: number; external?: boolean };

// The dock: the launcher's tiles kept at hand inside every screen. On the launcher itself the tiles are the
// navigation, so the dock steps aside there (except on an iPad or phone, where it's the only way around).
export function Dock({ items, home }: { items: Item[]; home: string }) {
  const path = usePathname() || "";
  const at = (href: string) => { const h = href.split("?")[0]; return h === home ? path === home : path === h || path.startsWith(h + "/"); };
  return (
    <nav className="pq-dock glass" aria-label="Screens" data-home={path === home ? "1" : undefined}>
      {items.map((x) => {
        const inner = <><Icon name={x.icon} /><span>{x.short}</span>{x.badge ? <i className="dot" aria-label={`${x.badge} waiting`} /> : null}</>;
        return x.external
          ? <a key={x.key} href={x.href} title={x.label}>{inner}</a>
          : <Link key={x.key} href={x.href} aria-current={at(x.href) ? "page" : undefined} title={x.label}>{inner}</Link>;
      })}
    </nav>
  );
}
