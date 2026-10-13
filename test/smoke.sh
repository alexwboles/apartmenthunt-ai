#!/bin/bash
# ApartmentHunt AI smoke tests — file presence, syntax, core logic sanity.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# 1-8. expected files exist
for f in index.html css/style.css js/apt.js js/app.js data/sample.json README.md test/smoke.sh test/e2e.sh; do
  [ -f "$f" ] && ok "file exists: $f" || bad "missing file: $f"
done

# 9-10. JS syntax valid
for f in js/apt.js js/app.js; do
  node --check "$f" 2>/dev/null && ok "syntax ok: $f" || bad "syntax error: $f"
done

# 11+. logic checks via node
node << 'NODEEOF'
const A = require('/home/hatch/workspace/apartmenthunt-ai/js/apt.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

// true cost: rent 2000 + fees 1200/12=100 + utils 150 + drive 10mi*2*22*0.70=308
const l = Object.assign(A.blankListing(), {
  rent: 2000, fees: 1200, utilities: 150,
  commuteMiles: 10, commuteMode: 'drive', sqft: 800
});
const c = A.trueCost(l, { commuteCostPerMile: 0.70, workDaysPerMonth: 22 });
Math.abs(c.total - 2558) < 0.01
  ? ok('true cost math: 2558/mo (2000+100+150+308)')
  : bad('true cost wrong: ' + c.total);
Math.abs(c.feesMonthly - 100) < 0.01 ? ok('fees amortized over 12 months') : bad('fee amortization wrong');

// transit mode uses pass, not mileage
const t = Object.assign(A.blankListing(), {
  rent: 1800, commuteMode: 'transit', transitPass: 99, commuteMiles: 30
});
const ct = A.trueCost(t, {});
Math.abs(ct.commute - 99) < 0.01 ? ok('transit commute = pass cost') : bad('transit commute wrong: ' + ct.commute);

// walk/bike commute is free
const w = Object.assign(A.blankListing(), { rent: 1800, commuteMode: 'bike', commuteMiles: 5 });
A.trueCost(w, {}).commute === 0 ? ok('bike commute costs 0') : bad('bike commute nonzero');

// validation catches bad input
const errs = A.validateListing(Object.assign(A.blankListing(), { rent: 0 }));
errs.length >= 2 ? ok('validation flags missing name + zero rent') : bad('validation too lax: ' + errs.length);
A.validateListing(Object.assign(A.blankListing(), { name: 'X', rent: 1500 })).length === 0
  ? ok('valid listing passes validation') : bad('valid listing rejected');

// scoring: cheapest + biggest should outrank expensive + tiny when price+space weighted
const cheap = Object.assign(A.blankListing(), { id: 'c1', name: 'Cheap', rent: 1500, sqft: 1000, commuteMin: 20, amenities: ['gym'] });
const pricey = Object.assign(A.blankListing(), { id: 'c2', name: 'Pricey', rent: 3000, sqft: 600, commuteMin: 40, amenities: [] });
const sc = A.score([cheap, pricey], { price: 50, space: 50, commute: 0, amenities: 0 }, {});
const sCheap = sc.find(s => s.id === 'c1').score;
const sPricey = sc.find(s => s.id === 'c2').score;
sCheap > sPricey ? ok('cheaper+bigger outscores pricey+tiny (' + sCheap + ' vs ' + sPricey + ')') : bad('scoring inverted');
sc.every(s => s.score >= 0 && s.score <= 100) ? ok('scores within 0-100') : bad('score out of range');

// rank() orders + assigns ranks
const rk = A.rank([pricey, cheap], { price: 50, space: 50, commute: 0, amenities: 0 }, {});
rk[0].rank === 1 && rk[0].listing.id === 'c1' ? ok('rank() puts winner first') : bad('rank order wrong');

// money formatting
A.money(1234567.891) === '$1,234,567.89' ? ok('money formats with commas') : bad('money format: ' + A.money(1234567.891));

// amenities bank non-empty
A.AMENITIES.length >= 8 ? ok('amenity bank has ' + A.AMENITIES.length + ' items') : bad('amenity bank too small');

// new: shortlistCSV header + rows
const csvL = [
  Object.assign(A.blankListing(), { id: 'x1', name: 'A, \"quoted\"', rent: 2000, sqft: 800, commuteMin: 20, amenities: ['gym'] }),
  Object.assign(A.blankListing(), { id: 'x2', name: 'B', rent: 1500, sqft: 600, commuteMin: 40, amenities: [] })
];
const csvOut = A.shortlistCSV(csvL, A.DEFAULT_WEIGHTS, {});
const csvLines = csvOut.split('\n');
csvLines.length === 3 && csvLines[0].indexOf('true_monthly_cost') !== -1
  ? ok('shortlistCSV: header + 2 rows')
  : bad('shortlistCSV shape: ' + csvLines.length + ' lines');
csvLines[1].indexOf('"A, ""quoted"""') !== -1
  ? ok('shortlistCSV: quotes commas in names')
  : bad('shortlistCSV quoting: ' + csvLines[1]);

// new: sortRanked orders + renumbers
const srt = A.sortRanked(A.rank(csvL, A.DEFAULT_WEIGHTS, {}), 'cost');
srt[0].listing.id === 'x2' && srt[0].rank === 1
  ? ok('sortRanked: cheapest first, rank renumbered')
  : bad('sortRanked by cost wrong');

// new: budgetFlags
const bfl = A.budgetFlags(A.rank(csvL, A.DEFAULT_WEIGHTS, {}), 1700);
bfl.over.x1 && !bfl.over.x2 && bfl.count === 1
  ? ok('budgetFlags: flags only the over-budget listing')
  : bad('budgetFlags wrong: ' + JSON.stringify(bfl));

// new: duplicateListing
const dl = A.duplicateListing(csvL[0]);
dl.id !== csvL[0].id && dl.name === csvL[0].name + ' (copy)' && dl.rent === csvL[0].rent
  ? ok('duplicateListing: fresh id, copied fields')
  : bad('duplicateListing wrong');

// UI wires the new controls
const html = require('fs').readFileSync('/home/hatch/workspace/apartmenthunt-ai/index.html', 'utf8');
['sort-by', 'budget-cap', 'export-csv', 'reset-weights'].every(id => html.includes('id="' + id + '"'))
  ? ok('index.html has sort/budget/export/reset controls')
  : bad('missing new control ids in index.html');
['fl-beds', 'fl-cmin', 'fl-amen', 'fl-pets', 'clear-filters', 'opt-term'].every(id => html.includes('id="' + id + '"'))
  ? ok('index.html has deal-breaker + lease-term controls')
  : bad('missing filter/term control ids in index.html');
html.includes('value="value"')
  ? ok('index.html has Best value sort option')
  : bad('missing value sort option');

// new: passesFilters + leaseMonthsOf + value sort wired
const A2 = A;
const pf1 = Object.assign(A2.blankListing(), { beds: 2, commuteMin: 15, amenities: ['gym', 'pet friendly'] });
A2.passesFilters(pf1, { minBeds: 2, maxCommuteMin: 20, required: ['gym'], petFriendly: true })
  ? ok('passesFilters: matching listing passes')
  : bad('passesFilters false negative');
!A2.passesFilters(Object.assign(A2.blankListing(), { beds: 1 }), { minBeds: 2, maxCommuteMin: 0, required: [], petFriendly: false })
  ? ok('passesFilters: minBeds excludes')
  : bad('passesFilters minBeds false positive');
A2.leaseMonthsOf({ leaseMonths: 24 }) === 24 && A2.leaseMonthsOf({}) === 12
  ? ok('leaseMonthsOf: 24 accepted, default 12')
  : bad('leaseMonthsOf wrong');

// second sweep: moveInCost / affordability / filterReasons
const m1 = A.moveInCost(Object.assign(A.blankListing(), { rent: 2000, fees: 500 }));
m1.total === 4500 && m1.deposit === 2000 && m1.assumedDeposit === true
  ? ok('moveInCost: blank deposit assumed = rent (2000+500+2000)')
  : bad('moveInCost assumed deposit: ' + JSON.stringify(m1));
const m2 = A.moveInCost(Object.assign(A.blankListing(), { rent: 2000, fees: 500, deposit: 1000 }));
m2.total === 3500 && m2.assumedDeposit === false
  ? ok('moveInCost: explicit deposit used')
  : bad('moveInCost explicit: ' + JSON.stringify(m2));
const a1 = A.affordability(Object.assign(A.blankListing(), { rent: 3000 }), {}, 10000);
a1 && a1.status === 'good' && a1.pct === 30
  ? ok('affordability: 30% -> good')
  : bad('affordability good: ' + JSON.stringify(a1));
const a2 = A.affordability(Object.assign(A.blankListing(), { rent: 3500 }), {}, 10000);
a2 && a2.status === 'stretch'
  ? ok('affordability: 35% -> stretch')
  : bad('affordability stretch: ' + JSON.stringify(a2));
const a3 = A.affordability(Object.assign(A.blankListing(), { rent: 4500 }), {}, 10000);
a3 && a3.status === 'over'
  ? ok('affordability: 45% -> over')
  : bad('affordability over: ' + JSON.stringify(a3));
A.affordability(A.blankListing(), {}, 0) === null
  ? ok('affordability: null without income')
  : bad('affordability should be null');
const fr1 = A.filterReasons(Object.assign(A.blankListing(), { beds: 1, commuteMin: 40, amenities: [] }),
  { minBeds: 2, maxCommuteMin: 30, required: ['gym'], petFriendly: true });
fr1.length === 4
  ? ok('filterReasons: 4 reasons for a 4-way miss')
  : bad('filterReasons count: ' + JSON.stringify(fr1));
A.filterReasons(A.blankListing(), A.blankFilters()).length === 0
  ? ok('filterReasons: empty on blank filters')
  : bad('filterReasons false positive');

// second sweep: new UI ids wired
['opt-income', 'f-deposit'].every(id => html.includes('id="' + id + '"'))
  ? ok('index.html has income + deposit controls')
  : bad('missing second-sweep control ids in index.html');
const appjs = require('fs').readFileSync('/home/hatch/workspace/apartmenthunt-ai/js/app.js', 'utf8');
['affordability', 'moveInCost', 'filterReasons', 'afford-pill', 'eliminated', 'movein', 'toggle-hidden'].every(s => appjs.includes(s))
  ? ok('app.js wires affordability + move-in cash + eliminated view')
  : bad('app.js missing second-sweep wiring');
const css = require('fs').readFileSync('/home/hatch/workspace/apartmenthunt-ai/css/style.css', 'utf8');
['afford-pill', 'elim-card', 'linklike'].every(s => css.includes(s))
  ? ok('css styles the new components')
  : bad('css missing second-sweep styles');

// redesign sweep: photo + favorites
['fav-toggle', 'result-count', 'f-photo', 'photo-preview', 'photo-clear'].every(id => html.includes('id="' + id + '"'))
  ? ok('index.html has photo + favorites controls')
  : bad('missing photo/favorites control ids in index.html');
['skylineSvg', 'fileToPhoto', 'toggleFav', 'fav-btn', 'photo-band', 'favOnly'].every(s => appjs.includes(s))
  ? ok('app.js wires photo upload + favorites + skyline art')
  : bad('app.js missing photo/favorites wiring');
['photo-band', 'fav-btn', 'results-toolbar', 'skyline'].every(s => css.includes(s))
  ? ok('css styles photo band + toolbar')
  : bad('css missing photo band / toolbar styles');
('photo' in A.blankListing() && 'fav' in A.blankListing())
  ? ok('blankListing carries photo + fav fields')
  : bad('blankListing missing photo/fav');
const dup = A.duplicateListing(Object.assign(A.blankListing(), { name: 'X', fav: true, photo: 'data:image/jpeg;base64,AAA' }));
(dup.fav === true && dup.photo === 'data:image/jpeg;base64,AAA' && dup.id !== undefined)
  ? ok('duplicateListing preserves fav + photo')
  : bad('duplicateListing drops fav/photo');

console.log('--- node checks: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
NODEEOF
[ "$?" -eq 0 ] && ok "node logic suite green" || bad "node logic suite had failures"

echo "=== smoke: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
