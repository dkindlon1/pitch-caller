# Watch enclosure research (revC): prototype and production routes

Date: 2026-11-23. Research only. Nothing here was built, printed, tested or quoted by a vendor.

## Legend
- **SEEN** = read on a page I fetched this session; URL beside it.
- **PUBLISHED RANGE** = a range printed on a vendor or blog page. It is not a quote for this part.
- **ESTIMATE** = my own judgment or arithmetic. The basis is stated.
- **NOT FOUND** = I looked and the page did not say, or the page would not fetch.
- Several fetches returned the answer of a small summarising model, not raw page text. Where a table was garbled I say so. Check any number you will design to against the original page.

## Fetches that failed or came back empty
- jlc3dp.com help article (first URL tried) and protolabs.com 3D design-guidelines page: client error. I used the JLC3DP 212 article and the Hubs and Protolabs-nylon pages instead.
- ISO 22810 (ANSI preview): only front matter and table of contents, no test parameters.
- Parker O-Ring Handbook: the PDF redirected, and the mirror I fetched was cut off before the static gland tables. I used Apple Rubber's gland tables instead.
- Stanley Engineered Fastening plastics guide: page returned only metadata.
- Instant-quote pages (JLC3DP, PCBWay, Xometry, Protolabs, Craftcloud) need an uploaded CAD file. No quote for this part could be obtained.
- Alibaba cover-glass listings: search hits only, no listing fetched. Price and MOQ NOT FOUND, apart from the sapphire listing below.
- Button-boot and O-ring-plunger design sources: search hits only, nothing fetched. Section 4 has no sourced design rules for the button.

---

## 1. Prototype case manufacturing

### 1.1 Process and vendor data (SEEN)

| Item | SLA resin | MJF / SLS PA12 | FDM | CNC |
|---|---|---|---|---|
| JLC3DP min wall | 0.5 mm at 5x5 mm; 0.8 mm at 10x10 mm | 1.0 mm at 5x5; 1.2 mm at 10x10 | 1.6 mm at 50x50 | not on page |
| JLC3DP tolerance | ±0.2 mm (<100 mm); holes ±0.3 | ±0.3 mm (<100 mm); holes ±0.3 | ±0.3 mm; holes ±0.4 | not on page |
| JLC3DP min hole / feature | hole 1.0 mm dia; emboss 0.8 x 0.8 mm | hole 1.5 mm dia; column 2.0 mm | hole 1.5 mm | not on page |
| Hubs (Protolabs Network) min wall, supported / free | 0.5 / 1.0 mm | MJF 0.7 / 1.0 mm; SLS 0.8 / 1.0 mm | 0.8 / 0.8 mm | not given |
| Hubs tolerance | ±0.3% (floor ±0.3 mm) | ±0.3% (floor ±0.3 mm) | ±0.5% (floor ±0.5 mm) | not given |
| Stratasys Direct (MJF nylon) | n/a | wall 0.5 mm min; ±0.25 mm; Ra 125-250 µin (about 3.2-6.4 µm); min feature 0.5 mm | n/a | n/a |
| Protolabs nylon page | n/a | min wall 0.508 mm MJF, 0.762 mm SLS; no tolerances on page | n/a | n/a |
| Xometry MJF | n/a | prototype orders ±0.70 mm under 30 mm; engineer-reviewed orders ±0.25 mm XY, ±0.42 mm Z under 30 mm; min feature 0.020 in (0.040 in recommended) | n/a | n/a |
| PCBWay FDM page | n/a | n/a | ±0.2 mm under 100 mm; min wall 1.5 mm | n/a |
| Protolabs CNC milling | n/a | n/a | n/a | ±0.005 in (±0.13 mm) automated; features thicker than 0.020 in (0.51 mm); nominal thickness at least 0.040 in (1.02 mm); min part 6.35 x 6.35 mm |

Sources:
- JLC3DP guideline: https://jlc3dp.com/help/article/212-3D-Printing-Design-Guideline
- JLC3DP capabilities: https://jlc3dp.com/capabilities/3d-printing-service
- Hubs wall table: https://www.hubs.com/knowledge-base/dfm-tips-for-3d-printed-parts-with-thin-walls/
- Hubs tolerances: https://www.hubs.com/3d-printing/dimensional-accuracy/
- Stratasys MJF guide: https://www.stratasys.com/siteassets/sdm/content---website-storage/design-guides/dg_mjf_stratasys_direct_03062023.pdf
- Protolabs nylon: https://www.protolabs.com/resources/design-tips/how-to-design-for-nylon-3d-printing/
- Xometry MJF: https://www.xometry.com/capabilities/hp-multi-jet-fusion/
- PCBWay FDM: https://www.pcbway.com/rapid-prototyping/3d-printing/3d-printing-FDM.html
- Protolabs CNC: https://www.protolabs.com/services/cnc-machining/cnc-milling/design-guidelines/

