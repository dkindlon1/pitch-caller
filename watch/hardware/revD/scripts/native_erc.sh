#!/bin/bash
# KiCad 7 has no command-line ERC, so this drives the real schematic editor's "Electrical Rules Checker" dialog on a virtual
# screen (Xvfb + xdotool) and saves its report. Click positions are for a 1600x1000 screen and KiCad 7.0.11's default layout;
# if KiCad's first-run dialog appears (fresh machine) the run fails: open eeschema once by hand first.
cd "$(dirname "$0")/.." || exit 2
W=/tmp/pq_erc; rm -rf $W; mkdir -p $W; cp kicad/pitchiq_watch.kicad_sch kicad/pitchiq_watch.kicad_pro kicad/PQ.kicad_sym kicad/sym-lib-table $W/
pkill -f "eeschema pitchiq_watch" 2>/dev/null; pgrep -f "Xvfb :77" >/dev/null || (Xvfb :77 -screen 0 1600x1000x24 >/dev/null 2>&1 &)
sleep 2; export DISPLAY=:77
(cd $W && eeschema pitchiq_watch.kicad_sch >/dev/null 2>&1 &)
for i in $(seq 1 40); do xdotool search --name "Schematic Editor" >/dev/null 2>&1 && break; sleep 1; done; sleep 4
xdotool mousemove 205 12 click 1; sleep 2; xdotool mousemove 280 38 click 1; sleep 3      # Inspect > Electrical Rules Checker
xdotool search --name "Electrical Rules Checker" >/dev/null 2>&1 || { echo "ERC dialog did not open"; exit 1; }
xdotool mousemove 924 540 click 1; sleep 8                                                # Run ERC
xdotool mousemove 924 492 click 1; sleep 3; xdotool key Return; sleep 3                   # Save... (default name ERC.rpt)
pkill -f "eeschema pitchiq_watch" 2>/dev/null
[ -s $W/ERC.rpt ] || { echo "no ERC report written"; exit 1; }
cp $W/ERC.rpt out/erc_report_kicad.txt; tail -1 out/erc_report_kicad.txt
