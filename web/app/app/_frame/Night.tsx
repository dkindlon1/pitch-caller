// The ballpark at night behind every signed-in screen (the hero film's first frame), graded black and white in CSS.
// The glass needs real light behind it to blur; flat black would leave it showing nothing.
export function Night() {
  return (
    <div className="pq-night" aria-hidden="true">
      <picture>
        <source media="(orientation: portrait)" srcSet="/media/film/flyover/tall-poster.jpg" />
        <img src="/media/film/flyover/wide-poster.jpg" alt="" width={1280} height={720} decoding="async" fetchPriority="low" />
      </picture>
    </div>
  );
}