Other SEEN notes:
- JLC3DP recommends walls "more than 1.5mm" for protrusions, positioning features, snaps and fasteners.
- JLC3DP says its tolerances assume no oil spray or paint.
- JLC3DP resin tolerance changes with time: 0.15 mm or 0.15% at 1-3 days, 0.20 mm or 0.20% at 3-7 days.
- JLC3DP finishes: sanding, sandblasting, spray paint, dye, oil spray (gloss, on 8001 and Full Color resins), mineral-oil spray (matte, on black resins). Threaded inserts are offered in M3, M4 and M5 only. That makes M1.4 / M1.6 inserts not available there.
- JLC3DP lead time is 48-120 h.
- JLC3DP materials include PA12-HP, PA11-HP and 3201PA-F nylons and 8001 / 9600 SLA resins.
- PCBWay CNC page lists ABS, PC, POM-C and aluminium. It gives no tolerance or min-wall data. Source: https://www.pcbway.com/rapid-prototyping/cnc-faq.html
- PCBWay wall-thickness help page keeps its numbers in an image: NOT FOUND in text. Source: https://www.pcbway.com/helpcenter/3d_engineering_questions/Wall_thickness_issue.html
- Craftcloud, Protolabs 3D print and Xometry CNC: no tolerance or min-wall pages fetched. NOT FOUND (Protolabs nylon walls and Xometry MJF numbers above are the exceptions).

### 1.2 Prices AS SEEN

- **JLC3DP front page "From" prices:** SLA from $0.30 (2-day build), MJF nylon from $1.00 (3-day), CNC from $5.00 (3-day). The page does not say per part or per order, and gives no minimum order and no example for a part this size. Source: https://jlc3dp.com/
  - These are floors, not a price for a watch case.
- **PCBWay general ordering rules:** minimum order $25 excluding shipping; startup fee "normally $5-20" per material per order; per-part fee "normally less than $1" and higher for complex parts. Source: https://www.pcbway.com/rapid-prototyping/cnc-faq.html
  - The page says this is for 3D printing and general ordering, not CNC-specific.
- **PCBWay CNC:** "$25 SALE" banner; no starting price. Source: https://www.pcbway.com/rapid-prototyping/
- **Protolabs 3D printing, Xometry (MJF, CNC), Craftcloud:** no per-gram or per-part pricing for this part. NOT FOUND (instant quote needs CAD).
- **Craftcloud / Xometry / Protolabs comparison from All3DP (PA12 MJF, other sizes):**
  - 92 x 15 x 19 mm, qty 300, PA12 vapour-smoothed and dyed: Craftcloud $982.73, Xometry $2,490, Protolabs $4,209 (about $3.28, $8.30 and $14.03 per piece by my arithmetic).
  - Qty-1 cup holder in PA12 polished: Craftcloud $62.65, Xometry $106.53, Protolabs $297.10.
  - The article does not mention JLC3DP and gives no size for the cup holder. These are different parts, not this one.
  - Source: https://all3dp.com/1/mjf-3d-printing-price-comparison-charts-5-sample-projects/
- **Per-part price of a roughly 36 x 42 x 11 mm case set at any vendor: NOT FOUND.** The cost table in section 8 uses ESTIMATES.

### 1.3 Metal near the antenna

- The only fetched source on clearance is a community reply on Nordic DevZone: keep metal more than 5 mm from the antenna, because you "can't compensate for detuning of the antenna by nearby metal." It is a single reply, over five years old, not an official Nordic figure. Source: https://devzone.nordicsemi.com/f/nordic-q-a/71797/placement-of-nrf-module-inside-enclosure-with-surrounding-metal-components
- NOT FOUND: a fetched source describing what watch makers usually do. I did not fetch the Microchip or Infineon placement guides that came up in search.
- ESTIMATE (my judgment, not sourced): if aluminium is used, the common approach is to keep metal away from the antenna end, for example a plastic or ceramic cap or a plastic top at the 12 o'clock end, and then verify with a Bluetooth range test. A full aluminium case at the chip antenna end is not recommended for revC.

### 1.4 Recommendation for prototypes

**Recommended: MJF PA12 nylon (JLC3DP or Craftcloud) for the first fit and ergonomics builds, with 1.2-1.5 mm walls and lug walls at least 1.5 mm.** Why (my reasoning, using the sourced limits above):
- JLC3DP's MJF minimum wall of 1.2 mm at 10x10 mm and Hubs' 1.0 mm free-standing both sit at or below the 1.0-1.5 mm design walls. SLA is thinner-capable but its resin is generally more brittle. That is my judgment, not a fetched statement.
- JLC3DP's 1.5 mm minimum hole in MJF means a spring-bar pin hole has to be printed oversize or drilled after printing. Spring-bar tip diameters were not checked.
- Nylon needs no support removal inside a small case.
- Cost is the lowest of the options (floor $1.00 on the JLC3DP page).
- Plastic everywhere keeps the antenna end clear.

