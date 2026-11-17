// The light behind every signed-in screen: the public site's Floodlight atmosphere (the ground, one large soft midnight
// light, a faint blue glow), drawn once in CSS (.pq-night in app/portal.css). The glass needs real light behind it to
// blur; flat black would leave it showing nothing. No image, no script, nothing that moves.
export function Night() {
  return <div className="pq-night" aria-hidden="true" />;
}
