// Every pitcher gets his own page: shown as one picture of that page, full of his numbers, for a made-up pitcher shaped
// like the site's sample starter (fastball 86, slider 77, changeup 78), labelled as a sample. The figures are the ones
// the portal's pitcher page shows (app/_uploads/stats-panel.tsx: by pitch, by hitter side, usage by count; the uploads'
// velocity and movement; the learned page's expected strikes next to his grades). "What happened next" (how his at-bats
// ended after a strike or a ball in a count) comes from what every saved pitch already records (pc_pitch_rows' pa_end
// and out); the portal doesn't show it yet.

const FB = "var(--mk-fb)", SL = "var(--mk-sl)", CH = "var(--mk-ch)";

const TOP: [string, string][] = [
  ["412", "Game pitches"],
  ["61%", "Strikes"],
  ["26%", "Whiffs per swing"],
  ["37%", "K with two strikes"],
  ["20%", "Hard contact"],
];

const PITCHES = [
  { name: "Fastball", c: FB, velo: "86.1", move: "17 in. ride, 9 in. run", strike: 64, whiff: 19, hard: 24 },
  { name: "Slider", c: SL, velo: "77.4", move: "2 in. drop, 4 in. sweep", strike: 61, whiff: 34, hard: 14 },
  { name: "Changeup", c: CH, velo: "78.0", move: "8 in. ride, 14 in. fade", strike: 52, whiff: 29, hard: 18 },
];

// fastball / slider / changeup share in each count
const USAGE: [string, number, number, number][] = [
  ["0-0", 62, 24, 14], ["1-0", 66, 18, 16], ["2-0", 74, 12, 14], ["3-0", 92, 4, 4],
  ["0-1", 48, 34, 18], ["1-1", 50, 30, 20], ["2-1", 60, 22, 18], ["3-1", 76, 12, 12],
  ["0-2", 34, 46, 20], ["1-2", 36, 44, 20], ["2-2", 42, 38, 20], ["3-2", 58, 26, 16],
];

const VELO = [85.2, 85.6, 85.9, 86.3, 85.8, 86.4, 86.1, 86.6];   // fastball average, last eight outings

const SIDES: [string, number, number][] = [["Same-side hitters", 63, 28], ["Opposite-side hitters", 59, 23]];

const LEARNED: { name: string; c: string; exp: number; got: number; grade: string }[] = [
  { name: "Fastball", c: FB, exp: 63, got: 64, grade: "Holds at 4" },
  { name: "Slider", c: SL, exp: 57, got: 61, grade: "Up, 3.5 to 4" },
  { name: "Changeup", c: CH, exp: 58, got: 52, grade: "Down, 3 to 2.5" },
];

// after a strike vs after a ball, in one count: the share of his at-bats that ended in an out
const NEXT: { when: string; pitch: string; c: string; strike: number; ball: number }[] = [
  { when: "First pitch", pitch: "Any pitch", c: "var(--mk-chalk)", strike: 70, ball: 59 },
  { when: "2-1 count", pitch: "Fastball", c: FB, strike: 69, ball: 52 },
  { when: "1-1 count", pitch: "Slider", c: SL, strike: 72, ball: 57 },
];

function Velo() {
  const W = 260, H = 96, lo = 84.8, hi = 86.9;
  const x = (i: number) => 8 + (i / (VELO.length - 1)) * (W - 16), y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 22);
  const d = VELO.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mk-sb-velo" aria-hidden="true">
      <path d={`${d}L${x(VELO.length - 1)} ${H}L${x(0)} ${H}Z`} className="a" />
      <path d={d} className="l" />
      {VELO.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === VELO.length - 1 ? 4 : 2.4} className={i === VELO.length - 1 ? "p on" : "p"} />)}
    </svg>
  );
}