**Printed tolerances are too loose for an O-ring groove.**
- MJF is ±0.25 to ±0.30 mm at JLC3DP and Stratasys; Xometry's prototype tier is ±0.70 mm under 30 mm.
- Apple Rubber's static gland for a 0.040 in cross section has a depth of only 0.027-0.030 in (0.69-0.76 mm), a window of about 0.07 mm.
- A groove printed to ±0.3 mm cannot hold that window. This is my arithmetic on the sourced numbers.
- For a waterproof test unit use CNC POM-C or PC (±0.13 mm at Protolabs, the best seen) on the sealing faces, or a compressible flat gasket with a hard stop. Neither route is a sourced recommendation.

**Resin SLA (JLC3DP 8001 / 9600, ±0.2 mm)** is the option for window-seat and bezel fit pieces if you want a smoother surface. It would need a coat for sweat and UV (not sourced).

**FDM** is not recommended: 1.5-1.6 mm minimum walls (PCBWay, JLC3DP) and the coarsest tolerances.

**CNC aluminium** is not recommended for revC because of the antenna (above).

---

## 2. Production: injection moulding

### 2.1 Tooling and per-part figures (all PUBLISHED RANGES, not quotes)

| Source | Tooling | Per-part and volume notes |
|---|---|---|
| Protolabs injection moulding page | moulds "start at $1,495"; no upper bound | no per-part price; prototype moulds guaranteed at least 2,000 shots; on-demand moulds for lifetime volumes above 2,000. Source: https://www.protolabs.com/services/injection-molding/ |
| Protolabs cost article | no dollar figures | says moulds for as few as 25 pieces. Source: https://www.protolabs.com/resources/design-tips/11-tips-to-reduce-injection-molding-costs/ |
| Xometry cost article | mid-level order (1,000-2,000 small parts) up to $10,000; complex up to $100,000 | no per-part prices. Source: https://www.xometry.com/resources/injection-molding/injection-molding-cost/ |
| Fathom | no dollar figures | rapid tool 5,000 shots, 1.5-3 wk; prototype tool 5,000-50,000 shots, 2-4 wk; production tool 5-10 wk. Source: https://fathommfg.com/?p=9191 |
| RapidDirect | aluminium (500-10,000 shots) $2,000-5,000+; P20 steel $5,000-25,000+ | no per-part prices. Source: https://www.rapiddirect.com/blog/injection-molding-costs/ |
| Formlabs | aluminium mould for about 1,000-5,000 units $2,000-5,000; simple SLA moulds as little as $100 | hypothetical small enclosure: 5,000 units with a $3,000 aluminium mould, total $13,000, $2.60 per part. Source: https://formlabs.com/blog/injection-molding-cost/ |
| Chinese toolmakers (dev.to article, Shenzhen/Dongguan "ballpark") | single-cavity P20 $4,000-10,000; multi-cavity or hardened $12,000-30,000+ | example $8,000 mould, part $1.20; the article's amortised totals are $9.20 at 1,000 units and $2.00 at 10,000 (the article's example, not a quote). Source: https://dev.to/china-sourcing-agents/injection-mold-tooling-costs-for-electronics-enclosures-16dl |
| LAN PDT low-volume page | $3,000-12,000 (ABS or PP, reviewed design) | $0.60-4.00 per part; break-even against printing about 400-800 units; each undercut/slide adds $800-2,500. Source: https://lanpdt.com/low-volume-injection-molding-cost/ |
| Get It Made (UK) small-part example | £3,816 for Nylon, ABS and PC alike | 500 pcs: £0.29-0.32 per part (£7.92-7.95 with tooling); 5,000 pcs: £0.12-0.15 (£0.88-0.91 with tooling). The page does not define "small part". Source: https://get-it-made.co.uk/resources/how-much-injection-moulding-costs |
| Maketime case studies | 5-inch cored cube from about $6,600 | $25 per part at 1,024 units; urethane casting competitive at about 30-50 parts; injection moulding reaches low unit cost by about 250 units for a 6-inch radio. Source: https://maketime.io/resources/injection-molding/thinking-in-scale-3-case-studies-comparing-cost-vs-quantity/ |

- Protolabs wall ranges: ABS 1.143-3.556 mm, polycarbonate 1.016-3.81 mm, nylon 0.762-2.921 mm. Draft 0.5° on vertical faces, 2° in most situations. No glass-filled nylon range on the page. Source: https://protolabs.com/services/injection-molding/plastic-injection-molding/design-guidelines
- Rex Plastics was not fetched except as quoted in the Xometry article, which gives only resin prices: ABS $1.30, PP $0.90, PC $2.30 per lb, 2020 data. ICOMold: no page fetched. Glass-filled nylon per-part price: NOT FOUND.

