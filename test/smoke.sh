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

console.log('--- node checks: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
NODEEOF
[ "$?" -eq 0 ] && ok "node logic suite green" || bad "node logic suite had failures"

echo "=== smoke: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
