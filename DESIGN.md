---
name: SoFun Club
description: Cinematic murder-mystery script catalog — white base with Curtain Crimson accent, two-register (dark hero / white catalog).
colors:
  curtain-crimson: "#c62419"
  crimson-light: "#e02d20"
  crimson-dark: "#9a1c13"
  paper: "#ffffff"
  paper-tint: "#f8f8f8"
  paper-sunk: "#f0f0f0"
  ink: "#1a1a1a"
  ink-2: "#555555"
  ink-3: "#888888"
  void: "#09090f"
  surface: "#0e0e1a"
  card-dark: "#12121e"
  chalk: "#e8e4dc"
  chalk-2: "rgba(232,228,220,0.62)"
  wire: "rgba(255,255,255,0.07)"
  case-amber: "#c8a050"
  line-green: "#06c755"
typography:
  display:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "clamp(56px, 12vw, 110px)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Barlow Condensed', sans-serif"
    fontSize: "clamp(32px, 6vw, 56px)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0em"
  title:
    fontFamily: "'Sarabun', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0em"
  body:
    fontFamily: "'Sarabun', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0em"
  label:
    fontFamily: "'Sarabun', sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  xs: "5px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "20px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.curtain-crimson}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "13px 30px"
  button-primary-hover:
    backgroundColor: "{colors.crimson-dark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "13px 30px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.curtain-crimson}"
    rounded: "{rounded.sm}"
    padding: "13px 30px"
  button-line-auth:
    backgroundColor: "transparent"
    textColor: "{colors.line-green}"
    rounded: "{rounded.sm}"
    padding: "7px 16px"
  card-script:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "14px"
  input-field:
    backgroundColor: "{colors.paper-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 16px 11px 44px"
  chip-tag:
    backgroundColor: "rgba(198,36,25,0.08)"
    textColor: "{colors.curtain-crimson}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
---

# Design System: SoFun Club

## 1. Overview

**Creative North Star: "The Velvet Curtain"**

SoFun Club is the cold open of a thriller. The new palette stages that drama through contrast between registers: the hero and navigation run on near-black void — cinematic, deep, claustrophobic — while the catalog opens to clean white, giving every script card space to breathe as a collectible object. The single binding thread across both registers is Curtain Crimson (`#c62419`): a deep theatrical red that reads as dried blood under a spotlight, not as a warning label.

This is *Knives Out*, not Spirit Halloween. The red earns every placement it occupies — it appears on the ticker band, the scroll progress bar, primary CTAs, active tags, and the genre stripe on card hover. Everywhere else, the palette is paper and ink. Two colors. Maximum drama.

**Key Characteristics:**
- **Two-register structure:** Dark void/near-black (`#09090f`) for the hero and immersive sections; pure white (`#ffffff`) for the catalog body and utility pages.
- **Single accent:** Curtain Crimson (`#c62419`) — used only where decisive action or emphasis is required.
- **Display type:** Barlow Condensed uppercase (Latin only). Body: Sarabun across Thai / English / 中.
- **Motion:** Particles float red on dark hero, ticker scrolls red-on-dark, scroll progress bar pulses crimson, card hover reveals a red left-stripe.
- `prefers-reduced-motion` degrades all animations to instant state transitions.

## 2. Colors

A two-register palette built on pure contrast. The accent color is singular and theatrical — Curtain Crimson appears only where it must.

### Primary Accent
- **Curtain Crimson** (`#c62419`): The single accent. Ticker background, scroll progress bar, primary CTA buttons (on white pages), active filter chips, genre stripe on card hover, hero grid lines, and any element that demands immediate dramatic attention. Never decorative — every crimson element has a function.
- **Crimson Light** (`#e02d20`): Button hover on white pages, link hover states.
- **Crimson Dark** (`#9a1c13`): Button active/pressed, hover on dark-register CTAs.

### Light Register (Catalog, Utility)
- **Paper** (`#ffffff`): Primary light surface — catalog body, card backgrounds, modal surfaces on white pages.
- **Paper Tint** (`#f8f8f8`): Step-up tile background on light pages, tag-chip hover, input focus shadow fill.
- **Paper Sunk** (`#f0f0f0`): Input field background, scrollbar track on light pages.
- **Ink** (`#1a1a1a`): Primary text on white surfaces. Headings, card titles, body copy.
- **Ink-2** (`#555555`): Secondary text — metadata, synopsis supporting text, nav links default.
- **Ink-3** (`#888888`): Disabled, placeholder, subdued labels.

