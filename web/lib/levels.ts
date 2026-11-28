// D2 release switch (Drew, Nov 27: ship D2 labelled, and keep D2 plans off until devices run the new app).
// An iPad still on the v1.4 game app throws `unknown level "college_d2"` on a D2 game plan and shows a blank page, so the
// website offers D2 for new organizations and game plans only once NEXT_PUBLIC_PITCHIQ_D2 is "1" in Vercel. Turn it on
// after every iPad's setup screen shows the V1.3 version line (see docs/AUDIT_v13_final_2026-11-27.md, release steps).
// Display names for D2 stay everywhere, so nothing breaks if it is switched off again.
export const D2_ENABLED = process.env.NEXT_PUBLIC_PITCHIQ_D2 === "1";

export const levelOffered = (level: string): boolean => level !== "college_d2" || D2_ENABLED;
