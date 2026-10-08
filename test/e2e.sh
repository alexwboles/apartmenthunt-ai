#!/bin/bash
# ApartmentHunt AI e2e tests — full ranking flows on the sample listings.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
node << 'NODEEOF'
const A = require('/home/hatch/workspace/apartmenthunt-ai/js/apt.js');
const fs = require('fs');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

const listings = JSON.parse(fs.readFileSync('/home/hatch/workspace/apartmenthunt-ai/data/sample.json', 'utf8'));
const OPTS = { commuteCostPerMile: 0.70, workDaysPerMonth: 22 };
const DEF = A.DEFAULT_WEIGHTS;

// Flow 1: sample data loads 3 listings
listings.length === 3 ? ok('flow1: sample.json has 3 listings') : bad('flow1: ' + listings.length + ' listings');

// Flow 2: default weights rank the amenity-rich Foundry first (it wins space+commute+amenities)
const rk = A.rank(listings, DEF, OPTS);
rk[0].listing.id === 's3' && rk[0].rank === 1
  ? ok('flow2: default weights rank Foundry #1 (' + rk[0].score + '/100)')
  : bad('flow2: unexpected #1: ' + rk[0].listing.id);
rk[2].rank === 3 ? ok('flow2: ranks assigned 1..3') : bad('flow2: rank numbering broken');

// Flow 3: price-only weighting flips the winner to cheapest Maple Court
const priceOnly = A.rank(listings, { price: 100, space: 0, commute: 0, amenities: 0 }, OPTS);
priceOnly[0].listing.id === 's2'
  ? ok('flow3: price-only ranking picks Maple Court (' + priceOnly[0].score + '/100)')
  : bad('flow3: price-only winner wrong: ' + priceOnly[0].listing.id);

// Flow 4: true cost exposes the "cheap rent" trap — Sunset Lofts costs more than its rent suggests
const costs = {};
A.score(listings, DEF, OPTS).forEach(s => { costs[s.id] = s.cost; });
costs.s1.total > listings.find(l => l.id === 's1').rent
  ? ok('flow4: Sunset true cost ' + A.money(costs.s1.total) + ' > rent ' + A.money(2400))
  : bad('flow4: true cost not above rent');
Math.abs(costs.s2.total - (1950 + 25 + 110 + 99)) < 0.01
  ? ok('flow4: Maple true cost reconciles: ' + A.money(costs.s2.total))
  : bad('flow4: Maple true cost wrong: ' + costs.s2.total);

// Flow 5: comparison table has 7 rows x 3 listings
const rows = A.compareRows(listings, OPTS);
rows.length === 7 && rows.every(r => r.values.length === 3)
  ? ok('flow5: compareRows = 7 rows x 3 listings')
  : bad('flow5: compare table shape wrong');
rows[0].label === 'Monthly rent' ? ok('flow5: first row is monthly rent') : bad('flow5: row labels off');

// Flow 6: single listing scores a clean 100 (nothing to compare against)
const solo = A.score([listings[0]], DEF, OPTS);
solo.length === 1 && solo[0].score === 100
  ? ok('flow6: single listing scores 100') : bad('flow6: single score = ' + (solo[0] && solo[0].score));

// Flow 7: all-zero weights fall back to equal weighting without crashing
const zw = A.rank(listings, { price: 0, space: 0, commute: 0, amenities: 0 }, OPTS);
zw.length === 3 && zw.every(r => r.score >= 0 && r.score <= 100)
  ? ok('flow7: zero weights degrade gracefully') : bad('flow7: zero-weight crash');

// Flow 8: breakdown components add up to the total score
const s0 = A.score(listings, DEF, OPTS)[0];
const wSum = DEF.price + DEF.space + DEF.commute + DEF.amenities;
const recomputed = (s0.breakdown.price * DEF.price + s0.breakdown.space * DEF.space +
  s0.breakdown.commute * DEF.commute + s0.breakdown.amenities * DEF.amenities) / wSum;
Math.abs(recomputed - s0.score) < 0.15
  ? ok('flow8: breakdown reconciles to total score')
  : bad('flow8: breakdown mismatch ' + recomputed + ' vs ' + s0.score);

// Flow 9: shortlistCSV exports one header + one row per listing with a correct total
const csv = A.shortlistCSV(listings, DEF, OPTS);
const clines = csv.split('\n');
clines[0].split(',')[0] === 'rank' && clines.length === 4
  ? ok('flow9: CSV has header + 3 listing rows')
  : bad('flow9: CSV shape wrong: ' + clines.length + ' lines');
// true_monthly_cost column (index 7) must match the ranked total
const rk9 = A.rank(listings, DEF, OPTS);
const row1 = clines[1].split(',');
Math.abs(parseFloat(row1[7]) - rk9[0].cost.total) < 0.01
  ? ok('flow9: CSV true cost matches rank() total (' + row1[7] + ')')
  : bad('flow9: CSV cost mismatch: ' + row1[7]);

// Flow 10: sortRanked reorders by cost / space / commute and renumbers ranks
const byCost = A.sortRanked(rk.slice(), 'cost');
const totals = byCost.map(r => r.cost.total);
totals.every((t, i) => i === 0 || t >= totals[i - 1])
  ? ok('flow10: sort by cost orders ascending')
  : bad('flow10: cost sort wrong');
byCost[0].rank === 1 && byCost[2].rank === 3
  ? ok('flow10: ranks renumbered 1..3 after sort')
  : bad('flow10: rank renumbering broken');
const bySpace = A.sortRanked(rk.slice(), 'space');
bySpace[0].listing.sqft >= bySpace[2].listing.sqft
  ? ok('flow10: sort by space orders descending')
  : bad('flow10: space sort wrong');
const byCommute = A.sortRanked(rk.slice(), 'commute');
byCommute[0].listing.commuteMin <= byCommute[2].listing.commuteMin
  ? ok('flow10: sort by commute orders ascending')
  : bad('flow10: commute sort wrong');

// Flow 11: budgetFlags marks only listings over the cap
const bf = A.budgetFlags(rk, 2200);
bf.count === Object.keys(bf.over).length
  ? ok('flow11: budgetFlags count matches over-set (' + bf.count + ' over)')
  : bad('flow11: budgetFlags inconsistent');
const bfNone = A.budgetFlags(rk, 0);
bfNone.count === 0 ? ok('flow11: zero cap flags nothing') : bad('flow11: zero cap flagged ' + bfNone.count);
rk.forEach(r => {
  const over = r.cost.total > 2200;
  if (!!bf.over[r.listing.id] !== over) { bad('flow11: flag wrong for ' + r.listing.id); }
});
const allRight = rk.every(r => !!bf.over[r.listing.id] === (r.cost.total > 2200));
allRight ? ok('flow11: every listing flagged correctly against the cap') : bad('flow11: flag mismatch');

// Flow 12: duplicateListing copies everything except the id
const src = listings[0];
const dup = A.duplicateListing(src);
dup.id !== src.id && dup.name === src.name + ' (copy)' && dup.rent === src.rent &&
  dup.amenities.length === src.amenities.length && dup.amenities !== src.amenities
  ? ok('flow12: duplicate copies fields with a fresh id')
  : bad('flow12: duplicate malformed');

console.log('---');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
