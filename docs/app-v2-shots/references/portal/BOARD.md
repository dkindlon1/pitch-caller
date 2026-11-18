# Board B: premium dark dashboards, glass, tables, setup flows

Captured headless Chromium, 1440x900, DPR 1, top of page only. Fonts/colours are the computed values of the first heading and of `body`.

## Linear
- Linear, https://linear.app/
- Screenshot: C:/dev/pitch-caller-shots/references/portal/linear-app.png
- Fonts/colours: heading "Inter Variable" (first h1); body "Inter Variable"; body bg rgb(8,9,10); body color rgb(247,248,248)
- Technique: the product window mock uses a left sidebar list with a single highlighted row ("Faster app launch" under Favorites), and a right-hand properties column of small labels next to values with small status glyphs.

## Raycast
- Raycast, https://www.raycast.com/
- Screenshot: C:/dev/pitch-caller-shots/references/portal/raycast-com.png
- Fonts/colours: heading "Inter" (first h1 "Your shortcut to everything."); body "Inter"; body bg rgb(7,8,10); body color rgb(255,255,255)
- Technique: the nav sits in a rounded bar with a thin border and small grey links; a large bold headline is centred over a blurred, saturated gradient.

## Stripe payments
- Stripe, https://stripe.com/payments
- Screenshot: C:/dev/pitch-caller-shots/references/portal/stripe-com-payments.png
- Fonts/colours: heading "sohne-var" (the first heading element has no text, so this is the fallback heading); body "sohne-var"; body bg rgb(246,249,252); body color rgb(66,84,102)
- Technique: the setup-flow card shows the selected plan radio option with a purple outline and a light fill, a row of payment-method tiles with the selected one outlined, and a right-hand summary column with check icons and a total line.

## Notion product
- Notion, https://www.notion.com/product
- Screenshot: C:/dev/pitch-caller-shots/references/portal/notion-com-product.png
- Fonts/colours: heading "NotionInter" (first h1 "Where teams and agents Ship together."); body "NotionInter"; body bg rgb(255,255,255); body color rgba(0,0,0,0.95)
- Technique: the kanban board uses column headers with coloured status dots and a small count next to each label ("To-do 10", "Complete 34"); cards are plain white rows with generous padding.

## shadcn dashboard example
- shadcn/ui, https://ui.shadcn.com/examples/dashboard
- Screenshot: C:/dev/pitch-caller-shots/references/portal/ui-shadcn-com-examples-dashboard.png
- Fonts/colours: heading "Geist" (first h1 is the docs-site hero, not the example); body "Geist"; body bg transparent; body color rgb(0,0,0)
- Technique: the four KPI cards put a small label on top, a large number below, and a small outlined pill with an arrow and percentage in the top-right corner; a delta line sits under each figure.

## shadcn tasks example
- shadcn/ui, https://ui.shadcn.com/examples/tasks
- Screenshot: C:/dev/pitch-caller-shots/references/portal/ui-shadcn-com-examples-tasks.png
- Fonts/colours: heading "Geist" (docs-site hero, as above); body "Geist"; body bg transparent; body color rgb(0,0,0)
- Technique: the task table has a checkbox column, rows about 49px tall with thin dividers, and an outlined "Status" and "Priority" filter pill above it; each status and priority cell pairs a small icon with a label.

Rejected: Linear features (dark, but only icon tiles at the top, no UI visible), Vercel (light marketing hero, no UI), Arc (farewell page, no UI). 6 of 9 kept.

## Second session (Nov 17), live look in Chrome
- Vercel Geist, Table: https://vercel.com/geist/table (read from the live page's computed styles, no screenshot kept). Header cells 36 px tall, muted grey (rgb 161 161 161), 8 px side padding; body rows 40 px, 10 px vertical padding, no row rules (zebra instead).
  - Technique worth learning: headers a step quieter and shorter than rows, so the eye lands on the data.
  - Against ours: our rows are taller (49 px, roomy tables 57 px) with hairlines, which suits touch on an iPad; our headers already use the quieter tone. Kept ours; took nothing new.
- Settings pages (Linear, Vercel, from the earlier board): label and help on the left, control on the right, one setting per row -> `.shell-form.rows` on Settings and Profile; a sticky side form -> `.pq-cols` on Staff, Billing, Opponent.
- Still thin: no live sports-dashboard product UI was studied (TrackMan, Rapsodo, Hawk-Eye and Whoop sit behind sign-in).
