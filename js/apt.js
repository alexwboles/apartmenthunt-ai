/* ApartmentHunt AI — listing comparison + true-cost engine.
 * Pure logic, no DOM. Works in the browser (window.ApartmentHunt)
 * and in node (module.exports) so tests can require() it. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ApartmentHunt = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AMENITIES = [
    'in-unit laundry', 'dishwasher', 'parking', 'gym', 'pool',
    'pet friendly', 'balcony', 'doorman', 'elevator', 'central AC'
  ];

  var DEFAULT_WEIGHTS = { price: 40, space: 20, commute: 25, amenities: 15 };

  function num(v, d) {
    v = parseFloat(v);
    return isNaN(v) ? d : v;
  }

  function money(n) {
    n = Math.round(num(n, 0) * 100) / 100;
    var parts = n.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '$' + parts.join('.');
  }

  function uid(prefix) {
    return (prefix || 'l') + Date.now().toString(36) +
      Math.floor(Math.random() * 1296).toString(36);
  }

  function blankListing() {
    return {
      id: uid('l'),
      name: '',
      address: '',
      rent: 0,
      sqft: 0,
      beds: 0,
      baths: 0,
      fees: 0,          // one-time move-in fees, amortized over 12 months
      utilities: 0,     // estimated monthly utilities
      commuteMin: 0,    // one-way minutes
      commuteMiles: 0,  // one-way miles
      commuteMode: 'drive', // drive | transit | walk | bike
      transitPass: 0,   // monthly transit pass cost (when mode = transit)
      amenities: [],
      pros: '',
      cons: '',
      notes: ''
    };
  }

  function validateListing(l) {
    var errs = [];
    if (!l.name || !String(l.name).trim()) errs.push('Name is required.');
    if (num(l.rent, 0) <= 0) errs.push('Rent must be greater than 0.');
    if (num(l.sqft, 0) < 0) errs.push('Square footage cannot be negative.');
    if (num(l.beds, 0) < 0) errs.push('Bedrooms cannot be negative.');
    if (num(l.commuteMin, 0) < 0) errs.push('Commute minutes cannot be negative.');
    if (num(l.fees, 0) < 0) errs.push('Fees cannot be negative.');
    if (num(l.utilities, 0) < 0) errs.push('Utilities cannot be negative.');
    return errs;
  }

  /* True monthly cost: rent + amortized one-time fees + utilities + commute.
   * Drive commute cost = round-trip miles x work days x IRS-ish $/mile.
   * Transit commute cost = monthly pass. Walk/bike = $0. */
  function trueCost(l, opts) {
    opts = opts || {};
    var rent = num(l.rent, 0);
    var feesMonthly = num(l.fees, 0) / 12;
    var utilities = num(l.utilities, 0);
    var commute = 0;
    if (l.commuteMode === 'transit') {
      commute = num(l.transitPass, num(opts.transitPass, 0));
    } else if (l.commuteMode === 'drive') {
      var cpm = num(opts.commuteCostPerMile, 0.70);
      var days = num(opts.workDaysPerMonth, 22);
      commute = num(l.commuteMiles, 0) * 2 * days * cpm;
    }
    var total = rent + feesMonthly + utilities + commute;
    return {
      rent: Math.round(rent * 100) / 100,
      feesMonthly: Math.round(feesMonthly * 100) / 100,
      utilities: Math.round(utilities * 100) / 100,
      commute: Math.round(commute * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  function factorValue(l, factor, opts) {
    switch (factor) {
      case 'price': return trueCost(l, opts).total;      // lower is better
      case 'space': return num(l.sqft, 0);                // higher is better
      case 'commute': return num(l.commuteMin, 0);        // lower is better
      case 'amenities': return (l.amenities || []).length;// higher is better
      default: return 0;
    }
  }

  var LOWER_BETTER = { price: true, commute: true };

  /* Weighted 0-100 score per listing, normalized across the compared set.
   * weights: { price, space, commute, amenities } — normalized internally. */
  function score(listings, weights, opts) {
    weights = weights || {};
    var w = {
      price: num(weights.price, DEFAULT_WEIGHTS.price),
      space: num(weights.space, DEFAULT_WEIGHTS.space),
      commute: num(weights.commute, DEFAULT_WEIGHTS.commute),
      amenities: num(weights.amenities, DEFAULT_WEIGHTS.amenities)
    };
    var wSum = w.price + w.space + w.commute + w.amenities;
    if (wSum <= 0) {
      w = { price: 25, space: 25, commute: 25, amenities: 25 };
      wSum = 100;
    }
    var factors = ['price', 'space', 'commute', 'amenities'];
    var ranges = {};
    factors.forEach(function (f) {
      var vals = listings.map(function (l) { return factorValue(l, f, opts); });
      ranges[f] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
    });
    return listings.map(function (l) {
      var breakdown = {};
      var total = 0;
      factors.forEach(function (f) {
        var r = ranges[f];
        var v = factorValue(l, f, opts);
        var s;
        if (r.max === r.min) {
          s = 1; // no variance: everyone ties
        } else if (LOWER_BETTER[f]) {
          s = (r.max - v) / (r.max - r.min);
        } else {
          s = (v - r.min) / (r.max - r.min);
        }
        s = Math.max(0, Math.min(1, s));
        breakdown[f] = Math.round(s * 1000) / 10;
        total += s * (w[f] / wSum);
      });
      return {
        id: l.id,
        score: Math.round(total * 1000) / 10,
        breakdown: breakdown,
        cost: trueCost(l, opts)
      };
    });
  }

  function rank(listings, weights, opts) {
    var scored = score(listings, weights, opts);
    var byId = {};
    listings.forEach(function (l) { byId[l.id] = l; });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s, i) {
      return { rank: i + 1, listing: byId[s.id], score: s.score,
               breakdown: s.breakdown, cost: s.cost };
    });
  }

  /* Side-by-side comparison rows for a table. */
  function compareRows(listings, opts) {
    var scored = {};
    score(listings, {}, opts).forEach(function (s) { scored[s.id] = s; });
    function row(label, fn) {
      return { label: label, values: listings.map(fn) };
    }
    return [
      row('Monthly rent', function (l) { return money(l.rent); }),
      row('True monthly cost', function (l) { return money(scored[l.id].cost.total); }),
      row('Sq ft', function (l) { return String(num(l.sqft, 0)); }),
      row('Bed / bath', function (l) { return l.beds + ' / ' + l.baths; }),
      row('Commute (one-way)', function (l) {
        return l.commuteMin + ' min (' + l.commuteMode + ')';
      }),
      row('Amenities', function (l) { return String((l.amenities || []).length); }),
      row('Overall score', function (l) { return scored[l.id].score + ' / 100'; })
    ];
  }

  function escapeCsvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* Export the ranked shortlist as CSV: one row per listing with rent,
   * true-cost breakdown, commute, score, and amenities. */
  function shortlistCSV(listings, weights, opts) {
    var ranked = rank(listings, weights, opts);
    var rows = [[
      'rank', 'name', 'address', 'rent', 'fees_monthly', 'utilities',
      'commute_cost', 'true_monthly_cost', 'sqft', 'beds', 'baths',
      'commute_min', 'commute_mode', 'amenities', 'score', 'pros', 'cons'
    ]];
    ranked.forEach(function (r) {
      var l = r.listing, c = r.cost;
      rows.push([
        r.rank, l.name, l.address || '', c.rent, c.feesMonthly, c.utilities,
        c.commute, c.total, num(l.sqft, 0), l.beds, l.baths,
        num(l.commuteMin, 0), l.commuteMode, (l.amenities || []).join('; '),
        r.score, l.pros || '', l.cons || ''
      ]);
    });
    return rows.map(function (r) { return r.map(escapeCsvCell).join(','); }).join('\n');
  }

  /* Re-sort an already-ranked list. Keys: 'score' | 'cost' | 'space' | 'commute'. */
  function sortRanked(ranked, key) {
    var arr = (ranked || []).slice();
    var by = {
      score: function (a, b) { return b.score - a.score; },
      cost: function (a, b) { return a.cost.total - b.cost.total; },
      space: function (a, b) { return num(b.listing.sqft, 0) - num(a.listing.sqft, 0); },
      commute: function (a, b) { return num(a.listing.commuteMin, 0) - num(b.listing.commuteMin, 0); }
    }[key] || function (a, b) { return b.score - a.score; };
    arr.sort(by);
    arr.forEach(function (r, i) { r.rank = i + 1; });
    return arr;
  }

  /* Flag listings whose true monthly cost exceeds maxBudget (>0).
   * Returns { over: {id:true}, count }. */
  function budgetFlags(ranked, maxBudget) {
    var over = {};
    var cap = num(maxBudget, 0);
    var count = 0;
    (ranked || []).forEach(function (r) {
      if (cap > 0 && r.cost.total > cap) { over[r.listing.id] = true; count++; }
    });
    return { over: over, count: count };
  }

  /* Copy a listing for editing as a new unit (new id, "(copy)" name). */
  function duplicateListing(l) {
    var src = l || blankListing();
    var copy = blankListing();
    Object.keys(src).forEach(function (k) { if (k !== 'id') copy[k] = src[k]; });
    copy.amenities = (src.amenities || []).slice();
    copy.name = (src.name || 'Listing') + ' (copy)';
    return copy;
  }

  return {
    AMENITIES: AMENITIES,
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    num: num,
    money: money,
    uid: uid,
    blankListing: blankListing,
    validateListing: validateListing,
    trueCost: trueCost,
    score: score,
    rank: rank,
    compareRows: compareRows,
    shortlistCSV: shortlistCSV,
    sortRanked: sortRanked,
    budgetFlags: budgetFlags,
    duplicateListing: duplicateListing
  };
}));
