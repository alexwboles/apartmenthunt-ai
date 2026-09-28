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

console.log('---');
console.log('E2E PASS: ' + pass + '  FAIL: ' + fail);
process.exit(fail ? 1 : 0);
NODEEOF
