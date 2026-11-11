"use client";

import { useState } from "react";
import { LEVELS, ROLES, type Contact } from "@/lib/contact";

type Errors = Partial<Record<keyof Contact, string>>;

export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProblem("");
    setState("sending");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const json = (await res.json().catch(() => ({}))) as { errors?: Errors; error?: string };
      if (res.ok) { setState("sent"); return; }
      setErrors(json.errors || {});
      setProblem(json.error || (json.errors ? "" : "That didn't send. Try again."));
    } catch {
      setProblem("That didn't send. Check your connection and try again.");
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div className="mk-form-done" role="status">
        <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" /><path d="M13 22.5l6 6 12-13" /></svg>
        <p className="mk-form-done-h">Message sent</p>
        <p>Thanks. You&apos;ll get a reply at the email you gave, usually within a day or two.</p>
      </div>
    );
  }

  const field = (k: keyof Contact) => ({
    name: k,
    id: `c-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `c-${k}-err` : undefined,
    onChange: () => errors[k] && setErrors((x) => ({ ...x, [k]: undefined })),
  });
  const err = (k: keyof Contact) => (errors[k] ? <span className="mk-form-err" id={`c-${k}-err`}>{errors[k]}</span> : null);

  return (
    <form className="mk-form" onSubmit={submit} noValidate>
      <div className="mk-form-row">
        <label htmlFor="c-name">Name<input {...field("name")} autoComplete="name" required />{err("name")}</label>
        <label htmlFor="c-email">Email<input {...field("email")} type="email" autoComplete="email" placeholder="coach@school.edu" required />{err("email")}</label>
      </div>
      <div className="mk-form-row">
        <label htmlFor="c-role">You are
          <select {...field("role")} defaultValue="" required>
            <option value="" disabled>Choose one</option>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>{err("role")}
        </label>
        <label htmlFor="c-level">Level
          <select {...field("level")} defaultValue="" required>
            <option value="" disabled>Choose one</option>
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>{err("level")}
        </label>
      </div>
      <label htmlFor="c-org"><span className="mk-form-label">Team or school <span className="mk-form-opt">(optional)</span></span><input {...field("org")} autoComplete="organization" /></label>
      <label htmlFor="c-message">What would you like to know?<textarea {...field("message")} rows={4} placeholder="How many pitchers you have, what level, what you'd want it to help with." required />{err("message")}</label>
      <div className="mk-form-hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="mk-form-foot">
        <button className="mk-btn" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send message"}</button>
        {problem ? <p className="mk-form-problem" role="alert">{problem}</p> : null}
      </div>
    </form>
  );
}