### Dark Register (Hero, Ticker, Immersive Sections)
- **Void** (`#09090f`): The deepest dark — hero background, deep overlays. A near-black with barely-perceptible blue cast that reads cinematic, not digital.
- **Surface** (`#0e0e1a`): One step up from void. Used for layered dark panels.
- **Card Dark** (`#12121e`): Dark-register cards and script tiles in dark sections.
- **Chalk** (`#e8e4dc`): Warm parchment text on dark surfaces — body copy and subtitles in the hero section.
- **Wire** (`rgba(255,255,255,0.07)`): Hairline borders between dark elements. Invisible at rest, visible under focused attention.

### Tertiary (Functional)
- **LINE Green** (`#06c755`): Auth affordance only — never decorative.
- **Case Amber** (`#c8a050`): Achievement/case accent — used for golden achievement tier highlight, amber stars. Functional only.

### Named Rules

**The Single Accent Rule.** Curtain Crimson is the *only* accent color. Exactly one hue. If a new element needs "emphasis," that emphasis is either crimson or it's weight/size contrast — never a second hue introduced alongside it.

**The Register Separation Rule.** White elements on dark backgrounds (`#09090f`), ink elements on white backgrounds (`#ffffff`). Do not mix registers on the same surface (no white text on white background, no dark text on dark background). The theatrical jump between registers is the drama.

**The Earned-Red Rule.** Crimson does not decorate. It marks: CTAs (act now), active states (you are here), the ticker (announcement), the progress bar (you are this far). Decorative crimson — borders for their own sake, background tints on every element — dilutes the accent to noise.

## 3. Typography

**Display Font:** Barlow Condensed 700–900, Latin/uppercase only (with `sans-serif` fallback). Thai/中 display uses Sarabun 700 at ~70% of the equivalent Latin size.  
**Body Font:** Sarabun 300–700 (with `sans-serif` fallback) — handles Thai / English / 中 natively. Line-height ≥ 1.7; letter-spacing `0.02em` for Thai body text.  
**Label Font:** Sarabun 700, 11px, letter-spacing 0.1em, UPPERCASE — the system's workhorse.

**Character:** A poster-house pairing. Barlow Condensed runs the marquee in the dark hero — narrow, declarative, theatrical chalk letters on near-black. On white catalog pages the same faces flip register: crimson accents on ink text instead of chalk on void. The pairing earns drama from size jump and contrast, never from color complexity.

### Hierarchy
- **Display** (Barlow Condensed 900, `clamp(56px, 12vw, 110px)`, line-height 0.9): Hero headlines only. Always uppercase. Never more than three lines.
- **Headline** (Barlow Condensed 900, `clamp(32px, 6vw, 56px)`, line-height 1): Section titles. Always uppercase.
- **Title** (Sarabun 700, 20px, line-height 1.3): Card titles, modal titles. Sentence case.
- **Body** (Sarabun 400, 15px, line-height 1.7): Descriptions, synopsis. Cap at 65–75ch.
- **Body Light** (Sarabun 300, 15px, line-height 1.7): Hero subtitles and atmospheric copy on dark backgrounds.
- **Label** (Sarabun 700, 11px, letter-spacing 0.1em, UPPERCASE): Button text, nav text, badge text.
- **Ticker** (Barlow Condensed 700, 13px, letter-spacing 0.12em, UPPERCASE): Ticker band only.

### Named Rules

**The Latin-Only Display Rule.** Barlow Condensed is Latin display only. Thai/中 hero copy uses Sarabun at appropriate weights — never Barlow Condensed crashing into a script it wasn't designed for.

**The No-Gradient-Text Rule.** No `background-clip: text` gradient headlines. Emphasis comes from weight, size, and the single crimson accent — not from gradients. If text needs more drama on dark surfaces, add a subtle white `text-shadow` (≤ `0 0 40px rgba(255,255,255,0.2)`).

