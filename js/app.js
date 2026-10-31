(function () {
  var L = window.GT7Logic;
  var catalog = L.buildCatalog(window.GT7_ROWS);
  var $ = function (id) { return document.getElementById(id); };
  var sel = null;
  var race = null;
  var pit = null;
  var tires = null;
  var S = window.GT7Strategy;
  var strategy = null;
  var memo = { sig: null, res: null, renderKey: null };

  function store() {
    try { return window.localStorage; }
    catch (e) { return { getItem: function () { return null; }, setItem: function () { throw e; } }; }
  }

  function renderList() {
    var tracks = L.filterCatalog(catalog, $('search').value);
    var list = $('circuit-list');
    list.textContent = '';
    L.groupByCircuit(tracks).forEach(function (g) {
      var box = document.createElement('div');
      box.className = 'group';
      var h = document.createElement('h3');
      h.textContent = g.circuit + ' (' + g.country + ')';
      box.appendChild(h);
      g.layouts.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'track';
        b.dataset.id = t.id;
        b.setAttribute('aria-pressed', sel && sel.trackId === t.id ? 'true' : 'false');
        var name = document.createElement('span');
        name.textContent = t.layout;
        var len = document.createElement('b');
        len.textContent = L.formatKm(t.km) + ' km';
        b.appendChild(name); b.appendChild(len);
        b.addEventListener('click', function () { choose(t); });
        box.appendChild(b);
      });
      list.appendChild(box);
    });
    $('count').textContent = tracks.length === 0 ? 'Aucun résultat. Essayez un autre mot.' : tracks.length + ' tracé(s) affiché(s)';
  }

  function renderDetail(keepInput) {
    $('empty').hidden = !!sel;
    $('detail').hidden = !sel;
    renderRace(keepInput);
    renderPit(true);
    if (!sel) return;
    var t = L.findTrack(catalog, sel.trackId);
    $('sel-circuit').textContent = t.circuit + ' – ' + t.country;
    $('sel-layout').textContent = t.layout;
    $('sel-source').textContent = t.verified
      ? 'Longueur officielle confirmée.'
      : 'Longueur approximative : vérifiez-la dans le jeu et corrigez-la au besoin.';
    $('official').textContent = L.formatKm(sel.officialKm) + ' km (' + L.formatMiles(sel.officialKm) + ' mi)';
    if (!keepInput) $('length').value = L.formatKm(sel.lengthKm);
    var d = L.deltaKm(sel);
    $('summary').textContent = sel.modified
      ? 'Longueur modifiée : ' + L.formatKm(sel.lengthKm) + ' km (' + (d > 0 ? '+' : '−') + L.formatKm(Math.abs(d)) + ' km par rapport à l’officielle).'
      : 'Longueur officielle utilisée : ' + L.formatKm(sel.lengthKm) + ' km.';
    $('summary').className = 'summary' + (sel.modified ? ' modified' : '');
    $('reset').disabled = !sel.modified;
  }

  function renderRace(keepInputs) {
    $('race-locked').hidden = !!sel;
    $('race-form').hidden = !sel;
    if (!sel) return;
    var dur = race.mode === 'duration';
    $('mode-duration').checked = dur;
    $('mode-laps').checked = !dur;
    $('duration-block').hidden = !dur;
    $('laps-block').hidden = dur;
    if (!keepInputs) {
      $('duration').value = String(race.durationMin);
      $('laps').value = String(race.laps);
      setError('duration', '');
      setError('laps', '');
    }
    $('race-summary').textContent = L.describeRace(race);
    var d = L.distanceInfo(race, sel.lengthKm);
    $('distance-value').textContent = d ? d.kmText : '';
    $('distance-detail').textContent = d ? d.formula + ' (' + d.milesText + ')' : '';
    Array.prototype.forEach.call($('presets').children, function (b) {
      b.setAttribute('aria-pressed', dur && race.durationMin === Number(b.dataset.min) ? 'true' : 'false');
    });
    renderStrategy();
  }
  function setError(id, msg) {
    $(id + '-msg').textContent = msg;
    if (msg) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid');
  }
  var PIT_FIELDS = [
    { id: 'pit-time', key: 'pitSec', parse: L.parsePitTime },
    { id: 'tire-time', key: 'tireSec', parse: L.parseTireTime },
    { id: 'fill-rate', key: 'fillRate', parse: L.parseFillRate },
    { id: 'consumption', key: 'consumption', parse: L.parseConsumption }
  ];
  function renderPit(keepInputs) {
    if (!keepInputs) PIT_FIELDS.forEach(function (f) {
      $(f.id).value = pit[f.key] === null ? '' : L.formatDec(pit[f.key], 2);
      setError(f.id, '');
    });
    var st = L.pitStatus(pit);
    $('pit-status').textContent = st.complete ? 'Les 4 valeurs sont renseignées.' : 'À remplir : ' + st.missing.join(', ') + '.';
    $('pit-status').className = 'status' + (st.complete ? ' ok' : '');
    var list = $('pit-derived');
    list.textContent = '';
    L.pitSummary(pit, sel ? sel.lengthKm : null).forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      list.appendChild(li);
    });
    $('pit-derived-box').hidden = list.children.length === 0;
    renderTires(true);
  }
  var TIRE_FIELDS = [];
  L.COMPOUNDS.forEach(function (c) {
    TIRE_FIELDS.push({ id: c.key + '-lap', comp: c.key, field: 'lapSec', parse: L.parseLapTime });
    TIRE_FIELDS.push({ id: c.key + '-laps', comp: c.key, field: 'maxLaps', parse: L.parseMaxLaps });
  });
  function fillList(id, boxId, items) {
    var list = $(id);
    list.textContent = '';
    items.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      list.appendChild(li);
    });
    $(boxId).hidden = items.length === 0;
  }
  function renderTires(keepInputs) {
    L.COMPOUNDS.forEach(function (c) { $(c.key + '-req').checked = !!tires[c.key].required; });
    if (!keepInputs) TIRE_FIELDS.forEach(function (f) {
      var v = tires[f.comp][f.field];
      $(f.id).value = v === null ? '' : (f.field === 'lapSec' ? L.formatLapTime(v) : String(v));
      setError(f.id, '');
    });
    var st = L.tiresStatus(tires), msg;
    if (st.issues.length) msg = st.issues.join(' ');
    else if (!st.done.length) msg = 'Renseignez au moins une gomme (temps moyen au tour et nombre maximal de tours).';
    else msg = st.done.length + (st.done.length > 1 ? ' gommes renseignées : ' : ' gomme renseignée : ') + st.done.join(', ') + '.';
    $('tire-status').textContent = msg;
    $('tire-status').className = 'status' + (st.complete ? ' ok' : '');
    fillList('tire-derived', 'tire-derived-box', L.tiresSummary(tires, sel ? sel.lengthKm : null, L.fuelFullLaps(pit)));
    fillList('tire-warnings', 'tire-warn-box', L.tiresWarnings(tires));
    renderStrategy();
  }
  function persistTires() { L.saveTires(store(), tires); }
  function persistPit() { L.savePit(store(), pit); }
  function persistRace() { L.saveRace(store(), race); }

  function clearError() {
    $('length-msg').textContent = '';
    $('length').removeAttribute('aria-invalid');
  }
  function persist() { L.save(store(), sel); }

  function choose(t) {
    sel = L.createSelection(t);
    clearError(); persist(); renderList(); renderDetail(false);
  }

  $('search').addEventListener('input', renderList);
  $('length').addEventListener('input', function () {
    if (!sel) return;
    var p = L.parseLength($('length').value);
    if (!p.ok) {
      $('length-msg').textContent = p.error;
      $('length').setAttribute('aria-invalid', 'true');
      return;
    }
    clearError();
    sel = L.withLength(sel, p.km);
    persist(); renderDetail(true);
  });
  $('length').addEventListener('blur', function () {
    if (!sel) return;
    clearError(); renderDetail(false);
  });
  $('reset').addEventListener('click', function () {
    sel = L.resetLength(sel);
    clearError(); persist(); renderDetail(false);
  });

  L.PRESETS.forEach(function (m) {
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.min = String(m);
    b.textContent = L.formatDuration(m);
    b.addEventListener('click', function () {
      race = L.setDuration(race, m);
      persistRace(); renderRace(false);
    });
    $('presets').appendChild(b);
  });
  ['mode-duration', 'mode-laps'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      race = L.setMode(race, $(id).value);
      persistRace(); renderRace(false);
    });
  });
  $('duration').addEventListener('input', function () {
    var p = L.parseDuration($('duration').value);
    if (!p.ok) { setError('duration', p.error); return; }
    setError('duration', '');
    race = L.setDuration(race, p.minutes);
    persistRace(); renderRace(true);
  });
  $('laps').addEventListener('input', function () {
    var p = L.parseLaps($('laps').value);
    if (!p.ok) { setError('laps', p.error); return; }
    setError('laps', '');
    race = L.setLaps(race, p.laps);
    persistRace(); renderRace(true);
  });
  $('duration').addEventListener('blur', function () { renderRace(false); });
  $('laps').addEventListener('blur', function () { renderRace(false); });

  PIT_FIELDS.forEach(function (f) {
    $(f.id).addEventListener('input', function () {
      var raw = $(f.id).value;
      if (raw.trim() === '') {
        setError(f.id, '');
        pit = L.setPitField(pit, f.key, null);
        persistPit(); renderPit(true);
        return;
      }
      var p = f.parse(raw);
      if (!p.ok) { setError(f.id, p.error); return; }
      setError(f.id, '');
      pit = L.setPitField(pit, f.key, p.value);
      persistPit(); renderPit(true);
    });
    $(f.id).addEventListener('blur', function () { renderPit(false); });
  });

  TIRE_FIELDS.forEach(function (f) {
    $(f.id).addEventListener('input', function () {
      var raw = $(f.id).value;
      if (raw.trim() === '') {
        setError(f.id, '');
        tires = L.setTireField(tires, f.comp, f.field, null);
        persistTires(); renderTires(true);
        return;
      }
      var p = f.parse(raw);
      if (!p.ok) { setError(f.id, p.error); return; }
      setError(f.id, '');
      tires = L.setTireField(tires, f.comp, f.field, p.value);
      persistTires(); renderTires(true);
    });
    $(f.id).addEventListener('blur', function () { renderTires(false); });
  });


  /* ---------- Étape 5 : stratégie ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function persistStrategy() { L.saveStrategy(store(), strategy); }
  function nLaps(n) { return n + (n === 1 ? ' tour' : ' tours'); }
  function signed(n, d) { return (n > 0 ? '+' : n < 0 ? '−' : '') + L.formatDec(Math.abs(n), d); }

  function makeTable(caption, heads) {
    var t = el('table', 'tbl');
    t.appendChild(el('caption', 'sr-only', caption));
    var tr = el('tr');
    heads.forEach(function (h) { var th = el('th', null, h); th.scope = 'col'; tr.appendChild(th); });
    var thead = el('thead'); thead.appendChild(tr); t.appendChild(thead);
    t.appendChild(el('tbody'));
    return t;
  }
  function addRow(table, cells, cls) {
    var tr = el('tr', cls || '');
    cells.forEach(function (c, i) {
      var td = typeof c === 'string' ? el(i === 0 ? 'th' : 'td', null, c) : c;
      if (i === 0 && td.tagName === 'TH') td.scope = 'row';
      tr.appendChild(td);
    });
    table.lastChild.appendChild(tr);
  }
  function wrapIn(id, node) { var w = $(id); w.textContent = ''; w.appendChild(node); }

  function renderSummary(ev, inp) {
    var items = [];
    if (inp.mode === 'laps') {
      var km = sel ? ' (distance : ' + L.formatDec(inp.laps * sel.lengthKm, 1) + ' km)' : '';
      items.push('Course de ' + nLaps(inp.laps) + km + '.');
      items.push('Temps total estimé : ' + L.formatStint(ev.timeSec) + '.');
    } else {
      items.push('Course de ' + L.formatDuration(race.durationMin) + ' : ' + nLaps(ev.laps) + ' (la course se termine au premier passage de ligne après la durée).');
      items.push('Fin de course estimée à : ' + L.formatStint(ev.timeSec) + '.');
    }
    items.push(ev.stopsCount === 0 ? 'Aucun arrêt au stand.' : 'Arrêts au stand : ' + ev.stopsCount + ' (dont ' + ev.tireChanges + ' avec changement de pneus).');
    if (inp.required.length) items.push('Gommes obligatoires : ' + inp.required.map(function (k) { return S.LABEL[k]; }).join(', ') + '.');
    items.push(ev.litres > 0.0001 ? 'Essence ajoutée au total : ' + L.formatDec(ev.litres, 1) + ' litres (réservoir de 100 litres).' : 'Aucun ravitaillement.');
    fillList('strat-summary', 'strat-summary', items);
    $('strat-summary').hidden = false;
  }

  function renderCompare(ev, res) {
    var t;
    if (!ev.valid) t = 'Cette stratégie n’est pas valide : corrigez les points signalés ci-dessous pour la comparer.';
    else if (res.ev.valid) {
      if (ev.laps !== res.ev.laps) t = signed(ev.laps - res.ev.laps, 0) + (Math.abs(ev.laps - res.ev.laps) === 1 ? ' tour' : ' tours') + ' par rapport à la stratégie proposée.';
      else {
        var d = ev.timeSec - res.ev.timeSec;
        t = Math.abs(d) < 0.05 ? 'Aussi rapide que la stratégie proposée.' : signed(d, 1) + ' s par rapport à la stratégie proposée.';
      }
    } else t = 'Stratégie valide.';
    $('strat-compare').textContent = t;
  }

  function renderStintTable(ev, inp) {
    var allowed = S.allowedOf(inp), table = makeTable('Relais de la stratégie',
      ['Relais', 'Nombre de tours', 'Tours roulés', 'Pneus', 'Usure des pneus', 'Durée', 'Arrêt']);
    ev.rows.forEach(function (r, i) {
      var cur = strategy.plan.stints[i];
      var tdLaps = el('td'), box = el('input', 'cell-input');
      box.type = 'text'; box.setAttribute('inputmode', 'numeric'); box.autocomplete = 'off';
      box.id = 'stint-laps-' + i; box.value = String(cur.laps);
      box.setAttribute('aria-label', 'Nombre de tours du relais ' + (i + 1));
      box.addEventListener('input', function () {
        var p = L.parseLaps(box.value);
        if (!p.ok) { $('stint-msg').textContent = 'Relais ' + (i + 1) + ' : ' + p.error; return; }
        $('stint-msg').textContent = '';
        strategy.plan = S.setStintLaps(strategy.plan, i, p.laps);
        persistStrategy(); renderStrategy();
      });
      box.addEventListener('blur', function () {
        box.value = String(strategy.plan.stints[i] ? strategy.plan.stints[i].laps : '');
        $('stint-msg').textContent = '';
      });
      tdLaps.appendChild(box);

      var tdTires = el('td'), pick = el('select', 'cell-input');
      pick.id = 'stint-tires-' + i;
      pick.setAttribute('aria-label', i === 0 ? 'Gomme de départ' : 'Pneus au relais ' + (i + 1));
      if (i > 0) {
        var keep = el('option', null, 'Garder les pneus (' + S.LABEL[ev.rows[i - 1].compound] + ')');
        keep.value = 'keep'; pick.appendChild(keep);
      }
      var opts = allowed.slice();
      if (opts.indexOf(r.compound) === -1) opts.push(r.compound);
      opts.forEach(function (k) {
        var o = el('option', null, (i === 0 ? '' : 'Neufs : ') + S.LABEL[k] + (allowed.indexOf(k) === -1 ? ' (sans données)' : ''));
        o.value = k; pick.appendChild(o);
      });
      pick.value = i > 0 && !r.newTires ? 'keep' : r.compound;
      pick.addEventListener('change', function () {
        var v = pick.value;
        strategy.plan = i === 0 ? S.setTires(strategy.plan, 0, true, v) : (v === 'keep' ? S.setTires(strategy.plan, i, false) : S.setTires(strategy.plan, i, true, v));
        persistStrategy(); renderStrategy();
      });
      tdTires.appendChild(pick);

      var tdDel = el('td');
      if (i > 0) {
        var del = el('button', null, 'Supprimer l’arrêt');
        del.type = 'button'; del.id = 'stint-del-' + i;
        del.setAttribute('aria-label', 'Supprimer l’arrêt avant le relais ' + (i + 1));
        del.addEventListener('click', function () {
          strategy.plan = S.removeStop(strategy.plan, i);
          $('stint-msg').textContent = '';
          persistStrategy(); renderStrategy();
        });
        tdDel.appendChild(del);
      }
      var played = r.unused ? 'Inutile (course terminée)' : r.laps > 0 ? 'du tour ' + r.startLap + ' au tour ' + r.endLap + (r.laps < r.plannedLaps ? ' (fin de course)' : '') : '—';
      var wear = el('td', r.overTires ? 'bad' : '', r.laps > 0 ? r.age + ' / ' + r.maxAge + ' tours' : '—');
      addRow(table, [String(r.index), tdLaps, played, tdTires, wear, r.laps > 0 ? L.formatStint(r.durationSec) : '—', tdDel], r.unused ? 'unused' : '');
    });
    wrapIn('stint-wrap', table);
  }

  function renderStopTable(ev) {
    if (!ev.stops.length) { var p = el('p', 'muted', 'Aucun arrêt au stand.'); wrapIn('stop-wrap', p); return; }
    var table = makeTable('Arrêts au stand', ['Arrêt', 'Après le tour', 'Pneus', 'Carburant ajouté', 'Durée de l’arrêt']);
    ev.stops.forEach(function (s) {
      addRow(table, ['Arrêt ' + s.index, String(s.afterLap),
        s.newTires ? 'Changement : ' + S.LABEL[s.from] + ' → ' + S.LABEL[s.to] : 'Pneus conservés (' + S.LABEL[s.to] + ')',
        s.addPct > 0.0001 ? L.formatDec(s.addPct, 1) + ' % du réservoir (' + L.formatDec(s.refuelSec, 1) + ' s)' : 'Aucun',
        L.formatDec(s.timeSec, 1) + ' s']);
    });
    wrapIn('stop-wrap', table);
  }

  function renderAltTable(res) {
    if (!res.alternatives.length) { wrapIn('alt-wrap', el('p', 'muted', 'Une seule gomme est renseignée : aucune comparaison possible.')); return; }
    var table = makeTable('Comparaison des stratégies', ['Stratégie', 'Arrêts', 'Tours', 'Temps', 'Écart']);
    addRow(table, ['Proposée (meilleur mélange)', String(res.ev.stopsCount), String(res.ev.laps), L.formatStint(res.ev.timeSec), '—'], 'best');
    res.alternatives.forEach(function (a) {
      var gap = a.deltaLaps !== 0 ? signed(a.deltaLaps, 0) + (Math.abs(a.deltaLaps) === 1 ? ' tour' : ' tours') : Math.abs(a.deltaSec) > 0.05 ? signed(a.deltaSec, 1) + ' s' : '—';
      addRow(table, [a.label, String(a.stops), String(a.laps), L.formatStint(a.timeSec), gap]);
    });
    wrapIn('alt-wrap', table);
  }

  function renderStrategy() {
    if (!strategy) return;
    var built = S.buildInputs(race, pit, tires, strategy.margin, !!sel);
    $('strat-locked').hidden = built.ok;
    $('strat-body').hidden = !built.ok;
    if (!built.ok) {
      memo.renderKey = null;
      $('strat-locked').textContent = 'Pour calculer la stratégie, complétez : ' + built.missing.join(' ; ') + '.';
      return;
    }
    var inp = built.inputs, sig = JSON.stringify(inp);
    if (memo.sig !== sig) { memo.sig = sig; memo.res = S.optimize(inp); }
    var res = memo.res;
    $('strat-msg').textContent = res.ok ? '' : res.message;
    $('strat-propose').disabled = !res.ok;
    $('strat-propose').textContent = strategy.plan ? 'Rétablir la stratégie proposée' : 'Proposer une stratégie';
    var show = res.ok && !!strategy.plan;
    $('strat-result').hidden = !show;
    if (!show) { memo.renderKey = null; return; }
    /* Ne reconstruit les tableaux que si quelque chose a changé : un simple passage de focus (blur) ne doit pas
       remplacer les boutons juste avant le clic. */
    var key = [sig, JSON.stringify(strategy.plan), strategy.sig, sel ? sel.lengthKm : null].join('|');
    if (key === memo.renderKey && $('stint-wrap').firstChild) return;
    memo.renderKey = key;
    var ae = document.activeElement, fid = ae && /^(stint-|add-stop)/.test(ae.id || '') ? ae.id : null;
    var ev = S.evaluate(strategy.plan, inp);
    $('strat-stale').hidden = strategy.sig === sig;
    renderSummary(ev, inp);
    renderCompare(ev, res);
    renderStintTable(ev, inp);
    var issues = ev.issues.map(function (x) { return (x.level === 'error' ? 'À corriger : ' : 'Info : ') + x.text; });
    fillList('strat-issues', 'strat-issues-box', issues);
    renderStopTable(ev);
    renderAltTable(res);
    if (fid && $(fid)) {
      $(fid).focus();
      if ($(fid).type === 'text') { var n = $(fid).value.length; $(fid).setSelectionRange(n, n); }
    }
  }

  $('strat-propose').addEventListener('click', function () {
    if (!memo.res || !memo.res.ok) return;
    strategy.plan = S.clonePlan(memo.res.plan);
    strategy.sig = memo.sig;
    $('stint-msg').textContent = '';
    persistStrategy(); renderStrategy();
  });
  $('add-stop').addEventListener('click', function () {
    var p = S.addStop(strategy.plan);
    if (p === strategy.plan) { $('stint-msg').textContent = 'Aucun relais ne peut être divisé : chaque relais n’a qu’un tour.'; return; }
    $('stint-msg').textContent = '';
    strategy.plan = p;
    persistStrategy(); renderStrategy();
  });
  $('margin').addEventListener('input', function () {
    var p = L.parseMargin($('margin').value);
    if (!p.ok) { setError('margin', p.error); return; }
    setError('margin', '');
    strategy.margin = p.value;
    persistStrategy(); renderStrategy();
  });
  $('margin').addEventListener('blur', function () {
    $('margin').value = L.formatDec(strategy.margin, 2);
    setError('margin', '');
  });

  strategy = L.loadStrategy(store());
  $('margin').value = L.formatDec(strategy.margin, 2);
  L.COMPOUNDS.forEach(function (c) {
    $(c.key + '-req').addEventListener('change', function () {
      tires = L.setTireField(tires, c.key, 'required', $(c.key + '-req').checked);
      persistTires(); renderTires(true);
    });
  });

  tires = L.loadTires(store());
  pit = L.loadPit(store());
  race = L.loadRace(store());
  sel = L.load(store(), catalog);
  renderList(); renderDetail(false); renderPit(false); renderTires(false);
})();