### 2.2 What this implies for a two-part case (ESTIMATE)
- A top and a back are two cavities. They can be a two-cavity family tool, or two single-cavity tools. Tooling for the pair at the published single-cavity aluminium or P20 ranges: about $4,000-24,000 (ESTIMATE, doubling the $2,000-12,000 single-tool ranges above). That excludes the window, silicone gasket and button cap. A side USB-C opening and lug features may need side actions at $800-2,500 each (LAN PDT).
- Per part at 500 and 5,000: the only fetched numbers are £0.29-0.32 and £0.12-0.15 (Get It Made) and $0.60-4.00 (LAN PDT). A 36 x 42 x 11 mm case half is small, but I have no quote. Treat $0.50-4.00 per half as an ESTIMATE.

### 2.3 Low-volume alternatives
- **Urethane / vacuum casting:** mould roughly $200-1,000, per part roughly $10-100, a standard silicone mould about 50 casts, HTV rubber moulds 300-500; recommended wall 1.5-4 mm, absolute minimum 1 mm (Formlabs). Source: https://formlabs.com/eu/blog/vacuum-casting-urethane-casting-polyurethane-casting/. The Xometry urethane cost page had no figures: https://www.xometry.com/resources/casting/urethane-casting-cost-calculator/
- **MJF as production:** the All3DP comparison above gives $3.28-14.03 per piece at 300 for a 92 x 15 x 19 mm part (my arithmetic). A watch case half is smaller, but no quote.

---

## 3. Window / lens (about 28 x 32 mm)

