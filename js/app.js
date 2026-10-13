/* ApartmentHunt AI — UI. Requires window.ApartmentHunt (js/apt.js). */
(function () {
  'use strict';
  var A = window.ApartmentHunt;
  var LS_LIST = 'apthunt.listings.v1';
  var LS_W = 'apthunt.weights.v1';
  var LS_OPT = 'apthunt.opts.v1';
  var LS_BUDGET = 'apthunt.budget.v1';
  var sortKey = 'score';
  var showHidden = false;
  var favOnly = false;

  /* Deterministic skyline art for listings without a photo.
   * Solid ink/green/amber blocks on a warm paper sky — no gradients. */
  function hashStr(s) {
    var h = 2166136261;
    s = String(s || 'x');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function skylineSvg(name, id) {
    var rnd = hashStr(name + '|' + id);
    var pick = function (n) { rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0; return rnd % n; };
    var skies = ['#ded5bd', '#d3d9c4', '#ddd2b8'];
    var bodies = ['#232c28', '#31423a', '#4c5a50', '#6e5a35', '#1b1712', '#3b3226'];
    var sky = skies[pick(skies.length)];
    var rects = '';
    var x = 0;
    while (x < 800) {
      var w = 52 + pick(56);
      var h = 110 + pick(130);
      var c = bodies[pick(bodies.length)];
      rects += '<rect x="' + x + '" y="' + (280 - h) + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>';
      // antenna on some buildings
      if (pick(3) === 0) {
        rects += '<rect x="' + (x + Math.floor(w / 2) - 1) + '" y="' + (280 - h - 26) + '" width="3" height="26" fill="' + c + '"/>';
      }
      var wx = x + 7;
      var wy0 = 280 - h + 10;
      while (wx < x + w - 11) {
        var r = 0;
        while (wy0 + r * 16 + 9 < 268 && r < 9) {
          if (pick(4) > 0) rects += '<rect x="' + wx + '" y="' + (wy0 + r * 16) + '" width="7" height="9" fill="#f3ecd9" opacity="0.5"/>';
          r++;
        }
        wx += 15;
      }
      x += w + 6 + pick(10);
    }
    return '<svg class="skyline" viewBox="0 0 800 280" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Building illustration">' +
      '<rect width="800" height="280" fill="' + sky + '"/>' +
      '<circle cx="' + (620 + pick(120)) + '" cy="' + (34 + pick(40)) + '" r="22" fill="#b45309" opacity="0.8"/>' +
      rects + '<rect y="272" width="800" height="8" fill="#171310"/></svg>';
  }

  /* Downscale an image File to a JPEG dataURL (max 800px side). */
  function fileToPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('not an image'));
        return;
      }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var max = 800;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var cw = Math.max(1, Math.round(img.width * scale));
          var ch = Math.max(1, Math.round(img.height * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/jpeg', 0.72));
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
      img.src = url;
    });
  }

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
      workDaysPerMonth: A.num(el('opt-days').value, 22),
      leaseMonths: parseInt(el('opt-term').value, 10) || 12,
      income: A.num(el('opt-income') ? el('opt-income').value : 0, 0)
    };
  }

  var LS_FLT = 'apthunt.filters.v1';
  function getFilters() {
    var req = [];
    var wrap = el('fl-amen');
    if (wrap) {
      wrap.querySelectorAll('input:checked').forEach(function (cb) { req.push(cb.value); });
    }
    return {
      minBeds: A.num(el('fl-beds') ? el('fl-beds').value : 0, 0),
      maxCommuteMin: A.num(el('fl-cmin') ? el('fl-cmin').value : 0, 0),
      required: req,
      petFriendly: !!(el('fl-pets') && el('fl-pets').checked)
    };
  }
  function filtersActive(f) {
    return (f.minBeds > 0) || (f.maxCommuteMin > 0) || (f.required.length > 0) || f.petFriendly;
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
      '<div class="tc-rent">listed rent <s>' + A.money(l.rent) + '</s> — fees, utilities &amp; commute add <b>' + A.money(extra) + '</b> <span class="tc-term">(fees ÷ ' + (cost.leaseMonths || 12) + ' mo)</span></div>' +
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
    var filters = getFilters();
    var kept = A.filterListings(listings, filters);
    var hidden = listings.length - kept.length;
    if (favOnly) {
      kept = kept.filter(function (l) { return !!l.fav; });
    }
    var opts = getOpts();
    var ranked = A.sortRanked(A.rank(kept, getWeights(), opts), sortKey);
    var box = el('ranked');
    box.innerHTML = '';
    if (hidden > 0) {
      box.innerHTML = '<div class="filter-note">' + hidden + ' listing' + (hidden === 1 ? '' : 's') +
        ' hidden by your deal-breaker filters. ' +
        '<button class="linklike" id="toggle-hidden">' + (showHidden ? 'Hide them' : 'Show why') + '</button></div>';
    }
    if (!ranked.length) {
      box.innerHTML += hidden > 0 && listings.length
        ? '<div class="empty"><strong>Everything is filtered out</strong>Loosen a deal-breaker below to see your listings again.</div>'
        : '<div class="empty"><strong>No listings yet</strong>Add your first apartment — or load the samples to see the true-cost math in action.</div>';
    }
    el('result-count').textContent = kept.length + ' of ' + listings.length + ' listing' + (listings.length === 1 ? '' : 's');
    var budgetCap = A.num(el('budget-cap').value, 0);
    var flags = A.budgetFlags(ranked, budgetCap);
    var income = opts.income;
    var winnerId = (ranked.length > 1 && sortKey === 'score' && ranked[0]) ? ranked[0].listing.id : null;
    ranked.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'card' + (r.listing.id === winnerId ? ' winner' : '');
      var medal = r.listing.id === winnerId
        ? ' <span class="best-pill">Best pick</span>' : '';
      var overBadge = flags.over[r.listing.id]
        ? ' <span class="budget-pill">Over budget</span>' : '';
      var aff = A.affordability(r.listing, opts, income);
      var affBadge = aff
        ? ' <span class="afford-pill ' + aff.status + '" title="True cost is ' + aff.pct + '% of your monthly income (30% rule)">' +
          aff.pct + '% of income</span>' : '';
      var mi = A.moveInCost(r.listing);
      var isFav = !!r.listing.fav;
      var photoBand = r.listing.photo
        ? '<img class="photo" src="' + esc(r.listing.photo) + '" alt="">'
        : skylineSvg(r.listing.name, r.listing.id);
      card.innerHTML =
        '<div class="photo-band">' + photoBand +
        '<button class="fav-btn" data-fav="' + r.listing.id + '" aria-pressed="' + isFav + '" aria-label="' + (isFav ? 'Remove from saved' : 'Save this listing') + '" title="' + (isFav ? 'Remove from saved' : 'Save this listing') + '">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.9-9.5-9C1 8.5 3 5 6.5 5c2 0 3.5 1.1 4.5 2.7C12 6.1 13.5 5 15.5 5 19 5 21 8.5 19.5 12c-2 4.1-7.5 9-7.5 9z"/></svg></button>' +
        '<div class="photo-overlay">' +
        '<div class="addr">' + esc(r.listing.address || 'no address listed') + '</div>' +
        '<div class="rank-chip">#' + r.rank + ' pick</div>' +
        '</div></div>' +
        '<div class="card-body">' +
        '<div class="card-title-row"><h3>' + esc(r.listing.name) + medal + overBadge + affBadge + '</h3>' +
        '<div class="score-ring" style="--s:' + r.score + '"><span>' + Math.round(r.score) + '</span></div></div>' +
        '<div class="meta">' +
        r.listing.beds + 'bd/' + r.listing.baths + 'ba · ' +
        (r.listing.sqft || '?') + ' sqft · ' +
        r.listing.commuteMin + ' min ' + esc(r.listing.commuteMode) + ' commute · ' +
        (r.listing.amenities || []).length + ' amenities</div>' +
        costLine(r.listing, r.cost) +
        '<div class="movein">Move-in cash: <b>' + A.money(mi.total) + '</b>' +
        '<span class="meta"> — first rent ' + A.money(mi.rent) + ' + ' + A.money(mi.fees) + ' fees + ' +
        A.money(mi.deposit) + ' deposit' + (mi.assumedDeposit ? ' (assumed = 1 mo rent)' : '') + '</span></div>' +
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
        '<div class="card-actions"><button data-dup="' + r.listing.id + '">Duplicate</button><button data-edit="' + r.listing.id + '">Edit</button></div></div>';
      box.appendChild(card);
    });
    box.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(b.getAttribute('data-edit')); });
    });
    box.querySelectorAll('[data-fav]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFav(b.getAttribute('data-fav'));
      });
    });
    box.querySelectorAll('[data-dup]').forEach(function (b) {
      b.addEventListener('click', function () { duplicateFrom(b.getAttribute('data-dup')); });
    });
    var th = el('toggle-hidden');
    if (th) th.addEventListener('click', function () {
      showHidden = !showHidden;
      render();
    });

    // eliminated by the deal-breakers — show why, on request
    if (showHidden && hidden > 0) {
      var eliminated = listings.filter(function (l) { return !A.passesFilters(l, filters); });
      var ewrap = document.createElement('div');
      ewrap.className = 'eliminated';
      ewrap.innerHTML = '<h3>Out of the running</h3>' + eliminated.map(function (l) {
        return '<div class="elim-card"><b>' + esc(l.name) + '</b><span>' +
          A.filterReasons(l, filters).map(esc).join(' · ') + '</span></div>';
      }).join('');
      box.appendChild(ewrap);
    }

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
      A.compareRows(ordered, opts, income).forEach(function (r) {
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

  var pendingPhoto = '';

  function toggleFav(id) {
    var listings = load(LS_LIST, []);
    listings.forEach(function (l) { if (l.id === id) l.fav = !l.fav; });
    save(LS_LIST, listings);
    render();
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
    el('f-deposit').value = l.deposit || '';
    el('f-utils').value = l.utilities || 0;
    el('f-cmin').value = l.commuteMin || 0;
    el('f-cmiles').value = l.commuteMiles || 0;
    el('f-cmode').value = l.commuteMode || 'drive';
    el('f-pass').value = l.transitPass || 0;
    el('f-pros').value = l.pros || '';
    el('f-cons').value = l.cons || '';
    el('f-notes').value = l.notes || '';
    pendingPhoto = l.photo || '';
    el('f-photo').value = '';
    var pv = el('photo-preview');
    pv.src = pendingPhoto;
    pv.style.display = pendingPhoto ? '' : 'none';
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
      deposit: A.num(el('f-deposit').value, 0),
      utilities: A.num(el('f-utils').value, 0),
      commuteMin: A.num(el('f-cmin').value, 0),
      commuteMiles: A.num(el('f-cmiles').value, 0),
      commuteMode: el('f-cmode').value,
      transitPass: A.num(el('f-pass').value, 0),
      amenities: amens,
      pros: el('f-pros').value.trim(),
      cons: el('f-cons').value.trim(),
      notes: el('f-notes').value.trim(),
      photo: pendingPhoto || '',
      fav: editingId ? (function () {
        var cur = null;
        load(LS_LIST, []).forEach(function (x) { if (x.id === editingId) cur = x; });
        return !!(cur && cur.fav);
      })() : false
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

    // restore weights + opts + budget + filters
    var w = load(LS_W, A.DEFAULT_WEIGHTS);
    el('w-price').value = w.price; el('w-space').value = w.space;
    el('w-commute').value = w.commute; el('w-amen').value = w.amenities;
    var o = load(LS_OPT, { commuteCostPerMile: 0.70, workDaysPerMonth: 22, leaseMonths: 12 });
    el('opt-cpm').value = o.commuteCostPerMile; el('opt-days').value = o.workDaysPerMonth;
    el('opt-term').value = String(o.leaseMonths || 12);
    if (el('opt-income')) el('opt-income').value = o.income || '';
    el('budget-cap').value = load(LS_BUDGET, '');

    // deal-breaker filters
    var flwrap = el('fl-amen');
    if (flwrap) {
      A.AMENITIES.forEach(function (a) {
        var lab = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = a;
        cb.addEventListener('change', function () {
          lab.classList.toggle('on', cb.checked);
          save(LS_FLT, getFilters());
          render();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(a));
        flwrap.appendChild(lab);
      });
      var fl = load(LS_FLT, A.blankFilters());
      el('fl-beds').value = fl.minBeds || '';
      el('fl-cmin').value = fl.maxCommuteMin || '';
      el('fl-pets').checked = !!fl.petFriendly;
      var need = {};
      (fl.required || []).forEach(function (a) { need[a] = true; });
      flwrap.querySelectorAll('input').forEach(function (cb) {
        cb.checked = !!need[cb.value];
        cb.closest('label').classList.toggle('on', cb.checked);
      });
    }
    ['fl-beds', 'fl-cmin'].forEach(function (id) {
      if (el(id)) el(id).addEventListener('input', function () {
        save(LS_FLT, getFilters());
        render();
      });
    });
    if (el('fl-pets')) el('fl-pets').addEventListener('change', function () {
      save(LS_FLT, getFilters());
      render();
    });
    if (el('clear-filters')) el('clear-filters').addEventListener('click', function () {
      save(LS_FLT, A.blankFilters());
      el('fl-beds').value = ''; el('fl-cmin').value = ''; el('fl-pets').checked = false;
      el('fl-amen').querySelectorAll('input').forEach(function (cb) {
        cb.checked = false;
        cb.closest('label').classList.toggle('on', false);
      });
      render();
    });

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
    ['opt-cpm', 'opt-days', 'opt-term'].forEach(function (id) {
      el(id).addEventListener('change', function () {
        save(LS_OPT, getOpts());
        render();
      });
    });
    if (el('opt-income')) el('opt-income').addEventListener('input', function () {
      save(LS_OPT, getOpts());
      render();
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
      var finish = function () {
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
      };
      var file = el('f-photo').files && el('f-photo').files[0];
      if (file) {
        el('form-errors').innerHTML = 'Processing photo…';
        fileToPhoto(file).then(function (dataUrl) {
          pendingPhoto = dataUrl;
          el('form-errors').innerHTML = '';
          finish();
        }, function () {
          el('form-errors').innerHTML = 'That photo could not be read — try a different image.';
        });
      } else {
        finish();
      }
    });
    el('photo-clear').addEventListener('click', function () {
      pendingPhoto = '';
      el('f-photo').value = '';
      el('photo-preview').src = '';
      el('photo-preview').style.display = 'none';
    });
    el('fav-toggle').addEventListener('click', function () {
      favOnly = !favOnly;
      el('fav-toggle').setAttribute('aria-pressed', String(favOnly));
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
