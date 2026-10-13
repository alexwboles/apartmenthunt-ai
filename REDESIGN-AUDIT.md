# Redesign Audit — apartmenthunt-ai (2026-10-13)

**Competitors studied:** Zillow SRP (split map+listings, price-pill markers, filter bar, photo→price→beds/baths→address card hierarchy, saved searches + hearts), Apartments.com (filter & sort bar, 3D tours, fees transparency, self-guided tours).

## Visual gaps
1. **No photo-led cards.** Every real rental product leads with photography. Current cards are text-only rows — looks like a spreadsheet, not a listing product.
2. **Masthead too heavy.** Thick dark teal bar + 3px amber border reads dated vs Zillow/Apartments.com's clean white sticky header with product-first search/filter bar.
3. **Card hierarchy wrong.** Zillow: photo → price → beds/baths/sqft → address. Current: score ring → name → meta-line paragraph. The "product" (the apartment) is buried under the tool's math.
4. **Typography lacks editorial voice.** Everything is one sans weight ladder; no display treatment. Premium brokerages pair a serif display with data-grade sans.
5. **No sticky filter bar.** Zillow's signature is the sticky results bar (sort, filters, count). Ours sits in a rail and re-renders the whole page.
6. **Filter chips and sliders** look generic (default range thumbs aside).

## Functional / flow gaps
1. **No photos per listing.** The single biggest "real software" gap. → add photo upload (downscaled dataURL, stored locally) + generated skyline placeholder when none.
2. **No save/favorite.** Zillow/Apartments.com center on hearts. → add favorite toggle + favorites-only filter.
3. **No photo gallery/lightbox** — out of scope; single photo is enough for a comparison tool.
4. **Commute is a number only** — commute-time maps are out of scope (no API keys, no spend rule); commute-mode cost math already exists and stays.

## Decisions
- Keep: true-cost engine, weighted scoring, deal-breakers, affordability, move-in cash, CSV export, side-by-side ledger — all preserved, restyled.
- Identity: "editorial brokerage dossier" — warm paper canvas, ink masthead, deep-green money accent, amber highlights, serif display + tabular data numerals, sharp corners everywhere.
- Cards: photo band (photo or generated skyline art) → heart overlay + rank chip → true-cost hero number → cost-breakdown bar → factor bars → badges → actions.
- Sticky results toolbar: count, sort, favorites filter, export, add listing.