## 4. Elevation

On dark surfaces, elevation is expressed through surface lightness: Void (`#09090f`) → Surface (`#0e0e1a`) → Card Dark (`#12121e`) as surfaces rise from the floor. On white surfaces, elevation uses pure-black box-shadows at low alpha. Crimson glows appear only on CTAs in active/hover states — not on cards.

### Shadow Vocabulary
- **Ambient Rest** (`0 2px 12px rgba(0,0,0,0.07)`): Default card/panel on white pages.
- **Lifted** (`0 8px 32px rgba(0,0,0,0.15)`): Hover cards, focused panels on white pages.
- **CTA Press** (`0 8px 24px rgba(198,36,25,0.4)`): Primary CTA button hover — the crimson halo. Hero section only; white-page CTAs use the same value at 0.2 alpha.
- **Stage Spotlight** (`0 20px 60px rgba(0,0,0,0.4)`): Modals only.
- **Scene Vignette** (`radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.45) 100%)`): Hero video overlay. Conceptual — not a box-shadow.

### Named Rules

**The CTA-Glow-Only Rule.** Crimson glow shadows (`rgba(198,36,25,...)`) are reserved for primary CTA buttons in hover/active state. Cards, panels, nav, and modals never get crimson shadows.

## 5. Components

Primary CTAs are crimson on white — decisive, theatrical. Dark-register CTAs remain chalk-white on dark. Cards are clean white frames on the catalog. Inputs are quiet. The system shouts in Barlow Condensed, not in form fields.

### Buttons
- **Shape:** `8px` radius for all standard buttons. Circle (50%) for icon-only buttons.
- **Primary (on white pages):** Crimson fill (`#c62419`), white text (`#ffffff`), `13px / 30px` padding. The singular red element in the catalog.
- **Primary hover (on white):** `#9a1c13` fill, white text, `translateY(-2px)`, crimson press shadow.
- **Primary (on dark pages — hero):** White fill (`#ffffff`), near-black text (`#09090f`). Hover: `#e8e8e8` fill, crimson glow shadow.
- **Secondary (on white):** Transparent background, crimson text + border. Hover: crimson fill, white text.
- **Secondary (on dark):** Transparent background, `rgba(232,228,220,0.85)` chalk text, `rgba(255,255,255,0.35)` border.
- **LINE Auth:** Transparent, LINE Green text + border. Only on login affordance.

### Chips & Tags
- **Tag Chip (active):** `rgba(198,36,25,0.12)` background, crimson text, `5px` radius, `1px rgba(198,36,25,0.3)` border.
- **Tag Chip (default):** `rgba(0,0,0,0.06)` background, Ink-2 text, `5px` radius.
- **Difficulty Badge:** Colored background by level — Easy `#16a34a`, Normal `#2563eb`, Hard `#d97706`, Expert `#c62419`. White text. `5px` radius. Positioned absolute top-left of script card image.

### Cards & Containers
- **Script Card (white register):** `#ffffff` surface, `16px` radius, `1px rgba(0,0,0,0.08)` border, Ambient Rest shadow. Hover: Lifted shadow, add `3px #c62419` left stripe (scaleY 0 → 1). The crimson stripe is the single sanctioned card accent.
- **Script Card (dark register):** `#12121e` surface, `16px` radius, `1px rgba(255,255,255,0.07)` border. Hover: surface lightens to `#1a1a1a`, crimson stripe.
- **Modal:** `#ffffff` surface on white pages, Stage Spotlight shadow. `16px` radius.
- **Internal Padding:** Minimum `14px` on script cards; `20–24px` on modals.

### Inputs & Fields
- **Style:** `12px` radius, `1px rgba(0,0,0,0.12)` border, `#f0f0f0` background, Ink text, 15px Sarabun.
- **Focus:** Border shifts to `rgba(198,36,25,0.5)`, `box-shadow: 0 0 0 3px rgba(198,36,25,0.08)`. Crimson ring signals active state.
- **Placeholder:** `#888888` — must pass 4.5:1 contrast against the input background.
- **Disabled:** `rgba(0,0,0,0.04)` background, `#aaaaaa` text.