export function Program() {
  return (
    <section className="mk-pg" id="program" aria-labelledby="pg-h">
      <div className="mk-wrap mk-pg-head">
        <h2 id="pg-h">Every pitcher gets his own page</h2>
        <p>His numbers from every pitch you call and every bullpen file he brings. Coaches see the whole staff. Teammates never see each other&apos;s.</p>
      </div>

      <div className="mk-wrap">
        <figure className="mk-sb" aria-label="A sample pitcher's page in PitchIQ">
          <div className="mk-sb-board">
            <header className="mk-sb-who">
              <span className="mk-sb-num">17</span>
              <div><b>Sample pitcher</b><span>Right-handed starter, three-quarter slot</span></div>
              <span className="mk-sb-meta">8 outings, 3 bullpen files</span>
            </header>

            <dl className="mk-sb-top">
              {TOP.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
            </dl>

            <div className="mk-sb-grid">
              <section className="mk-sb-card mk-sb-pitches">
                <h3>By pitch</h3>
                <table>
                  <thead><tr><th scope="col">Pitch</th><th scope="col">Strikes</th><th scope="col">Whiff</th><th scope="col">Hard</th></tr></thead>
                  <tbody>
                    {PITCHES.map((p) => (
                      <tr key={p.name}>
                        <th scope="row"><i style={{ background: p.c }} /><span><b>{p.name}</b><small>{p.velo} mph, {p.move}</small></span></th>
                        <td>{p.strike}%</td><td>{p.whiff}%</td><td>{p.hard}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="mk-sb-card mk-sb-usage">
                <h3>Usage by count</h3>
                <div className="mk-sb-counts">
                  {USAGE.map(([n, f, s, c]) => (
                    <div key={n} title={`${n}: fastball ${f}%, slider ${s}%, changeup ${c}%`}>
                      <span className="mk-sb-bar"><i style={{ height: `${c}%`, background: CH }} /><i style={{ height: `${s}%`, background: SL }} /><i style={{ height: `${f}%`, background: FB }} /></span>
                      <small>{n}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mk-sb-card mk-sb-trend">
                <h3>Fastball velocity</h3>
                <p className="mk-sb-big">86.6<small> mph</small></p>
                <Velo />
                <p className="mk-sb-sub">Last 8 outings, from his TrackMan files</p>
              </section>

              <section className="mk-sb-card mk-sb-sides">
                <h3>By hitter side</h3>
                {SIDES.map(([s, st, wh]) => (
                  <div key={s} className="mk-sb-side"><span>{s}</span><b>{st}%</b><small>strikes</small><b>{wh}%</b><small>whiff</small></div>
                ))}
              </section>

              <section className="mk-sb-card mk-sb-learned">
                <h3>What the engine learned</h3>
                <table>
                  <thead><tr><th scope="col">Pitch</th><th scope="col">Expected strikes</th><th scope="col">Actual</th><th scope="col">His grade</th></tr></thead>
                  <tbody>
                    {LEARNED.map((r) => (
                      <tr key={r.name}>
                        <th scope="row"><i style={{ background: r.c }} />{r.name}</th>
                        <td>{r.exp}%</td>
                        <td className={r.got > r.exp + 1 ? "up" : r.got < r.exp - 1 ? "down" : ""}>{r.got}%</td>
                        <td>{r.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="mk-sb-card mk-sb-next">
                <h3>What happened next</h3>
                <p className="mk-sb-sub">How his at-bats ended after a strike, and after a ball</p>
                <div className="mk-sb-nexts">
                  {NEXT.map((x) => (
                    <div key={x.when} className="mk-sb-nx">
                      <p className="mk-sb-nxh"><b>{x.when}</b><span><i style={{ background: x.c }} />{x.pitch}</span></p>
                      <div className="mk-sb-nxrow"><span>For a strike</span><span className="mk-sb-nxbar"><i style={{ width: `${x.strike}%` }} /></span><b>{x.strike}%</b></div>
                      <div className="mk-sb-nxrow is-ball"><span>For a ball</span><span className="mk-sb-nxbar"><i style={{ width: `${x.ball}%` }} /></span><b>{x.ball}%</b></div>
                      <p className="mk-sb-nxs">ended in an out, {x.strike - x.ball} points better after the strike</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
          <figcaption>A sample pitcher, not a real player.</figcaption>
        </figure>
      </div>
    </section>
  );
}
