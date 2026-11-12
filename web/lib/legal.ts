// The version of the Terms and Privacy Policy an account agrees to (D15). Change it when either page changes in
// substance: accounts that agreed to an older one are asked again in the portal.
export const LEGAL_VERSION = "2026-11-12-draft";

// Where questions and deletion requests go. A placeholder until Drew picks the address (shown as such on the pages).
export const CONTACT_EMAIL: string | null = null;
export const CONTACT_TEXT = CONTACT_EMAIL ?? "[contact email coming before launch]";

// whether the signed-in account has agreed to the current version (row-level security: only its own rows are read)
export async function hasAccepted(sb: { from: (t: string) => any }): Promise<boolean> {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("legal_acceptances").select("doc").eq("version", LEGAL_VERSION).eq("doc", "terms").limit(1);
  return !!(data && data.length);
}
