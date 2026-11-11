// Questions coaches ask. Native details/summary, so it works without script and with the keyboard.
const FAQ = [
  {
    q: "Can I use it during games?",
    a: "Rules differ by level. High school follows the NFHS and your state association; college follows NCAA Rule 5-16 on electronic devices. Check with your state association or compliance office before using a tablet in the dugout. Game prep, bullpens and scrimmages are fine anywhere.",
  },
  {
    q: "Does it work without a signal?",
    a: "Yes. Download the game plan on Wi-Fi and the iPad calls the whole game on its own. Everything syncs when you're back online.",
  },
  {
    q: "Do my players need accounts?",
    a: "No. A coach can enter the staff and call a game alone. Players and parents can join later to see their own stats.",
  },
  {
    q: "Do I need a TrackMan or Rapsodo?",
    a: "No. Your own grades for each pitch are enough to start. Files from either one sharpen its read of velocity, pitch shape and arm slot when you have them.",
  },
  {
    q: "Is it just going to call fastballs?",
    a: "No. It draws every call from a mix of the reasonable options, so the same count doesn't always get the same pitch, and it follows what each pitcher actually has working that day.",
  },
  {
    q: "Who builds PitchIQ?",
    a: "A college pitcher studying mechanical engineering, who checks every call against how a pitching coach would think about it.",
  },
];

export function Faq() {
  return (
    <section className="mk-fq" id="faq" aria-labelledby="fq-h">
      <div className="mk-wrap mk-fq-grid">
        <div className="mk-sec-head">
          <h2 id="fq-h">Questions from coaches</h2>
          <p>Anything else? <a className="mk-link" href="#contact">Ask us directly</a> and we'll write back.</p>
        </div>
        <div className="mk-fq-list">
          {FAQ.map((f, n) => (
            <details key={f.q} className="mk-fq-item" open={n === 0}>
              <summary><span>{f.q}</span><i aria-hidden="true" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
