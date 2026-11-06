// The spring waitlist: validates a sign-up and stores it through the locked-down database function
// public.pc_join_waitlist (supabase/migrations/20261105180000_waitlist.sql), callable only with the service key.

export const ROLES = ["coach", "parent", "player", "other"] as const;
export const LEVELS = ["hs", "travel", "college", "other"] as const;

export type WaitlistStatus = "ok" | "rate_limited" | "invalid" | "unavailable" | "error";
export type WaitlistResult = { status: WaitlistStatus; httpStatus: number };

export type WaitlistDeps = {
  // Calls pc_join_waitlist and returns its text result, or throws.
  join: (email: string, role: string, level: string | null, ipHash: string) => Promise<string>;
  hashIp: (ip: string) => Promise<string>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTP: Record<WaitlistStatus, number> = { ok: 200, rate_limited: 429, invalid: 400, unavailable: 503, error: 502 };
const result = (status: WaitlistStatus): WaitlistResult => ({ status, httpStatus: HTTP[status] });

export async function handleWaitlist(body: unknown, ip: string, deps: WaitlistDeps | null): Promise<WaitlistResult> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  // Bots fill every field; people never see this one. Pretend it worked and store nothing.
  if (typeof b.company === "string" && b.company.trim() !== "") return result("ok");
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const role = typeof b.role === "string" ? b.role : "";
  const level = typeof b.level === "string" && b.level !== "" ? b.level : null;
  if (email.length > 320 || !EMAIL.test(email)) return result("invalid");
  if (!(ROLES as readonly string[]).includes(role)) return result("invalid");
  if (level !== null && !(LEVELS as readonly string[]).includes(level)) return result("invalid");
  if (!deps) return result("unavailable");
  try {
    const r = await deps.join(email, role, level, await deps.hashIp(ip || "unknown"));
    // A repeat sign-up looks exactly like a new one, so the form can't be used to check who is on the list.
    if (r === "ok" || r === "duplicate") return result("ok");
    return r === "rate_limited" || r === "invalid" ? result(r) : result("error");
  } catch {
    return result("error");
  }
}

// Production wiring: Supabase's REST endpoint for the function, and an HMAC of the IP so no address is stored.
export function supabaseDeps(env: Record<string, string | undefined>): WaitlistDeps | null {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY, salt = env.WAITLIST_IP_SALT;
  if (!url || !key || !salt) return null;
  return {
    async join(email, role, level, ipHash) {
      const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/pc_join_waitlist`, {
        method: "POST",
        headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ p_email: email, p_role: role, p_level: level, p_ip_hash: ipHash }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`waitlist rpc ${res.status}`);
      return String(await res.json());
    },
    async hashIp(ip) {
      const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ip));
      return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("");
    },
  };
}

// The client IP as Vercel reports it: the first address in x-forwarded-for.
export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") || "").split(",")[0].trim() || headers.get("x-real-ip") || "";
}
