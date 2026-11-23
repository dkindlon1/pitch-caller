#!/bin/bash
# Manufacturing outputs from the routed board, with KiCad's own exporter. Run after gen_pcb.py finish.
cd "$(dirname "$0")/.." || exit 2
B=kicad/pitchiq_watch.kicad_pcb; G=out/fab/gerber; rm -rf "$G"; mkdir -p "$G"
kicad-cli pcb export gerbers -o "$G/" --layers F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts,F.Fab,B.Fab "$B" || exit 1
kicad-cli pcb export drill -o "$G/" --format excellon --excellon-separate-th --generate-map --map-format gerberx2 "$B" || exit 1
kicad-cli pcb export pos -o out/fab/pitchiq_watch-pos.csv --format csv --units mm --side both "$B" || exit 1
kicad-cli pcb export svg -o out/board_top.svg --layers F.Cu,F.Fab,Edge.Cuts,Dwgs.User,Cmts.User --exclude-drawing-sheet --page-size-mode 2 "$B" || exit 1
kicad-cli pcb export svg -o out/board_bottom.svg --layers B.Cu,B.Fab,Edge.Cuts,Eco1.User --mirror --exclude-drawing-sheet --page-size-mode 2 "$B" || exit 1
ls "$G" | wc -l