### 3.1 Materials (SEEN)
| Material | Thickness / availability | Scratch | Impact | Source |
|---|---|---|---|---|
| PMMA (acrylic) | Pololu laser cutting lists only 3 mm and 6 mm acrylic (too thick for a 10-11 mm case with a 0.74 mm LCD) | pencil hardness "4H to 5H" (Piedmont); Mohs about 3-4, soft, scratches accumulate (Monochrome). The two scales are not comparable. | shatter-resistant, bends; better than glass, below PC | https://www.piedmontplastics.com/blog/scratch-resistant-plastics ; https://monochrome-watches.com/technical-perspective-comprehensive-guide-to-watch-crystals-plexiglass-mineral-hesalite-sapphire-crystal-history-pros-and-cons |
| Polycarbonate, uncoated | n/a | "scratches easily in its raw form" | very high | Piedmont, above |
| Hard-coated polycarbonate | McMaster "scratch-, UV- and impact-resistant" PC: 1/16 in (1.59 mm) sheets, 12 x 36 in, $59.64, Rockwell R118, impact 16 ft·lbf/in, no cut-to-size on the page | greatly improved (Piedmont, no number) | retains PC toughness | https://www.mcmaster.com/product/8707K168/ |
| Chemically strengthened glass | Corning Gorilla Glass SR+: 0.4-2.0 mm, others on request; Vickers, stress and depth of layer not on the page. No price. | "significantly reduces visible scratches", approaching luxury cover materials | not stated on page | https://www.corning.com/microsites/csm/gorillaglass/PI_Sheets/Corning%20Gorilla%20Glass%20SR%20Plus_PI%20Sheet.pdf |
| Mineral glass (not chemically strengthened) | n/a | Mohs 5; up to 6-7 hardened | can crack under high impact | Monochrome, above |
| Sapphire | hktdc listing, rounded-rectangle smartwatch cover: MOQ 100 pcs, lead time 35 days, thickness and price NOT listed, Vickers 2000-2500 | Mohs 9, highly scratch-resistant | relatively brittle (the article's claim; a reader comment disputes it) | https://www.hktdc.com/event/hkwatchfair/en/product/1X1XK4RX |

### 3.2 Recommendation (ESTIMATE / judgment)
- **Prototype window:** laser-cut or CNC-cut hard-coated polycarbonate, or PMMA, 1.0-1.5 mm. It tolerates dirt and impact, and a field test shows what scratching looks like. Hard-coated PC scratches less than raw PC but I found no number to compare against PMMA.
- **Production window:** chemically strengthened glass (Gorilla-type, 0.4-1.0 mm) is the usual consumer-wearable choice per Corning's wearable page. Sapphire has MOQ 100, 35-day lead time and unknown price, and the sources say it is brittle at an impact angle. Neither has been tested against baseball-field dirt or impact here.
- NOT FOUND: price per piece for small-quantity custom glass cut to 28 x 32 mm. Alibaba MOQ and price: NOT FOUND.

### 3.3 Bonding (SEEN where stated)
- **3M 300LSE** acrylic adhesive transfer tapes are offered in 0.05, 0.06, 0.10, 0.13, 0.15, 0.17 and 0.20 mm thicknesses (for example 93005LE, 9472LE, 93015LE, 9495LE). It is positioned for low-surface-energy plastics with no primer. Source: https://multimedia.3m.com/mws/media/1371387O/3m-high-strength-acrylic-adhesive-300lse.pdf
  - The same datasheet lists "polycarbonate with coating" and painted or powder-coated surfaces among the hard-to-bond substrates. A hard-coated PC window therefore needs a bond test. That is my reading of the datasheet.
  - No application pressure or service temperature is given. The peel chart was garbled.
- **3M VHB 5980 (150-300 µm), 5981 (200-400 µm), 590X, 4914** are recommended in 3M's display bonding brochure. It gives no IP rating, only qualitative water and dust sealing. 3M plastic bonding adhesives 2665B and 2710 (liquid) are suggested for bond lines under 0.5 mm wide. 300LSE is not in that brochure. Source: https://multimedia.3m.com/mws/media/1674064O/3m-vhb-tape-display-bonding-brochure.pdf
- **UV glue, liquid optically clear adhesive, pressure-sensitive gasket:** NOT FOUND (no source fetched).

### 3.4 Custom-cut services and prices SEEN
- Pololu laser cutting: minimum order $25 for the first material and $15 for each extra; 3 mm acrylic cut from $0.15 per linear inch; material from $5 per sq ft; file work $60 per hour with a $15 minimum. Source: https://www.pololu.com/docs/0J24/2
  - A 28 x 32 mm rectangle has a perimeter of about 4.7 in, so the cut would cost about $0.71 (my arithmetic). The $25 minimum dominates.
- Ponoko acrylic: "from $50 for just 1" part, no minimum order quantity. The page's thickness statement is internally contradictory. Source: https://www.ponoko.com/laser-cutting/acrylic
- SendCutSend (acrylic and CNC-routed polycarbonate): pages were found in search but not fetched. NOT FOUND.

---

## 4. Sealing

### 4.1 O-ring gland data (SEEN, Apple Rubber, converted to mm by me)
Static axial (face) seal, no back-up ring. Source: https://www.applerubber.com/src/pdf/section4-seal-types-and-gland-design-tables.pdf and https://www.applerubber.com/src/pdf/table-a-static.pdf

| Cross section | Gland depth, axial | Squeeze, axial | Groove width |
|---|---|---|---|
| 0.020 in (0.51 mm) | 0.013-0.014 in (0.33-0.36 mm) | 22-41% | 0.035 in (0.89 mm) |
| 0.030 in (0.76 mm) | 0.020-0.022 in (0.51-0.56 mm) | 19-39% | 0.045 in (1.14 mm) |
| 0.040 in (1.02 mm) | 0.027-0.030 in (0.69-0.76 mm) | 19-37% | 0.060 in (1.52 mm) |
| 0.050 in (1.27 mm) | 0.034-0.038 in (0.86-0.97 mm) | 19-36% | 0.075 in (1.91 mm) |
| 0.070 in (1.78 mm) | 0.049-0.054 in (1.24-1.37 mm) | 19-33% | 0.105 in (2.67 mm) |

- The 0.020-0.030 in rows come from the second table, whose column headers were garbled. Treat their column mapping as inferred.
- The first document also gives a static squeeze of about 10-40%, says at least 75% of the cross section should sit inside the groove, and says O-ring volume should not exceed 90% of the minimum gland void.
- Parker face-seal page: for racetrack grooves, inside corner radii should be at least 3x the cross-section diameter, ideally 6x. Source: https://parker.com/promotionsite/oring-ehandbook/us/en/ehome/Face-Type-Seals
- Apple Rubber micro-ring page lists standard cross sections down to 0.008 in (0.20 mm) and 0.010 in (0.25 mm), and warns that tolerance stack-up matters more at small sizes. Its worked example has a 0.012 in stack-up on a 0.030 in seal. Source: https://www.applerubber.com/src/pdf/microrings.pdf
- Metric ISO 3601 cross sections (for example 1.0, 1.5 mm): the Apple Rubber PDF was found in search but not fetched. NOT FOUND.

### 4.2 Options for the case back (judgment / ESTIMATE, not sourced as a comparison)
- **O-ring in groove:** the best-documented option (tables above), but it needs a groove depth held to about 0.07 mm. Fine for CNC or moulded parts. Not realistic for MJF or SLA at ±0.2-0.3 mm.
- **Flat die-cut or formed-in-place gasket with screw compression:** more tolerant of printed parts if there is a hard stop. No gasket data fetched. NOT FOUND.
- **Adhesive seal (for example 3M VHB, 0.15-0.4 mm):** sealing is qualitative in 3M's brochure and the case would not be serviceable.
- For the first waterproof test unit I would use a CNC or moulded sealing face with a 1.0 mm cross-section O-ring, then confirm by testing (ESTIMATE).

### 4.3 Button and USB-C
- Silicone boot versus O-ring on a plunger shaft: NOT FOUND (search only, nothing fetched).
- Waterproof USB-C receptacle sealing (gasket or potting against the case): NOT FOUND.

### 4.4 Venting
- Gore says vents equalise pressure between the inside of an enclosure and the outside air, relieving stress on housing and seals from altitude, temperature or heavy-rain pressure changes. ePTFE vents block liquids and dust while passing water vapour, and many are rated IP67. Source: https://www.gore.com/resources/faq-gore-protective-vents
- The page does not say that a case this small needs one. Whether a 150 mAh watch case needs a vent: NOT FOUND. Gore's page also notes that sealed enclosures can still admit liquid through failed seals or by diffusion through plastic walls.

### 4.5 Test standards
- **IPX4 (SEEN, Wikipedia):** water splashed from any direction, using an oscillating fixture for 10 minutes or a spray nozzle for at least 5 minutes. No separate flow rate on the page. Source: https://en.wikipedia.org/wiki/IP_Code
- **IPX7 (SEEN, Wikipedia):** the lowest point at 1,000 mm below the surface or the highest point at 150 mm below, whichever is deeper. The duration is not on that page. Gore describes IP67 as "submersion at 1 meter for 30 minutes."
- **ISO 22810:** the table of contents lists a condensation test, water resistance tests by immersion, and a test by air overpressure; the actual test parameters are not on the ANSI preview. Source: https://webstore.ansi.org/preview-pages/ISO/preview_ISO+22810-2010.pdf
- **Casio (SEEN):** its watches are tested to DIN 8310 / ISO 22810. The bar figure "is merely a pictorial representation of the test pressure." Movement in water can create dynamic pressure "many times" the rating. Water Resist 5 bar covers washing and showering. Source: https://www.casio.com/europe/watches/technology/waterresist/
- **What a small company can test itself:** NOT FOUND in any fetched source. ESTIMATE: an unpowered dummy unit with a damp-indicator in a spray rig (IPX4 style) and a shallow dunk before any submersion test, with no claim made from either. This is my suggestion, not a standard.

---

## 5. Fasteners and assembly

### 5.1 Thread-forming screws in plastic (SEEN)
Source: Böllhoff (EJOT PT / Delta PT rules, AMTEC rules), https://media.boellhoff.com/files/pdf13/8705-self-tapping-fasteners-en.pdf. Values are multiples of nominal screw diameter d. The document has no rows for 1.4 or 1.6 mm, so applying them is my extrapolation.

| Material | Pilot hole | Boss OD | Screw-in depth |
|---|---|---|---|
| ABS, ABS/PC (EJOT PT) | 0.80 d | 2.00 d | 2.00 d |
| PC (AMTEC) | 0.85 d | 2.5 d | 2.2-2.6 d |
| PA 6 / 6.6 (EJOT) | 0.75 d | 1.85 d | 1.70 d |
| PA 6 GF (AMTEC) | 0.80 d | 2.0-2.5 d | 1.9-2.4 d |
| Delta PT (thermoplastics) | 0.8 d ±0.05 mm (up to 0.88 d for high-performance plastics) | not stated | 2 d |

Applied to the two sizes (ESTIMATE, arithmetic on the table):
- **M1.4 in ABS or ABS/PC:** pilot 1.12 mm, boss OD 2.8 mm, depth 2.8 mm.
- **M1.6 in ABS or ABS/PC:** pilot 1.28 mm, boss OD 3.2 mm, depth 3.2 mm.
- **M1.4 in PC:** pilot about 1.19 mm, boss OD 3.5 mm, depth 3.1-3.6 mm.
- **M1.6 in PC:** pilot about 1.36 mm, boss OD 4.0 mm, depth 3.5-4.2 mm.

Also SEEN:
- Delta PT pilot-hole draft at most 1°.
- The fixed ±0.05 mm tolerance is about ±3.6% at 1.4 mm.
- The source recommends screw-in tests.
- EJOT flyer, same family, gives a boss OD of 2 x d and a pilot hole of 0.7-0.8 x d, and lists nominal diameters from 1.0 mm. It states no engagement depth in text. Source: https://www.ejot.de/medias/sys_master/Industry_Flyer/Industry_Flyer/h54/h3c/9331729760286/EJOT-PT-Flyer-08.23-en.pdf
- Printed nylon: Stratasys says boss diameter should be 2-3x the insert diameter, no draft is needed, and inserts are a secondary operation with heat staking preferred (see its MJF guide above). Threads cut directly into MJF PA12 for M1.4-M1.6 screws: no source found.

### 5.2 Heat-set inserts (SEEN, SPIROL)
- Boss diameter about 2-3x the insert diameter. Hole depth is insert length plus two thread pitches. Straight holes should have no more than 1° taper. With 15% or more glass or mineral filler, enlarge the hole by 0.08 mm; at 35% or more, by 0.15 mm. The page has no M1.6 or M2 dimensions. Source: https://www.spirol.com/resources/white-papers/how-to-design-the-proper-hole-for-heat-ultrasonic-inserts/
- JLC3DP inserts: M3, M4 and M5 only.

### 5.3 Snap fits, PCB, battery, motor and display retention
- Snap fits: Stratasys says "limited use integral snap latches are possible" in MJF, with no dimensions. JLC3DP recommends walls over 1.5 mm at snaps. No cantilever strain data fetched. NOT FOUND.
- How a PCB, 150 mAh pouch cell (foam and adhesive), coin motor and display are retained: NOT FOUND in fetched sources. 3M VHB / 300LSE tapes (section 3.3) are the only retention adhesives I sourced. A pocket for the motor and a foam-and-tape pad for the battery are my ESTIMATE of common practice, not a sourced design.

---

## 6. Skin contact

- **Nickel (SEEN):** Danish EPA fact sheet: prolonged skin-contact items are limited to 0.5 µg/cm²/week of nickel release; piercing posts have a higher limit. Watches are listed among covered metal products with no separate limit. Wristwatch straps are not mentioned. Source: https://eng.mst.dk/chemicals/chemicals-in-products/chemical-legislation/fact-sheets-on-legislation/fact-sheet-nickel. ECHA and TÜV documents on EN 1811 were found in search but not fetched.
- **Withings (SEEN):** Move ECG and Move use a 316L stainless caseback and a polycarbonate case; straps are FKM, silicone, leather, recycled PET or stainless. The page states REACH, RoHS and ISO 10993 testing but no nickel figure. Source: https://support.withings.com/hc/ja/articles/360018939737-Important-information-about-materials
- **MJF PA12S biocompatibility (SEEN, Sculpteo statement):** cytotoxicity MEM grade 0, skin sensitisation grade 0 (guinea-pig maximisation test), intracutaneous irritation grade below 1, all under ISO 10993. The statement says it applies to the specific test conditions and customers must run their own assessment. It is Sculpteo's material, not JLC3DP's. Source: https://info.sculpteo.com/hubfs/Material%20documentation/Multijet%20Fusion%20(HP)/PA12%20S/MJF%20PA12%20S%20-%20Biocompatibility%20statement.pdf
- ESTIMATE: any exposed stainless screws, an exposed USB-C shell or spring bars on the wrist side count as metal skin contact. Prefer a plastic wrist-side face and a 316L or a coated metal part only where needed.
- Wider regulatory items (for example EU REACH SVHC, sweat and PA sensitisation on a wrist): NOT FOUND beyond the above.

---

## 7. Colour memory-in-pixel displays (seen facts only, 2026-11-23)

| Part | Seen | Source |
|---|---|---|
| Sharp LS013B7DH03 (mono, your current part) | DigiKey: Active, 33,491 in stock, $12.39 at 1, $9.60 at 10, $7.97 at 100, $7.74 at 500, manufacturer lead time 28 weeks | https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387 |
| Sharp LS013B7DH05 | DigiKey lists it as monochrome 128x128; Active; not stocked; $9.50 at 1,120; lead time 28 weeks. It is not the colour part. | https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456 |
| Sharp LS013B7DH06 (128x128 colour) | Microchip USA: Product Status Obsolete; 1.3 in transflective colour; 23.81 x 23.81 mm viewing area; no backlight; lead time 20 weeks; price on request. Octopart: lifecycle Obsolete; listings at Aztech (11,766 at $1.06 flat), Worldway (22,428 at about $6.1-6.6) and Augswan (3,533 at $10.263 down to $9.082 at 10,000). The $1.06 listing looks anomalous and none of these listings was verified. | https://www.microchipusa.com/product/sharp-microelectronics/lcd-oled-graphic/LS013B7DH06 ; https://octopart.com/part/sharp/LS013B7DH06 |
| JDI LPM013M126C | AERI: 1,478 units "through the AERI Network"; 1.28 in; 176x176; 8 colours; SPI; backlight listed as WLED (10 cd/m²); price not listed; lifecycle not stated. A WLED entry conflicts with the reflective, no-backlight reading, so treat the backlight field as unresolved. | https://www.aeri.com/pn/JDI/lpm013m126c |
| JDI LPM013M126A | lcds-screen.com: price by RFQ only; no backlight; outline 26.02 x 27.82 mm, 0.84 ±0.13 mm; page says 262K colours (6-bit), which conflicts with the 8-colour figure on other pages; lifecycle not stated | https://www.lcds-screen.com/products/LPM013M126A_JDI_LCM_1.28-inch_176x176_parameter.html |

- JDI's own lifecycle statement and a Mouser or DigiKey listing for either JDI part: NOT FOUND. The Bangle.js 2 search returned retailer pages only; I fetched none.
- Fit: the 26.02 x 27.82 mm JDI outline is within your 26.6 x 30.3 mm Sharp mono footprint but not identical. Check the datasheet before assuming a drop-in swap.

---

## 8. Cost table for the enclosure set

Tooling is shown separately. Prototype columns (1, 5, 25) assume printed MJF PA12 parts plus a laser-cut window. Production columns (100, 500) assume urethane casting at 100 and aluminium-tool injection moulding at 500. All cells marked ESTIMATE are my arithmetic or judgment on the published figures named in the basis column. **No vendor quote was obtained for any row.**

### 8.1 Per-unit, one-time tooling excluded
| Item | Qty 1 | Qty 5 | Qty 25 | Qty 100 | Qty 500 | Basis |
|---|---|---|---|---|---|---|
| Case top | ESTIMATE $5-15 | ESTIMATE $4-10 | ESTIMATE $3-8 | ESTIMATE $10-40 (cast) | ESTIMATE $0.50-4 (moulded) | SEEN floors only: JLC3DP MJF "from $1.00"; PCBWay "less than $1 per part" plus $5-20 startup. PUBLISHED RANGE: casting $10-100 per part (Formlabs); moulding $0.60-4.00 (LAN PDT), £0.29-0.32 at 500 (Get It Made). |
| Case back | ESTIMATE $5-15 | ESTIMATE $4-10 | ESTIMATE $3-8 | ESTIMATE $10-40 (cast) | ESTIMATE $0.50-4 (moulded) | as above |
| Window | SEEN $25 (Pololu minimum order); $50 for 1 (Ponoko) | ESTIMATE $5 each (minimum order spread) | ESTIMATE $1-2 each | ESTIMATE $1-3 (PC or PMMA); glass NOT FOUND | glass or sapphire NOT FOUND; sapphire MOQ 100 SEEN | Pololu minimum order $25; cutting about $0.71 per window (my arithmetic on the $0.15/in rate). Sheet is 3 mm only on that page. |
| Gasket / O-ring | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | no price pages fetched. ESTIMATE $0.20-3 each depending on standard O-ring or custom die-cut. |
| Screws (4-6 pcs) | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | no price pages fetched. ESTIMATE $0.05-0.30 per screw. |
| Button cap | ESTIMATE $0-5 (printed with the case) | ESTIMATE $0-3 | ESTIMATE $0-2 | ESTIMATE $1-5 (silicone boot) | ESTIMATE $0.30-2 | no sourced price. |

Order minimums matter at qty 1-25: PCBWay minimum order is $25 plus a $5-20 per-material startup (SEEN). JLC3DP minimum order: NOT FOUND.

### 8.2 One-time tooling (PUBLISHED RANGES, not quotes)
| Route | Range | Source in section 2 |
|---|---|---|
| Silicone mould for urethane casting (about 50 casts per mould) | $200-1,000 | Formlabs |
| Single-cavity aluminium injection mould | $2,000-5,000 (RapidDirect, Formlabs); $3,000-12,000 (LAN PDT); from $1,495 (Protolabs) | as listed |
| Single-cavity P20 steel mould | $4,000-10,000 (Chinese toolmakers, dev.to); $5,000-25,000+ (RapidDirect) | as listed |
| Small two-part example | £3,816 (Get It Made, single tool, material not changing the price) | as listed |
| Two-part case, both halves (ESTIMATE: two tools) | about $4,000-24,000 | arithmetic on the ranges above |
| Side actions for USB-C or lug features | $800-2,500 each (LAN PDT) | as listed |
| Window, silicone gasket or button-boot tooling | NOT FOUND | |

### 8.3 Rough totals (ESTIMATE)
- Prototype case set (top and back, printed) at qty 1: roughly $10-30 plus a $25 minimum order, then falling toward $6-16 per set at qty 25.
- Production case set at qty 500: tooling $4,000-24,000 (published ranges) spread over 500 sets adds $8-48 per set, and per-part moulding adds about $1-8 per set. Roughly $9-56 per set at 500, before window, gasket and button. At 5,000, tooling adds $0.80-4.80 per set (arithmetic).

---

## 9. What I could not verify
- Any instant-quote price or tolerance for this part at JLC3DP, PCBWay, Protolabs, Xometry or Craftcloud.
- ISO 22810 test parameters; IEC 60529 IPX7 duration from the standard itself (the 30 min comes from Gore's description).
- Button seal design, USB-C seal design, whether a vent is needed at this size.
- Small-quantity glass window prices; Alibaba MOQ and price (apart from the sapphire listing MOQ 100).
- Price lists for O-rings, gaskets and M1.4/M1.6 screws.
- JDI lifecycle status and a major-distributor listing for the colour displays; the real backlight status of the LPM013M126C.
- Whether a watch maker's usual treatment of metal near an antenna matches my suggestion (only one weak community source).
- Nothing was built, tested or quoted. All fit, seal and antenna conclusions need a physical test.
