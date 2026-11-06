# Spike S9: can a coach use PitchIQ on a tablet during games?

Spec: "Unknowns and spikes" S9 and the NCAA risk. Research from public sources on Nov 6, 2026. This isn't legal or
compliance advice: RIT's compliance office and the conference office have the final word. The rule-book text itself
wasn't checked. The college finding rests on NCAA announcements and the published rule-change summary.

## What the sources say

**College (NCAA).**
- Since the 2025 season, an "exclusively one-way electronic communication device" may relay the pitch or play call:
  from the dugout, from the coaches' boxes, or from a position player. In-ear devices are for the catcher only
  (2025-26 rules changes, Rule 5-16 Note 1).
- The NCAA's announcement of that rule says "any other electronic devices (such as tablets) being used during a game"
  get the violator and the head coach ejected, plus a one-game suspension.
- The published rules-change summary gives the penalty as a warning first, then ejection. The two sources differ on the
  warning, but not on tablets being outside what's allowed.
- In August 2026, Division I also banned electronic communication with offensive players during games for 2026-27.
  Ball-strike challenges and bat sensors are optional.

**High school (NFHS).**
- Since 2024, a coach in the dugout may use a one-way device to call pitches to the catcher, and to no one else.
- Since 2015, video and replay equipment may be used for coaching during games from the dugout or another dead-ball
  area. A radar gun may be used from the dugout.
- What we found doesn't mention tablets for pitch decisions. A coach reading PitchIQ in the dugout and relaying the
  call by sign or one-way device looks consistent with these rules. State associations can add their own rules.
- A 2020 interpretation ruled illegal a phone app that predicts the opponent's signs from captured sign information.
  PitchIQ doesn't do that.

## What it means for PitchIQ (the spec's own "if banned" branch)

- **College games:** a tablet in use during an NCAA game risks ejection. For college teams, PitchIQ is for game prep,
  bullpens, scrimmages and fall ball, plus charting after the game. The spec says the site should say so.
- **High school:** in-game use looks allowed. The site's dugout copy fits high school, with a note to check the state
  association's rules.
- **Already done:** the Terms (D15 draft) say following league device rules is the team's responsibility, and that
  PitchIQ works for bullpens, scrimmages and prep.

## Proposed for Drew (not changed on the site yet)

1. Add a FAQ entry: "Can I use it in college games? NCAA rules don't allow tablets during games, so college teams use
   PitchIQ for game prep, bullpens, scrimmages and fall ball. High school rules allow a one-way device to the catcher;
   check your state association."
2. Keep the landing page's dugout language, aimed at high school and travel ball.
3. Ask RIT compliance whether any in-game use is allowed, and whether a scrimmage counts as a "game" under 5-16.

## Sources

- [NCAA 2025-26 baseball rules changes (PDF)](https://ncaaorg.s3.amazonaws.com/championships/sports/baseball/rules/2025-26PRMBA_RulesChanges.pdf)
- [NCAA: committees propose expanded use of one-way communication](https://www.ncaa.org/news/media-center-expanded-use-of-one-way-communication-proposed-in-baseball/)
- [Expanded use of one-way communication approved in NCAA baseball (Sept 30, 2024)](https://highlandcountypress.com/sports/expanded-use-one-way-communication-approved-ncaa-baseball)
- [NCAA: technology rules approved for baseball (Aug 2026)](https://www.ncaa.org/news/technology-rules-approved-for-baseball/)
- [NFHS rule change allows coach-catcher devices in high school baseball](https://wrtv.com/sports/rule-change-allows-electronic-communication-devices-between-coaches-and-catchers-in-high-school-baseball)
- [NFHS baseball rules revisions (compiled)](https://stevetheump.com/NFHS_rules.htm)
