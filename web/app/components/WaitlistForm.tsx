"use client";

import { useId, useState } from "react";

type State = "idle" | "sending" | "ok" | "rate_limited" | "invalid" | "unavailable" | "error";

const MESSAGE: Record<Exclude<State, "idle" | "sending">, string> = {
  ok: "You're on the list. We'll email you once when teams can sign up.",
  rate_limited: "Too many sign-ups from this network. Try again in an hour.",
  invalid: "Enter a valid email address and choose who you are.",
  unavailable: "Sign-ups aren't open on this site yet.",
  error: "Your email wasn't saved. Try again in a minute.",
};

export function WaitlistForm({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const id = useId();
  const [state, setState] = useState<State>("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(f.entries())),
      });
      const j = (await res.json().catch(() => ({}))) as { status?: State };
      setState(j.status && j.status in MESSAGE ? j.status : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "ok") {
    return <p className={`wl-done wl-${tone}`} role="status">{MESSAGE[state]}</p>;
  }
  return (
    <form className={`wl wl-${tone}`} onSubmit={submit} noValidate={false}>
      <div className="wl-row">
        <label className="wl-field wl-email">
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="coach@school.edu" />
        </label>
        <label className="wl-field">
          <span>I'm a</span>
          <select name="role" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option value="coach">Coach</option>
            <option value="parent">Parent</option>
            <option value="player">Player, 13 or older</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="wl-field">
          <span>Level</span>
          <select name="level" defaultValue="">
            <option value="">Any</option>
            <option value="hs">High school</option>
            <option value="travel">Travel ball</option>
            <option value="college">College</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="wl-trap" aria-hidden="true">
        <label htmlFor={`${id}-company`}>Company</label>
        <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="wl-row wl-actions">
        <button className="btn" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Joining…" : "Join the spring waitlist"}
        </button>
        <p className="wl-note">One email when teams can sign up. Players under 13: a parent signs up.</p>
      </div>
      {state !== "idle" && state !== "sending" && <p className="wl-error" role="alert">{MESSAGE[state]}</p>}
    </form>
  );
}
