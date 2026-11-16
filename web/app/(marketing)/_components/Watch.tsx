// The film's watch as a still (its last frame, cut out: scripts/watch-render) with a live face drawn on its screen in
// the watch app's style: the pitch, a short rule, the spot in the watch's words. With no call it shows the short bar,
// as the real watch does. An illustration: the real watch shows the catcher's sign number.
export function Watch({ pitch, words, blank = false, className = "" }: { pitch: string; words: string[]; blank?: boolean; className?: string }) {
  return (
    <span className={`pq-w${blank ? " is-blank" : ""}${className ? ` ${className}` : ""}`}>
      <img src="/media/film/watch/head.webp" alt="" width="538" height="672" loading="lazy" decoding="async" />
      <span className="pq-wface" aria-hidden="true">
        <span className="pq-wdash" />
        <span className="pq-wwords">
          <span className="a">{pitch.toUpperCase()}</span>
          {words.length ? <span className="r" /> : null}
          {words.map((w) => <span key={w} className="b">{w}</span>)}
        </span>
        <i className="pq-wring" />
      </span>
    </span>
  );
}
