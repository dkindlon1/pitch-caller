// The way in (sign in, join, confirm): the film's rest frame, the watch face-on with the call on it and its light
// behind it, so walking in from the public site is one continuous picture. A still image and two CSS lights: no film,
// no shader. This is the only place the watch appears inside the app. The light sits between the frame and a cut-out
// of the watch, so it glows behind the watch, never over it.
export function Entry() {
  return (
    <div className="pq-night pq-entry-bg" aria-hidden="true">
      <div className="pq-entry-shot">
        <picture>
          <source media="(max-aspect-ratio: 9/10)" srcSet="/media/film/watch/tall-poster.jpg" />
          <img src="/media/film/watch/poster.jpg" alt="" width={1920} height={1200} decoding="async" fetchPriority="high" />
        </picture>
        <div className="pq-entry-light" />
        <picture>
          <source media="(max-aspect-ratio: 9/10)" srcSet="/media/film/watch/cut-tall.webp" />
          <img src="/media/film/watch/cut-wide.webp" alt="" width={1920} height={1200} decoding="async" />
        </picture>
      </div>
    </div>
  );
}
