# 🏠 ApartmentHunt AI

**Compare apartments like a pro.** The "cheaper" apartment is often the expensive one once you add the broker fee, the 35-minute drive, and the $140 utility bills. ApartmentHunt AI does the true-cost math and scores your shortlist against what *you* actually care about.

## The problem

Rent is a headline number, not the real number. Hunters juggle rent, one-time fees, utilities, commute time and cost, square footage, and amenities across a dozen browser tabs — and pick wrong because no single view combines them.

## The solution

ApartmentHunt AI runs **100% locally in your browser**:

1. **Add listings** — rent, sqft, beds/baths, one-time fees, utilities, commute (time, miles, mode), amenities, pros/cons, notes. Saved in your browser.
2. **True monthly cost** — rent + move-in fees amortized over 12 months + utilities + commute cost (drive: round-trip miles × work days × $/mile; transit: monthly pass; walk/bike: free).
3. **Weighted scoring** — tell it what matters with four sliders (price, space, commute, amenities). Every listing gets a 0–100 score with a per-factor breakdown, ranked best-first.
4. **Side-by-side table** — rent, true cost, size, commute, amenities, and score for every listing in one view.

- **Shortlist CSV export** — download listings with true costs, breakdowns, and scores.
- **Sort control** — re-order the shortlist by best match, lowest true cost, most space, or shortest commute (comparison table follows).
- **Budget guardrail** — set a max true monthly cost; listings over it get an *Over budget* badge.
- **Duplicate listing** — clone a listing as a starting point for a similar unit.
- **Reset weights** — one click restores the default priority sliders.
Sample listings included so you can see scoring in action before entering your own.

Optional: set `OPENAI_API_KEY` for AI-generated listing summaries in a future version — everything works fully offline without it.

## Privacy

**Nothing leaves your device.** No account, no server, no analytics. Your apartment hunt stays in your browser's localStorage.

## Run it

No build step, no dependencies. Open `index.html` in any modern browser.

## Tests

```bash
bash test/smoke.sh   # file presence, syntax, core logic
bash test/e2e.sh     # full ranking flows on sample data
```

## License

MIT
