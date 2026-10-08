/* ApartmentHunt AI — UI. Requires window.ApartmentHunt (js/apt.js). */
(function () {
  'use strict';
  var A = window.ApartmentHunt;
  var LS_LIST = 'apthunt.listings.v1';
  var LS_W = 'apthunt.weights.v1';
  var LS_OPT = 'apthunt.opts.v1';
  var LS_BUDGET = 'apthunt.budget.v1';
  var sortKey = 'score';

  function load(k, fb) {
    try { var raw = localStorage.getItem(k); if (raw) return JSON.parse(raw); }
    catch (e) {}
    return fb;
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var editingId = null;

  function getWeights() {
    return {
      price: A.num(el('w-price').value, 40),
      space: A.num(el('w-space').value, 20),
      commute: A.num(el('w-commute').value, 25),
      amenities: A.num(el('w-amen').value, 15)
    };
  }
  function getOpts() {
    return {
      commuteCostPerMile: A.num(el('opt-cpm').value, 0.70),
      workDaysPerMonth: A.num(el('opt-days').value, 22)
    };
  }

  function segPct(part, total) {
    return total > 0 ? Math.max(0, Math.min(100, (part / total) * 100)) : 0;
  }

  function trueCostHtml(l, cost) {
    var total = cost.total || 0;
    var p = function (v) { return segPct(v, total).toFixed(1) + '%'; };
    var extra = total - A.num(l.rent, 0);
    return '<div class="true-cost">' +
      '<div class="tc-kicker">True monthly cost</div>' +
      '<div class="tc-value">' + A.money(total) + '<small>/mo</small></div>' +
      '<div class="tc-rent">listed rent <s>' + A.money(l.rent) + '</s> — fees, utilities &amp; commute add <b>' + A.money(extra) + '</b></div>' +
      '<div class="tc-bar" role="img" aria-label="True cost breakdown: rent, fees, utilities, commute">' +
      '<i class="seg-rent" style="width:' + p(cost.rent) + '"></i>' +
      '<i class="seg-fees" style="width:' + p(cost.feesMonthly) + '"></i>' +
      '<i class="seg-utils" style="width:' + p(cost.utilities) + '"></i>' +
      '<i class="seg-commute" style="width:' + p(cost.commute) + '"></i>' +
      '</div>' +
      '<div class="tc-legend">' +
      '<span><i class="dot" style="background:#155048"></i>Rent <b>' + A.money(cost.rent) + '</b></span>' +
      '<span><i class="dot" style="background:#d97706"></i>Fees <b>' + A.money(cost.feesMonthly) + '</b></span>' +
      '<span><i class="dot" style="background:#b8a888"></i>Utilities <b>' + A.money(cost.utilities) + '</b></span>' +
      '<span><i class="dot" style="background:#d9cfb8"></i>Commute <b>' + A.money(cost.commute) + '</b></span>' +
      '</div></div>';
  }

  function factorHtml(label, val) {
    var v = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    return '<div class="factor"><span>' + label + '</span>' +
      '<div class="frow"><div class="fbar"><i style="width:' + v + '%"></i></div><b>' + v + '</b></div></div>';
  }

  function costLine(l, cost) {
    return trueCostHtml(l, cost);
  }

  function render() {
    var listings = load(LS_LIST, []);
    var ranked = A.sortRanked(A.rank(listings, getWeights(), getOpts()), sortKey);
    var box = el('ranked');
    box.innerHTML = '';
    if (!ranked.length) {
      box.innerHTML = '<div class="empty"><strong>No listings yet</strong>Add your first apartment — or load the samples to see the true-cost math in action.</div>';
    }
    var budgetCap = A.num(el('budget-cap').value, 0);
    var flags = A.budgetFlags(ranked, budgetCap);
    var winnerId = (ranked.length > 1 && sortKey === 'score' && ranked[0]) ? ranked[0].listing.id : null;
    ranked.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'card' + (r.listing.id === winnerId ? ' winner' : '');
      var medal = r.listing.id === winnerId
        ? ' <span class="best-pill">Best pick</span>' : '';
      var overBadge = flags.over[r.listing.id]
        ? ' <span class="budget-pill">Over budget</span>' : '';
      card.innerHTML =
        '<div class="card-top">' +
        '<div class="score-ring" style="--s:' + r.score + '"><span>' + Math.round(r.score) + '</span></div>' +
        '<div class="card-id"><h3>' + esc(r.listing.name) + medal + overBadge + '</h3>' +
        '<div class="meta">' + esc(r.listing.address || 'no address') + ' · ' +
        r.listing.beds + 'bd/' + r.listing.baths + 'ba · ' +
        (r.listing.sqft || '?') + ' sqft · ' +
        r.listing.commuteMin + ' min ' + esc(r.listing.commuteMode) + ' commute · ' +
        (r.listing.amenities || []).length + ' amenities</div></div>' +
        '<div class="rank-chip">#' + r.rank + ' pick</div>' +
        '</div>' +
        costLine(r.listing, r.cost) +
        '<div class="factors">' +
        factorHtml('Price', r.breakdown.price) +
        factorHtml('Space', r.breakdown.space) +
        factorHtml('Commute', r.breakdown.commute) +
        factorHtml('Amenities', r.breakdown.amenities) +
        '</div>' +
        (r.listing.pros || r.listing.cons
          ? '<div class="proscons">' +
            (r.listing.pros ? '<span class="pro"><b>Pros</b> — ' + esc(r.listing.pros) + '</span>' : '') +
            (r.listing.cons ? '<span class="con"><b>Cons</b> — ' + esc(r.listing.cons) + '</span>' : '') +
            '</div>' : '') +
        '<div class="card-actions"><button data-dup="' + r.listing.id + '">Duplicate</button><button data-edit="' + r.listing.id + '">Edit</button></div>';
      box.appendChild(card);
    });
    box.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(b.getAttribute('data-edit')); });
    });
    box.querySelectorAll('[data-dup]').forEach(function (b) {
      b.addEventListener('click', function () { duplicateFrom(b.getAttribute('data-dup')); });
    });

    // comparison table (follows the active sort)
    var thead = el('compare').querySelector('thead');
    var tbody = el('compare').querySelector('tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    var ordered = ranked.map(function (r) { return r.listing; });
    if (ordered.length) {
      var hr = document.createElement('tr');
      hr.innerHTML = '<th>Feature</th>' + ordered.map(function (l) {
        return '<th' + (winnerId && l.id === winnerId ? ' class="win-col"' : '') + '>' + esc(l.name) + '</th>';
      }).join('');
      thead.appendChild(hr);
      A.compareRows(ordered, getOpts()).forEach(function (r) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<th>' + esc(r.label) + '</th>' + r.values.map(function (v, i) {
          return '<td' + (winnerId && ordered[i] && ordered[i].id === winnerId ? ' class="win-col"' : '') + '>' + esc(v) + '</td>';
        }).join('');
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td class="meta">Add listings to compare them side by side.</td></tr>';
    }
  }

  function duplicateFrom(id) {
    var listings = load(LS_LIST, []);
    var found = null;
    listings.forEach(function (l) { if (l.id === id) found = l; });
    if (!found) return;
    var copy = A.duplicateListing(found);
    listings.push(copy);
    save(LS_LIST, listings);
    openModal(copy.id);
  }

  function fillForm(l) {
    el('f-name').value = l.name || '';
    el('f-address').value = l.address || '';
    el('f-rent').value = l.rent || '';
    el('f-sqft').value = l.sqft || '';
    el('f-beds').value = l.beds || '';
    el('f-baths').value = l.baths || '';
    el('f-fees').value = l.fees || 0;
    el('f-utils').value = l.utilities || 0;
    el('f-cmin').value = l.commuteMin || 0;
    el('f-cmiles').value = l.commuteMiles || 0;
    el('f-cmode').value = l.commuteMode || 'drive';
    el('f-pass').value = l.transitPass || 0;
    el('f-pros').value = l.pros || '';
    el('f-cons').value = l.cons || '';
    el('f-notes').value = l.notes || '';
    var have = {};
    (l.amenities || []).forEach(function (a) { have[a] = true; });
    el('f-amen').querySelectorAll('input').forEach(function (cb) {
      cb.checked = !!have[cb.value];
      cb.closest('label').classList.toggle('on', cb.checked);
    });
    el('form-errors').innerHTML = '';
  }

  function readForm() {
    var amens = [];
    el('f-amen').querySelectorAll('input:checked').forEach(function (cb) { amens.push(cb.value); });
    return {
      id: editingId || A.uid('l'),
      name: el('f-name').value.trim(),
      address: el('f-address').value.trim(),
      rent: A.num(el('f-rent').value, 0),
      sqft: A.num(el('f-sqft').value, 0),
      beds: A.num(el('f-beds').value, 0),
      baths: A.num(el('f-baths').value, 0),
      fees: A.num(el('f-fees').value, 0),
      utilities: A.num(el('f-utils').value, 0),
      commuteMin: A.num(el('f-cmin').value, 0),
      commuteMiles: A.num(el('f-cmiles').value, 0),
      commuteMode: el('f-cmode').value,
      transitPass: A.num(el('f-pass').value, 0),
      amenities: amens,
      pros: el('f-pros').value.trim(),
      cons: el('f-cons').value.trim(),
      notes: el('f-notes').value.trim()
    };
  }

  function openModal(id) {
    editingId = id || null;
    var listings = load(LS_LIST, []);
    var found = null;
    listings.forEach(function (l) { if (l.id === id) found = l; });
    el('modal-title').textContent = found ? 'Edit listing' : 'Add listing';
    el('delete-listing').classList.toggle('hidden', !found);
    fillForm(found || A.blankListing());
    el('modal').classList.remove('hidden');
  }
  function closeModal() {
    el('modal').classList.add('hidden');
    editingId = null;
  }

  function sampleListings() {
    var mk = function (o) {
      var l = A.blankListing();
      Object.keys(o).forEach(function (k) { l[k] = o[k]; });
      return l;
    };
    return [
      mk({ name: 'Sunset Lofts — 4B', address: '88 Sunset Ave', rent: 2400, sqft: 950,
           beds: 2, baths: 2, fees: 1200, utilities: 140, commuteMin: 35,
           commuteMiles: 14, commuteMode: 'drive',
           amenities: ['in-unit laundry', 'dishwasher', 'parking', 'gym'],
           pros: 'Huge windows, great light', cons: 'Street noise, thin walls' }),
      mk({ name: 'Maple Court — 2A', address: '12 Maple St', rent: 1950, sqft: 780,
           beds: 1, baths: 1, fees: 300, utilities: 110, commuteMin: 20,
           commuteMiles: 0, commuteMode: 'transit', transitPass: 99,
           amenities: ['dishwasher', 'pet friendly', 'balcony'],
           pros: 'Cheap, 20-min train ride', cons: 'Small kitchen, no parking' }),
      mk({ name: 'The Foundry — 9C', address: '400 Iron Way', rent: 2650, sqft: 1100,
           beds: 2, baths: 2, fees: 2650, utilities: 160, commuteMin: 12,
           commuteMiles: 4, commuteMode: 'bike',
           amenities: ['in-unit laundry', 'dishwasher', 'gym', 'pool', 'doorman', 'elevator', 'central AC'],
           pros: '12-min bike, loaded with amenities', cons: 'Priciest, broker fee stings' })
    ];
  }

  function init() {
    // amenity chips
    var wrap = el('f-amen');
    A.AMENITIES.forEach(function (a) {
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = a;
      cb.addEventListener('change', function () { lab.classList.toggle('on', cb.checked); });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(a));
      wrap.appendChild(lab);
    });

    // restore weights + opts + budget
    var w = load(LS_W, A.DEFAULT_WEIGHTS);
    el('w-price').value = w.price; el('w-space').value = w.space;
    el('w-commute').value = w.commute; el('w-amen').value = w.amenities;
    var o = load(LS_OPT, { commuteCostPerMile: 0.70, workDaysPerMonth: 22 });
    el('opt-cpm').value = o.commuteCostPerMile; el('opt-days').value = o.workDaysPerMonth;
    el('budget-cap').value = load(LS_BUDGET, '');

    function syncLabels() {
      el('w-price-v').textContent = el('w-price').value;
      el('w-space-v').textContent = el('w-space').value;
      el('w-commute-v').textContent = el('w-commute').value;
      el('w-amen-v').textContent = el('w-amen').value;
      ['w-price', 'w-space', 'w-commute', 'w-amen'].forEach(function (id) {
        el(id).style.setProperty('--fill', el(id).value + '%');
      });
    }
    ['w-price', 'w-space', 'w-commute', 'w-amen'].forEach(function (id) {
      el(id).addEventListener('input', function () {
        syncLabels();
        save(LS_W, getWeights());
        render();
      });
    });
    ['opt-cpm', 'opt-days'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        save(LS_OPT, getOpts());
        render();
      });
    });
    syncLabels();

    el('add-listing').addEventListener('click', function () { openModal(null); });
    el('sort-by').addEventListener('change', function () {
      sortKey = el('sort-by').value;
      render();
    });
    el('budget-cap').addEventListener('input', function () {
      save(LS_BUDGET, el('budget-cap').value);
      render();
    });
    el('export-csv').addEventListener('click', function () {
      var listings = load(LS_LIST, []);
      if (!listings.length) return;
      var csv = A.shortlistCSV(listings, getWeights(), getOpts());
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'apartmenthunt-shortlist.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    el('reset-weights').addEventListener('click', function () {
      el('w-price').value = A.DEFAULT_WEIGHTS.price;
      el('w-space').value = A.DEFAULT_WEIGHTS.space;
      el('w-commute').value = A.DEFAULT_WEIGHTS.commute;
      el('w-amen').value = A.DEFAULT_WEIGHTS.amenities;
      syncLabels();
      save(LS_W, getWeights());
      render();
    });
    el('modal-close').addEventListener('click', closeModal);
    el('modal').addEventListener('click', function (e) {
      if (e.target === el('modal')) closeModal();
    });
    el('listing-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var l = readForm();
      var errs = A.validateListing(l);
      if (errs.length) {
        el('form-errors').innerHTML = errs.map(esc).join('<br>');
        return;
      }
      var listings = load(LS_LIST, []);
      var i = -1;
      listings.forEach(function (x, xi) { if (x.id === l.id) i = xi; });
      if (i >= 0) listings[i] = l; else listings.push(l);
      save(LS_LIST, listings);
      closeModal();
      render();
    });
    el('delete-listing').addEventListener('click', function () {
      if (!editingId) return;
      save(LS_LIST, load(LS_LIST, []).filter(function (l) { return l.id !== editingId; }));
      closeModal();
      render();
    });
    el('load-sample').addEventListener('click', function () {
      if (!load(LS_LIST, []).length || confirm('Replace your listings with the samples?')) {
        save(LS_LIST, sampleListings());
        render();
      }
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
