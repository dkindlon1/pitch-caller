import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getServerSupabase, getUser } from "@/lib/supabase/server";
import { AGE_COOKIE, MONTHS, birthYears } from "@/lib/age";
import { signOut } from "../../login/actions";
import { accept, answerAge, sendToParent } from "../actions";
import { Shell } from "../../shell";

export const metadata: Metadata = { title: "Join a team · PitchIQ", robots: { index: false } };

type Params = Promise<{ token: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Info = { team_name: string; role: string; under13: boolean; needs_consent: boolean };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const ROLE: Record<string, string> = { head: "head coach", pitching: "pitching coach", caller: "pitch caller", viewer: "viewer", player: "player" };

const ERRORS: Record<string, string> = {
  birth: "Pick the month and year you were born.",
  age: "Say whether the player is under 13.",
  parent_email: "Enter a parent's or guardian's email.",
  expired: "This invite link has expired or was already used. Ask your coach for a new one.",
  coach_invite: "This is a coach's invite. Coaches sign in to accept it.",
  other_email: "This invite was sent to a different email. Sign in with that email to accept it.",
  consent: "A parent or guardian has to agree before this player joins.",
  other_parent: "Another parent already agreed for this player. Only that parent's account can accept.",
  already_staff: "You're already a coach on this team, so this account can't also join as a player.",
  already_player: "This account is on the team as a player, so it can't also join as a coach.",
  pitcher_taken: "That player already has an account on this team.",
  waiting: "Your coach hasn't approved this invite yet. Ask them to, then open this link again.",
  self_parent: "A parent or guardian has to accept this from their own account.",
  failed: "That didn't work. Try again in a moment.",
};

export default function JoinPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Shell title="Join a team">
      <Suspense fallback={<p className="shell-note">Opening your invite…</p>}>
        <Join params={params} searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Join({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();   // the birth-year list reads today's date: request time only
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f]{64}$/.test(token)) return <p className="shell-alert" role="alert">That link isn&apos;t a PitchIQ invite. Check the link your coach sent.</p>;
  const error = ERRORS[one(sp.error)];
  const alert = error ? <p className="shell-alert" role="alert">{error}</p> : null;
  const done = one(sp.done);
  if (done === "parent_invite_sent") return <p className="shell-note" role="status">Thanks. A parent or guardian finishes joining for players under 13. Once your coach checks the email you gave, they send the invite to it. Nothing about you was saved.</p>;
  if (done === "for_parent") return <p className="shell-note" role="status">This invite is for a parent or guardian. They open it from their own email and sign in there.</p>;

  const user = await getUser();
  if (!user) {
    const age = (await cookies()).get(AGE_COOKIE)?.value;
    if (age === "under13") return (
      <>
        {alert}
        <p className="shell-note">Players under 13 join through a parent or guardian. Give their email and your coach sends them the invite. Nothing about you is saved.</p>
        <form action={sendToParent} className="shell-form" aria-label="A parent's email">
          <input type="hidden" name="token" value={token} />
          <label>Parent or guardian&apos;s email<input name="parent_email" type="email" required /></label>
          <button type="submit" className="shell-btn primary">Send to my parent</button>
        </form>
      </>
    );
    if (age === "13plus") return (
      <>{alert}<p className="shell-note">You&apos;ve been invited to a team on PitchIQ.</p>
        <p><Link className="shell-btn primary" href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>Sign in or make an account to join</Link></p></>
    );
    return (
      <>
        {alert}
        <p className="shell-note">You&apos;ve been invited to a team on PitchIQ. First, when were you born?</p>
        <form action={answerAge} className="shell-form" aria-label="Your age">
          <input type="hidden" name="token" value={token} />
          <fieldset>
            <legend>When were you born?</legend>
            <label>Month<select name="birth_month" defaultValue="" required>
              <option value="" disabled>Month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select></label>
            <label>Year<select name="birth_year" defaultValue="" required>
              <option value="" disabled>Year</option>
              {birthYears().map((y) => <option key={y} value={y}>{y}</option>)}
            </select></label>
          </fieldset>
          <button type="submit" className="shell-btn primary">Continue</button>
        </form>
      </>
    );
  }

  const sb = await getServerSupabase();
  const { data, error: infoErr } = await sb.rpc("pc_invite_info", { tok: token });
  const info = ((data || []) as Info[])[0];
  const signedAs = (
    <form action={signOut} className="shell-inline"><span className="shell-note">Signed in as {user.email}.</span> <button type="submit" className="shell-btn text">Use another account</button></form>
  );
  if (infoErr || !info) {
    const m = infoErr ? infoErr.message : "";
    const msg = /different email/.test(m) ? ERRORS.other_email : /waiting for a coach/.test(m) ? ERRORS.waiting : /their own account/.test(m) ? ERRORS.self_parent : ERRORS.expired;
    return <><p className="shell-alert" role="alert">{msg}</p>{signedAs}</>;
  }
  const role = ROLE[info.role] || info.role;
  return (
    <>
      {alert}
      <p className="join-what">Join <b>{info.team_name}</b> as {role}.</p>
      {signedAs}
      <form action={accept} className="shell-form" aria-label="Accept the invite">
        <input type="hidden" name="token" value={token} />
        {info.role === "player" && info.under13 && info.needs_consent ? (
          // the wording of the notice and the consent is for the lawyer before launch
          <fieldset>
            <legend>Your consent as parent or guardian</legend>
            <p className="shell-note">The player is under 13. Their coaches will keep their pitching data on PitchIQ (pitches, grades, outings and uploads) to call games and coach them. You can see it, and delete all of it at any time.</p>
            <label className="check"><input type="checkbox" name="consent" value="yes" required /> I&apos;m this player&apos;s parent or guardian and I agree.</label>
          </fieldset>
        ) : null}
        {info.role === "player" && !info.under13 ? (
          <fieldset>
            <legend>Is this player under 13?</legend>
            <label className="check"><input type="radio" name="under13" value="no" required /> No</label>
            <label className="check"><input type="radio" name="under13" value="yes" /> Yes</label>
            <label>If yes, a parent or guardian&apos;s email<input name="parent_email" type="email" /></label>
          </fieldset>
        ) : null}
        <button type="submit" className="shell-btn primary">Join {info.team_name}</button>
      </form>
    </>
  );
}