### Navigation
- **Top Nav (white-register):** `rgba(255,255,255,0.97)` background, `2px solid #c62419` bottom border, 60px height, backdrop-blur(12px). The crimson rule under the nav is the system's only persistent structural accent.
- **Nav Links:** Ink-2 (`#555555`) text default. Active: Ink (`#1a1a1a`) text, crimson underline or pill background.
- **Mobile Bottom Tab Bar:** `rgba(255,255,255,0.98)` background, `1px solid #e8e8e8` top border, 62px height. Active tab: crimson icon + label.

### Signature Components
- **Ticker Band:** Crimson (`#c62419`) background, white Barlow Condensed text, 60s linear infinite scroll. Divides hero from catalog — the moment the audience notices the red.
- **Crimson Particles:** 2px crimson dots at low opacity (`rgba(198,36,25,0.45)`) drifting upward on the hero — blood-like grain brought to life on a dark stage. Disabled under `prefers-reduced-motion`.
- **Cursor Spotlight:** `radial-gradient` crimson glow (700px, opacity ≈ 7%) following cursor on hover-capable devices. Subtle; respects `hover: none` media query.
- **Scroll Progress Bar:** Crimson gradient (`linear-gradient(90deg, #c62419, #ff6b6b, #c62419)`) with crimson box-shadow.

## 6. Do's and Don'ts

### Do:
- **Do** use Curtain Crimson (`#c62419`) as the *only* accent hue — every instance must mark a decisive action or emphasis: CTA, active state, ticker, progress bar, card-hover stripe.
- **Do** maintain the two-register structure: near-black void for hero/immersive sections, white paper for catalog/utility. The binary jump is the drama.
- **Do** use the `3px #c62419` left stripe on script card hover — it's the single sanctioned card accent.
- **Do** apply crimson focus rings on input fields (the only place crimson appears in form UI).
- **Do** keep the crimson bottom border on the top navigation — it's a structural accent, not decoration.
- **Do** pair Barlow Condensed uppercase display with Sarabun body, with a clear size jump between them.
- **Do** test all copy at Thai / English / 中 breakpoints. Thai body text needs `line-height ≥ 1.7` and `letter-spacing: 0.02em`.
- **Do** add `prefers-reduced-motion` alternatives for every animation: particles → none, ticker → paused, glow → removed, parallax → frozen.
- **Do** keep LINE Green exclusively on the LINE auth affordance — it is functional, not brand color.
- **Do** use chalk/parchment text (`#e8e4dc`) for body copy on the dark hero register — never pure white body text at small sizes on dark.

### Don't:
- **Don't** introduce any second accent color alongside Curtain Crimson. The drama comes from a single hue, not a palette.
- **Don't** use `rgba(198,36,25,...)` crimson on cards, modals, or nav backgrounds as a fill or shadow outside of the CTA hover rule (4. Elevation).
- **Don't** use `background-clip: text` gradients on headlines. Emphasis comes from weight, size, and crimson accent — never from a gradient.
- **Don't** use dripping-blood fonts, neon spider webs, skull motifs, or cheap-horror clichés. Reference is *Knives Out*, not Spirit Halloween.
- **Don't** use purple-tinted or blue-tinted near-black backgrounds outside the intentional dark register (`#09090f` is the floor — its slight blue cast is deliberate and cinematic). Don't introduce new purple-darks.
- **Don't** use Barlow Condensed for Thai or 中 display copy. Latin uppercase only.
- **Don't** add a tiny tracked uppercase eyebrow above every section. Eyebrow is hero pre-headline only.
- **Don't** propagate the script-card crimson left-stripe to other cards, callouts, or alerts. Full borders or nothing.
- **Don't** introduce warm-cream or sand body backgrounds on utility pages. White (`#ffffff`) is the catalog base.
- **Don't** add crimson decorative borders, background tints, or shadows on every element. Earned-Red Rule: crimson marks decisive moments only.
- **Don't** add any boardgame-retailer bright primaries, esports neon-cyan, or RGB gradients. Wrong audience, wrong tone.
- **Don't** use the case-amber (`#c8a050`) or star colors as brand accents — they are functional-only (achievement tier, rating stars).
