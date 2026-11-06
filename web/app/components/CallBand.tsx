import { PITCH_COLOR, type Pitch } from "@/content/at-bat";

// The app's call band (design system: "Call band · engine call"): the pitch's fill with black text, the catcher's
// sign on a black tile in the pitch color, the pitch and spot in condensed caps.
export function CallBand({ p, size = "lg" }: { p: Pick<Pitch, "pitch" | "spot" | "sign">; size?: "lg" | "sm" }) {
  const c = PITCH_COLOR[p.pitch];
  return (
    <div className={`band-call band-call-${size}`} style={{ background: c.fill }}>
      <div className="band-sign" style={{ color: c.fill }}>
        <span className="lbl">Sign</span>
        <b className="mono">{p.sign}</b>
      </div>
      <div className="band-what">
        <span className="band-tag" style={{ color: c.fill }}>Engine call</span>
        <p className="band-pitch">{p.pitch}</p>
        <p className="band-spot">{p.spot}</p>
      </div>
    </div>
  );
}
