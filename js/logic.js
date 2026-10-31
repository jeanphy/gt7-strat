/* Logique pure de l'étape 1 (testable sous Node, utilisable dans le navigateur). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GT7Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MIN_KM = 0.5, MAX_KM = 50, KEY = 'gt7strat.step1';

  function norm(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function buildCatalog(rows) {
    return rows.map(function (r) {
      return { id: slug(r[0] + ' ' + r[1]), circuit: r[0], layout: r[1], country: r[2], km: r[3], verified: !!r[4] };
    });
  }
  function filterCatalog(catalog, query) {
    var q = norm(query || '');
    if (!q) return catalog.slice();
    return catalog.filter(function (t) { return norm(t.circuit + ' ' + t.layout + ' ' + t.country).indexOf(q) !== -1; });
  }
  function groupByCircuit(tracks) {
    var map = {}, out = [];
    tracks.forEach(function (t) {
      if (!map[t.circuit]) { map[t.circuit] = { circuit: t.circuit, country: t.country, layouts: [] }; out.push(map[t.circuit]); }
      map[t.circuit].layouts.push(t);
    });
    return out;
  }
  function findTrack(catalog, id) {
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }

  /* Accepte "5,8", "5.8", " 5.8 km ". Retourne {ok, km} ou {ok:false, error}. */
  function parseLength(input) {
    var s = String(input == null ? '' : input).trim().toLowerCase().replace(/\s*km$/, '').replace(',', '.');
    if (s === '') return { ok: false, error: 'Entrez une longueur en kilomètres.' };
    if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'Utilisez uniquement des chiffres, par exemple 5,8.' };
    var km = Math.round(parseFloat(s) * 1000) / 1000;
    if (km < MIN_KM || km > MAX_KM) return { ok: false, error: 'La longueur doit être entre ' + MIN_KM + ' et ' + MAX_KM + ' km.' };
    return { ok: true, km: km };
  }

  function createSelection(track) {
    return { trackId: track.id, officialKm: track.km, lengthKm: track.km, modified: false };
  }
  function withLength(sel, km) {
    return { trackId: sel.trackId, officialKm: sel.officialKm, lengthKm: km, modified: km !== sel.officialKm };
  }
  function resetLength(sel) { return withLength(sel, sel.officialKm); }
  function deltaKm(sel) { return Math.round((sel.lengthKm - sel.officialKm) * 1000) / 1000; }

  function formatKm(km) { return km.toFixed(3).replace('.', ',').replace(/0+$/, '').replace(/,$/, ''); }
  function kmToMiles(km) { return Math.round(km * 0.621371 * 100) / 100; }

  function save(storage, sel) {
    try { storage.setItem(KEY, JSON.stringify(sel)); return true; } catch (e) { return false; }
  }
  /* Retourne une sélection valide ou null (données absentes, corrompues ou circuit disparu). */
  function load(storage, catalog) {
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw), t = findTrack(catalog, s && s.trackId);
      if (!t) return null;
      var p = parseLength(String(s.lengthKm));
      if (!p.ok) return createSelection(t);
      return withLength(createSelection(t), p.km);
    } catch (e) { return null; }
  }

  /* ---------- Étape 2 : durée ou nombre de tours ---------- */
  var MIN_DURATION = 1, MAX_DURATION = 2880, MIN_LAPS = 1, MAX_LAPS = 5000, KEY2 = 'gt7strat.step2';
  var PRESETS = [30, 60, 90, 120, 360, 720, 1440];

  function fail(msg) { return { ok: false, error: msg }; }
  function checkDuration(min) {
    if (min < MIN_DURATION || min > MAX_DURATION) return fail('La durée doit être entre ' + MIN_DURATION + ' et ' + MAX_DURATION + ' minutes (48 h).');
    return { ok: true, minutes: min };
  }
  /* Accepte "90", "90 min", "1h30", "1 h 30 min", "24h", "1:30". */
  function parseDuration(input) {
    var s = String(input == null ? '' : input).trim().toLowerCase().replace(/\s+/g, ''), m;
    if (s === '') return fail('Entrez une durée en minutes, par exemple 90 (ou 1h30).');
    if (/^\d+$/.test(s) || (m = s.match(/^(\d+)min$/))) return checkDuration(parseInt(m ? m[1] : s, 10));
    if ((m = s.match(/^(\d+)h(\d{1,2})?(?:min)?$/)) || (m = s.match(/^(\d+):(\d{2})$/))) {
      var mins = m[2] === undefined ? 0 : parseInt(m[2], 10);
      if (mins > 59) return fail('Les minutes doivent être entre 0 et 59 (ex. 1h30).');
      return checkDuration(parseInt(m[1], 10) * 60 + mins);
    }
    return fail('Format non reconnu. Exemples : 90, 1h30, 24h.');
  }
  function parseLaps(input) {
    var s = String(input == null ? '' : input).replace(/\s+/g, '');
    if (s === '') return fail('Entrez un nombre de tours, par exemple 20.');
    if (!/^\d+$/.test(s)) return fail('Entrez un nombre entier de tours, sans virgule.');
    var n = parseInt(s, 10);
    if (n < MIN_LAPS || n > MAX_LAPS) return fail('Le nombre de tours doit être entre ' + MIN_LAPS + ' et ' + MAX_LAPS + '.');
    return { ok: true, laps: n };
  }
  function formatDuration(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + ' min';
    return m === 0 ? h + ' h' : h + ' h ' + m + ' min';
  }
  function createRace() { return { mode: 'duration', durationMin: 60, laps: 20 }; }
  function setMode(r, mode) { return { mode: mode === 'laps' ? 'laps' : 'duration', durationMin: r.durationMin, laps: r.laps }; }
  function setDuration(r, min) { return { mode: 'duration', durationMin: min, laps: r.laps }; }
  function setLaps(r, n) { return { mode: 'laps', durationMin: r.durationMin, laps: n }; }
  function totalDistanceKm(r, lengthKm) {
    return r.mode === 'laps' ? Math.round(r.laps * lengthKm * 1000) / 1000 : null;
  }
  function describeRace(r) {
    if (r.mode === 'duration') return 'Course de ' + formatDuration(r.durationMin) + '.';
    return 'Course de ' + r.laps + (r.laps > 1 ? ' tours' : ' tour') + '.';
  }
  function formatMiles(km) { return String(kmToMiles(km)).replace('.', ','); }
  /* Distance totale à parcourir (mode tours seulement, sinon null). */
  function distanceInfo(r, lengthKm) {
    var km = totalDistanceKm(r, lengthKm);
    if (km === null) return null;
    return { km: km, kmText: formatKm(km) + ' km', milesText: formatMiles(km) + ' mi',
      formula: r.laps + (r.laps > 1 ? ' tours' : ' tour') + ' × ' + formatKm(lengthKm) + ' km' };
  }
  function saveRace(storage, r) {
    try { storage.setItem(KEY2, JSON.stringify(r)); return true; } catch (e) { return false; }
  }
  /* Retourne toujours une course valide (valeurs par défaut si absent ou corrompu). */
  function loadRace(storage) {
    var r = createRace();
    try {
      var raw = storage.getItem(KEY2);
      if (!raw) return r;
      var s = JSON.parse(raw), d = parseDuration(String(s.durationMin)), l = parseLaps(String(s.laps));
      if (d.ok) r.durationMin = d.minutes;
      if (l.ok) r.laps = l.laps;
      return setMode(r, s.mode);
    } catch (e) { return createRace(); }
  }

  /* ---------- Étape 3 : passage au stand, ravitaillement, consommation ---------- */
  var KEY3 = 'gt7strat.step3';
  var PIT_KEYS = ['pitSec', 'tireSec', 'fillRate', 'consumption'];
  var PIT_LABELS = { pitSec: 'temps de passage au stand', tireSec: 'temps additionnel pour les pneus',
    fillRate: 'vitesse de remplissage', consumption: 'consommation par tour' };

  /* Nombre décimal avec virgule ou point, suffixe d'unité facultatif. */
  function parseNumber(input, o) {
    var s = String(input == null ? '' : input).trim().toLowerCase().replace(/\s+/g, '');
    if (o.suffix) s = s.replace(o.suffix, '');
    s = s.replace(',', '.');
    if (s === '') return fail(o.empty);
    if (!new RegExp('^\\d+(\\.\\d{1,' + (o.decimals || 2) + '})?$').test(s)) return fail(o.format);
    var v = parseFloat(s);
    if (v < o.min || v > o.max) return fail(o.range);
    return { ok: true, value: v };
  }
  function secondsParser(o) {
    return function (input) {
      var s = String(input == null ? '' : input).trim().replace(/\s+/g, ''), m = s.match(/^(\d+):(\d{2})$/);
      if (m) {
        if (parseInt(m[2], 10) > 59) return fail('Les secondes doivent être entre 00 et 59 (ex. 0:25).');
        var v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        return v < o.min || v > o.max ? fail(o.range) : { ok: true, value: v };
      }
      return parseNumber(input, { suffix: /(sec|s)$/, decimals: 2, min: o.min, max: o.max, empty: o.empty, format: o.format, range: o.range });
    };
  }
  var parsePitTime = secondsParser({ min: 1, max: 600,
    empty: 'Entrez le temps en secondes, par exemple 25 (ou 0:25).',
    format: 'Utilisez des chiffres, par exemple 25 ou 25,5 (ou 0:25).',
    range: 'Le temps doit être entre 1 et 600 secondes.' });
  var parseTireTime = secondsParser({ min: 0, max: 300,
    empty: 'Entrez le temps en secondes, par exemple 8 (0 s’il n’y a aucun temps additionnel).',
    format: 'Utilisez des chiffres, par exemple 8 ou 8,5.',
    range: 'Le temps doit être entre 0 et 300 secondes.' });
  function parseFillRate(input) {
    return parseNumber(input, { suffix: /(l\/s|%\/s)$/, decimals: 2, min: 0.1, max: 100,
      empty: 'Entrez une vitesse en litres par seconde, par exemple 2,5.',
      format: 'Utilisez des chiffres, par exemple 2,5.',
      range: 'La vitesse doit être entre 0,1 et 100 litres par seconde.' });
  }
  function parseConsumption(input) {
    return parseNumber(input, { suffix: /(%|l)$/, decimals: 2, min: 0.1, max: 100,
      empty: 'Entrez la consommation par tour, par exemple 2,5.',
      format: 'Utilisez des chiffres, par exemple 2,5.',
      range: 'La consommation doit être entre 0,1 et 100 litres (pour un réservoir de 100 litres).' });
  }
  var PIT_PARSERS = { pitSec: parsePitTime, tireSec: parseTireTime, fillRate: parseFillRate, consumption: parseConsumption };

  function formatDec(n, d) { var k = Math.pow(10, d); return String(Math.round(n * k) / k).replace('.', ','); }
  function createPit() { return { pitSec: null, tireSec: null, fillRate: null, consumption: null }; }
  function setPitField(pit, key, value) {
    var out = {};
    PIT_KEYS.forEach(function (k) { out[k] = pit[k]; });
    if (PIT_KEYS.indexOf(key) !== -1) out[key] = value;
    return out;
  }
  function pitStatus(pit) {
    var missing = PIT_KEYS.filter(function (k) { return pit[k] === null; }).map(function (k) { return PIT_LABELS[k]; });
    return { complete: missing.length === 0, missing: missing };
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  /* Lignes de contrôle calculées à partir des valeurs saisies (seulement celles disponibles). */
  function pitSummary(pit, lengthKm) {
    var out = [];
    if (pit.pitSec !== null) {
      out.push('Passage au stand sans pneus : ' + formatDec(pit.pitSec, 2) + ' s (hors ravitaillement).');
      if (pit.tireSec !== null) out.push('Passage au stand avec changement de pneus : ' + formatDec(pit.pitSec + pit.tireSec, 2) +
        ' s (' + formatDec(pit.pitSec, 2) + ' + ' + formatDec(pit.tireSec, 2) + '), hors ravitaillement.');
    }
    if (pit.fillRate !== null) out.push('Ravitaillement d’un réservoir complet (0 à 100 %) : ' + formatDec(100 / pit.fillRate, 1) + ' s.');
    if (pit.consumption !== null) {
      var exact = 100 / pit.consumption, full = Math.floor(exact + 1e-9), rounded = Math.round(exact * 10) / 10;
      var t = 'Autonomie avec un réservoir plein : ' + plural(rounded === 1 ? 1 : formatDec(rounded, 1), 'tour', 'tours');
      if (rounded === 1) t = 'Autonomie avec un réservoir plein : 1 tour';
      if (full !== rounded) t += ', soit ' + plural(full, 'tour complet', 'tours complets');
      if (lengthKm != null) t += ' (environ ' + formatDec(exact * lengthKm, 1) + ' km)';
      out.push(t + '.');
    }
    return out;
  }
  function savePit(storage, pit) {
    try { storage.setItem(KEY3, JSON.stringify(pit)); return true; } catch (e) { return false; }
  }
  /* Toujours un objet valide : chaque valeur est revalidée, sinon elle redevient vide. */
  function loadPit(storage) {
    var pit = createPit();
    try {
      var raw = storage.getItem(KEY3);
      if (!raw) return pit;
      var s = JSON.parse(raw);
      PIT_KEYS.forEach(function (k) {
        if (s && s[k] !== null && s[k] !== undefined) {
          var p = PIT_PARSERS[k](String(s[k]));
          if (p.ok) pit[k] = p.value;
        }
      });
      return pit;
    } catch (e) { return createPit(); }
  }

  /* ---------- Étape 4 : performances observées par gomme ---------- */
  var KEY4 = 'gt7strat.step4';
  var COMPOUNDS = [{ key: 'soft', label: 'Soft', dry: true }, { key: 'medium', label: 'Medium', dry: true }, { key: 'hard', label: 'Hard', dry: true },
    { key: 'inter', label: 'Intermédiaire', dry: false }, { key: 'wet', label: 'Pluie', dry: false }];
  var MIN_LAP_SEC = 10, MAX_LAP_SEC = 1800, MAX_STINT_LAPS = 5000;

  /* Accepte "1:45.230", "1:45,23", "1:45", "105.23", "105,2 s". Retourne des secondes. */
  function parseLapTime(input) {
    var s = String(input == null ? '' : input).trim().toLowerCase().replace(/\s+/g, '').replace(',', '.').replace(/s$/, '');
    if (s === '') return fail('Entrez le temps moyen au tour, par exemple 1:45.230.');
    var m = s.match(/^(\d+):(\d{2})(?:\.(\d{1,3}))?$/), v;
    if (m) {
      if (parseInt(m[2], 10) > 59) return fail('Les secondes doivent être entre 00 et 59 (ex. 1:45.230).');
      v = parseInt(m[1], 10) * 60 + parseFloat(m[2] + (m[3] ? '.' + m[3] : ''));
    } else if ((m = s.match(/^\d+(?:\.\d{1,3})?$/))) {
      v = parseFloat(s);
    } else {
      return fail('Format non reconnu. Exemples : 1:45.230, 1:45,23 ou 105.23.');
    }
    v = Math.round(v * 1000) / 1000;
    if (v < MIN_LAP_SEC || v > MAX_LAP_SEC) return fail('Le temps au tour doit être entre 10 secondes et 30 minutes.');
    return { ok: true, value: v };
  }
  function parseMaxLaps(input) {
    var s = String(input == null ? '' : input).replace(/\s+/g, '');
    if (s === '') return fail('Entrez le nombre maximal de tours, par exemple 25.');
    if (!/^\d+$/.test(s)) return fail('Entrez un nombre entier de tours, sans virgule.');
    var n = parseInt(s, 10);
    if (n < 1 || n > MAX_STINT_LAPS) return fail('Le nombre de tours doit être entre 1 et ' + MAX_STINT_LAPS + '.');
    return { ok: true, value: n };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function formatLapTime(sec) {
    var ms = Math.round(sec * 1000), m = Math.floor(ms / 60000), r = ms % 60000;
    return m + ':' + pad2(Math.floor(r / 1000)) + ',' + ('00' + (r % 1000)).slice(-3);
  }
  function formatStint(sec) {
    var t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h > 0 ? h + ' h ' + pad2(m) + ' min ' + pad2(s) + ' s' : m + ' min ' + pad2(s) + ' s';
  }
  function createTires() {
    var t = {};
    COMPOUNDS.forEach(function (c) { t[c.key] = { lapSec: null, maxLaps: null, required: false }; });
    return t;
  }
  function setTireField(tires, comp, field, value) {
    var out = {};
    COMPOUNDS.forEach(function (c) { out[c.key] = { lapSec: tires[c.key].lapSec, maxLaps: tires[c.key].maxLaps, required: !!tires[c.key].required }; });
    if (out[comp] && (field === 'lapSec' || field === 'maxLaps')) out[comp][field] = value;
    if (out[comp] && field === 'required') out[comp].required = !!value;
    return out;
  }
  function compoundState(c) {
    if (c.lapSec === null && c.maxLaps === null) return 'empty';
    return c.lapSec !== null && c.maxLaps !== null ? 'complete' : 'partial';
  }
  /* complete = au moins une gomme complète, aucune gomme à moitié remplie et aucune gomme obligatoire sans données. */
  function tiresStatus(tires) {
    var done = [], issues = [];
    COMPOUNDS.forEach(function (c) {
      var t = tires[c.key], st = compoundState(t);
      if (st === 'complete') done.push(c.label);
      if (st === 'partial') issues.push(c.label + ' : il manque ' + (t.lapSec === null ? 'le temps moyen au tour' : 'le nombre maximal de tours') + '.');
      if (st === 'empty' && t.required) issues.push(c.label + ' : obligatoire, renseignez le temps moyen au tour et le nombre maximal de tours.');
    });
    return { complete: done.length > 0 && issues.length === 0, done: done, issues: issues };
  }
  function fuelFullLaps(pit) { return pit && pit.consumption ? Math.floor(100 / pit.consumption + 1e-9) : null; }
  function tiresSummary(tires, lengthKm, fuelLaps) {
    var out = [];
    COMPOUNDS.forEach(function (c) {
      var t = tires[c.key];
      if (compoundState(t) !== 'complete') return;
      var line = c.label + (t.required ? ' (obligatoire)' : '') + ' : ' + plural(t.maxLaps, 'tour', 'tours') + ' à ' + formatLapTime(t.lapSec) + ' = ' + formatStint(t.maxLaps * t.lapSec);
      if (lengthKm != null) line += ', soit environ ' + formatDec(t.maxLaps * lengthKm, 1) + ' km';
      line += '.';
      if (fuelLaps != null) {
        if (t.maxLaps < fuelLaps) line += ' Les pneus limitent le relais (le carburant permet ' + plural(fuelLaps, 'tour', 'tours') + ').';
        else if (t.maxLaps > fuelLaps) line += ' Le carburant limite le relais (' + plural(fuelLaps, 'tour', 'tours') + ') avant les pneus.';
        else line += ' Pneus et carburant permettent le même nombre de tours.';
      }
      out.push(line);
    });
    return out;
  }
  /* Alertes de cohérence (non bloquantes), entre gommes complètes consécutives : de la plus tendre à la plus dure. */
  function tiresWarnings(tires) {
    var out = [], done = COMPOUNDS.filter(function (c) { return c.dry && compoundState(tires[c.key]) === 'complete'; });
    for (var i = 0; i + 1 < done.length; i++) {
      var a = done[i], b = done[i + 1], ta = tires[a.key], tb = tires[b.key];
      if (ta.lapSec >= tb.lapSec) out.push(a.label + ' n’est pas plus rapide que ' + b.label + ' (' + formatLapTime(ta.lapSec) + ' contre ' + formatLapTime(tb.lapSec) + ') : vérifiez vos temps.');
      if (ta.maxLaps > tb.maxLaps) out.push(a.label + ' tient plus de tours que ' + b.label + ' (' + ta.maxLaps + ' contre ' + tb.maxLaps + ') : vérifiez vos nombres de tours.');
    }
    return out;
  }
  function saveTires(storage, tires) {
    try { storage.setItem(KEY4, JSON.stringify(tires)); return true; } catch (e) { return false; }
  }
  function loadTires(storage) {
    var t = createTires();
    try {
      var raw = storage.getItem(KEY4);
      if (!raw) return t;
      var s = JSON.parse(raw);
      COMPOUNDS.forEach(function (c) {
        var o = s && s[c.key];
        if (!o) return;
        if (o.lapSec !== null && o.lapSec !== undefined) { var a = parseLapTime(String(o.lapSec)); if (a.ok) t[c.key].lapSec = a.value; }
        if (o.maxLaps !== null && o.maxLaps !== undefined) { var b = parseMaxLaps(String(o.maxLaps)); if (b.ok) t[c.key].maxLaps = b.value; }
        t[c.key].required = o.required === true;
      });
      return t;
    } catch (e) { return createTires(); }
  }

  /* ---------- Étape 5 : réglages et stratégie modifiée par l'utilisateur ---------- */
  var KEY5 = 'gt7strat.step5', DEFAULT_MARGIN = 0.5, MAX_STINTS = 500;
  function parseMargin(input) {
    return parseNumber(input, { suffix: /tours?$/, decimals: 2, min: 0, max: 20,
      empty: 'Entrez une marge en tours, par exemple 0,5 (0 pour aucune marge).',
      format: 'Utilisez des chiffres, par exemple 0,5.',
      range: 'La marge doit être entre 0 et 20 tours.' });
  }
  function createStrategy() { return { margin: DEFAULT_MARGIN, plan: null, sig: null }; }
  function saveStrategy(storage, st) {
    try { storage.setItem(KEY5, JSON.stringify(st)); return true; } catch (e) { return false; }
  }
  /* Toujours un objet valide : marge et plan sont revalidés, sinon valeurs par défaut. */
  function loadStrategy(storage) {
    var st = createStrategy();
    try {
      var raw = storage.getItem(KEY5);
      if (!raw) return st;
      var s = JSON.parse(raw), keys = COMPOUNDS.map(function (c) { return c.key; });
      var m = parseMargin(String(s && s.margin));
      if (m.ok) st.margin = m.value;
      var stints = s && s.plan && s.plan.stints;
      if (Array.isArray(stints) && stints.length >= 1 && stints.length <= MAX_STINTS && stints.every(function (x) {
        return x && Number.isInteger(x.laps) && x.laps >= 1 && x.laps <= MAX_LAPS && keys.indexOf(x.compound) !== -1 && typeof x.newTires === 'boolean';
      })) {
        st.plan = { stints: stints.map(function (x) { return { laps: x.laps, compound: x.compound, newTires: x.newTires }; }) };
        st.sig = typeof s.sig === 'string' ? s.sig : null;
      }
      return st;
    } catch (e) { return createStrategy(); }
  }

  return { MIN_KM: MIN_KM, MAX_KM: MAX_KM, KEY: KEY, norm: norm, slug: slug, buildCatalog: buildCatalog,
    filterCatalog: filterCatalog, groupByCircuit: groupByCircuit, findTrack: findTrack, parseLength: parseLength,
    createSelection: createSelection, withLength: withLength, resetLength: resetLength, deltaKm: deltaKm,
    formatKm: formatKm, kmToMiles: kmToMiles, save: save, load: load,
    MIN_DURATION: MIN_DURATION, MAX_DURATION: MAX_DURATION, MIN_LAPS: MIN_LAPS, MAX_LAPS: MAX_LAPS, KEY2: KEY2, PRESETS: PRESETS,
    parseDuration: parseDuration, parseLaps: parseLaps, formatDuration: formatDuration, createRace: createRace,
    setMode: setMode, setDuration: setDuration, setLaps: setLaps, totalDistanceKm: totalDistanceKm,
    parsePitTime: parsePitTime, parseTireTime: parseTireTime, parseFillRate: parseFillRate,
    parseConsumption: parseConsumption, formatDec: formatDec, createPit: createPit, setPitField: setPitField,
    pitStatus: pitStatus, pitSummary: pitSummary, savePit: savePit, loadPit: loadPit, KEY3: KEY3, PIT_KEYS: PIT_KEYS,
    parseLapTime: parseLapTime, parseMaxLaps: parseMaxLaps, formatLapTime: formatLapTime, formatStint: formatStint,
    createTires: createTires, setTireField: setTireField, tiresStatus: tiresStatus, fuelFullLaps: fuelFullLaps,
    tiresSummary: tiresSummary, tiresWarnings: tiresWarnings, saveTires: saveTires, loadTires: loadTires,
    COMPOUNDS: COMPOUNDS, KEY4: KEY4,
    parseMargin: parseMargin, createStrategy: createStrategy, saveStrategy: saveStrategy, loadStrategy: loadStrategy,
    KEY5: KEY5, DEFAULT_MARGIN: DEFAULT_MARGIN,
    describeRace: describeRace, distanceInfo: distanceInfo, formatMiles: formatMiles, saveRace: saveRace, loadRace: loadRace };
});
