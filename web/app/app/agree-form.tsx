import Link from "next/link";
import { acceptTerms } from "../login/actions";

// accounts made before the current Terms (or before there were any) agree here
export function AgreeForm({ next }: { next: string }) {
  return (
    <form action={acceptTerms} className="shell-form" aria-label="Agree to the Terms">
      <input type="hidden" name="next" value={next} />
      <p className="shell-note">PitchIQ now has Terms and a Privacy Policy. Please read them and agree to keep going.</p>
      <label className="check"><input name="agree" type="checkbox" required /> I agree to the <Link href="/terms" target="_blank">Terms</Link> and the <Link href="/privacy" target="_blank">Privacy Policy</Link></label>
      <button type="submit" className="shell-btn">Agree</button>
    </form>
  );
}
