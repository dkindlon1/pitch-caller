import { ScrollFilm, type Beat } from "./ScrollFilm";

// The opening: a watch assembles from its parts as you scroll, turns to face you, and the call lands on its screen.
// 72 frames per size (scripts/render-watch.py), then a rest on the last one (holdEnd) so the call stays up.
// The watch is an illustration on a generic body; the face on its screen is the PitchIQ watch app's own.
const BEATS: Beat[] = [
  {
    from: 0, to: 0.24, className: "pq-beat-title",
    node: (
      <div className="pq-beat">
        <p className="pq-eyebrow">PitchIQ</p>
        <h1 id="hero-h" className="pq-display">Every pitch called.<br /><em>Every call explained.</em></h1>
      </div>
    ),
  },
  {
    from: 0.27, to: 0.46,
    node: (
      <div className="pq-beat">
        <p className="pq-eyebrow">The watch</p>
        <h2 className="pq-title">Two wrists. <em>One call.</em></h2>
        <p className="pq-lede">The sign and the spot land on the pitcher&apos;s watch and the catcher&apos;s at the same moment.</p>
      </div>
    ),
  },
  {
    from: 0.5, to: 0.7,
    node: (
      <div className="pq-beat">
        <p className="pq-eyebrow">On the wrist</p>
        <h2 className="pq-title">One long buzz is a new call. <em>Two short, it changed.</em></h2>
      </div>
    ),
  },
  {
    from: 0.76, to: 1.01, className: "pq-beat-end",
    node: (
      <div className="pq-beat">
        <p className="pq-eyebrow">Called by PitchIQ</p>
        <h2 className="pq-title">Fastball, <em>outside.</em></h2>
        <p className="pq-lede">Five reads went into that call. <a className="pq-link" href="#reads">See them</a></p>
        <p className="pq-fine">Illustration: the PitchIQ watch app on a generic smartwatch. The watch is a prototype.</p>
      </div>
    ),
  },
];

export function WatchFilm() {
  return (
    <ScrollFilm
      id="top" name="watch" wide={72} tall={72} length={560} holdEnd={0.22}
      poster="/media/film/watch/poster.jpg" tallPoster="/media/film/watch/tall-poster.jpg"
      beats={BEATS} className="pq-film" labelledBy="hero-h"
    >
      <div className="pq-hud" aria-hidden="true">
        <span className="pq-corner pq-tl" /><span className="pq-corner pq-tr" /><span className="pq-corner pq-bl" /><span className="pq-corner pq-br" />
        <span className="pq-bar"><i /></span>
      </div>
    </ScrollFilm>
  );
}
