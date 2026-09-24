# Product

## Register

brand

## Users

First-time visitors deciding whether to spend an evening at SoFun — Thai (with English / Chinese fallbacks) players in their 20s–30s scrolling on their phone, probably in bed or on transit, browsing murder-mystery scripts to figure out which one to book with friends. They're not power-users of a SaaS app; they're a film/series audience who want to be cast in one. The repeat surfaces (party formation, QR check-in, POS) serve the same audience once they've crossed the booking line, but the public site's job is to convert the curious browser.

## Product Purpose

SoFun runs in-person murder-mystery / role-play script sessions in Thailand. The web app is the marketing storefront, the script catalog, the party-formation tool, and the on-venue ops layer (QR + POS) for one company. Success for the public surface is one thing: a first-time visitor commits to booking a session. Every other feature (party, profile, QR, POS) serves that committed user after the conversion has happened.

## Brand Personality

**Cinematic. Mysterious. Dramatic.** Voice is the trailer voiceover, not the carnival barker — measured, confident, withholding. We tell you a body has been found; we don't tell you whodunit. Imagery is film-poster, not jump-scare. Energy is suspense and theater, not horror and gore. A whisper is more effective than a scream.

## Anti-references

- **Halloween / cheap horror.** No dripping-blood fonts, no neon spider webs, no B-movie skull motifs. The menace is implied, not painted on. Reference is *Knives Out* — not Spirit Halloween.
- **Generic SaaS landing.** No cream/sand bg with gradient hero, no big-number hero metrics row, no identical icon-+-heading-+-text card grids, no tiny tracked uppercase eyebrow on every section. We are not a startup.
- **Boardgame retailer.** No bright primaries, no stock photos of laughing friends gathered around a table. The product isn't a box; it's an evening.
- **Gaming / esports.** No neon-cyan accents, no RGB, no angled panels. Wrong audience and wrong tone.

## Design Principles

1. **Cinema, not carnival.** The page is a film-poster series, not a sales funnel. Each section should establish scene and mood before it asks for anything.
2. **The menace is implied.** Restraint reads more dangerous than excess. Red is a pulse on a heart monitor, not a flood. One dramatic gesture per viewport beats five competing ones.
3. **Withhold to invite.** Show the synopsis, hide the killer. Trailer logic: enough to hook, never enough to spoil. Conversion comes from curiosity, not pressure.
4. **The catalog is the protagonist.** Scripts are the actual product; the design system exists to make them feel collectible — like Criterion editions, not like Steam thumbnails. Treat every script card as a poster.
5. **Thai first, then English, then 中.** Sarabun has to breathe at body sizes; cinematic restraint means generous line-height and humane measure across all three scripts. Display type (Barlow Condensed) is Latin-only; Thai display must hold its own at a different weight.

## Accessibility & Inclusion

- WCAG AA baseline: 4.5:1 body contrast, 3:1 large text, focus rings on all interactive elements, real labels on form controls.
- Reduced-motion is non-negotiable. The current site uses video bg, parallax, particles, glow orbs, ripple, scroll-progress, and parallax background positions; every one needs a `prefers-reduced-motion: reduce` alternative (typically: hold the still frame of the video, freeze parallax to its rest position, disable particles, crossfade instead of slide).
- Tap targets ≥ 44px on mobile (LINE in-app browser is a primary entry point; thumb reach matters).
- Multilingual typography: do not pair Barlow Condensed with raw fallback for Thai/Chinese — use Sarabun for Thai body and a tested CJK fallback for 中; verify weights map across scripts.
