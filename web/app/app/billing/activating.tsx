"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// After Checkout, Stripe's webhook switches the organization on, usually within seconds. Until then the page asks
// again every 2 seconds, for up to a minute.
export function Activating() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 30) return;
    const t = setTimeout(() => { router.refresh(); setTries((n) => n + 1); }, 2000);
    return () => clearTimeout(t);
  }, [tries, router]);
  return tries < 30
    ? <p role="status"><span className="pill-warn">Activating</span> Payment received: Stripe is confirming it. This takes a few seconds.</p>
    : <p role="status"><span className="pill-warn">Still activating</span> Stripe hasn&apos;t confirmed yet. Refresh in a minute; if it&apos;s still not active, email support.</p>;
}
