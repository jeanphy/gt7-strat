/* Moteur de stratégie d'endurance (fonctions pures, testables sous Node).

   Modèle :
   - départ réservoir plein ; un relais = tours entre deux arrêts ; chaque relais est limité par le carburant :
     FL = floor(100 / consommation - marge) tours ;
   - un train de pneus (gomme) dure au plus maxLaps tours cumulés, éventuellement sur plusieurs relais ;
   - temps d'un arrêt = passage au stand + changement de pneus éventuel + ravitaillement (additionnés) ;
   - ravitaillement = le minimum nécessaire pour le relais suivant + la marge ; le total d'essence ajouté
     ne dépend donc que du nombre de tours : max(0, N*c + marge*c - 100) ;
   - optimisation : on découpe la course en trains de pneus (gomme, tours) ; un train de L tours
     demande ceil(L/FL) relais. Coût total = somme des trains - un passage au stand - un changement de pneus.
   Les temps au tour sont supposés constants pour chaque gomme. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GT7Strategy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var KEYS = ['soft', 'medium', 'hard', 'inter', 'wet'];
  var LABEL = { soft: 'Soft', medium: 'Medium', hard: 'Hard', inter: 'Intermédiaire', wet: 'Pluie' };
  var EPS = 1e-9, MAX_PLAN_LAPS = 5000, WORK_LIMIT = 3e8;

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function fuelLimitLaps(c, m) { return Math.floor(100 / c - m + 1e-9); }
  function fuelPct(n, c, m) { return Math.max(0, n * c + m * c - 100); }
  function allowedOf(inp) {
    return KEYS.filter(function (k) { return inp.lapTimes[k] != null && inp.maxLaps[k] != null; });
  }

  /* Assemble les entrées du calcul à partir des étapes 1 à 4, ou liste ce qui manque. */
  function buildInputs(race, pit, tires, margin, hasTrack) {
    var missing = [];
    if (!hasTrack) missing.push('étape 1 : choisir un circuit');
    var pitLabels = { pitSec: 'temps de passage au stand', tireSec: 'temps additionnel pour les pneus',
      fillRate: 'vitesse de remplissage', consumption: 'consommation par tour' };
    Object.keys(pitLabels).forEach(function (k) {
      if (pit[k] === null || pit[k] === undefined) missing.push('étape 3 : ' + pitLabels[k]);
    });
    var any = false;
    KEYS.forEach(function (k) {
      var t = tires[k], a = t.lapSec !== null, b = t.maxLaps !== null;
      if (a && b) any = true;
      else if (a || b) missing.push('étape 4 : terminer la gomme ' + LABEL[k]);
      else if (t.required) missing.push('étape 4 : renseigner la gomme ' + LABEL[k] + ' (obligatoire)');
    });
    if (!any) missing.push('étape 4 : au moins une gomme');
    if (missing.length) return { ok: false, missing: missing };
    var inp = { mode: race.mode, laps: race.laps, durationSec: race.durationMin * 60, lapTimes: {}, maxLaps: {},
      pitSec: pit.pitSec, tireSec: pit.tireSec, fillRate: pit.fillRate, consumption: pit.consumption, margin: margin, required: [] };
    KEYS.forEach(function (k) {
      var ok = tires[k].lapSec !== null && tires[k].maxLaps !== null;
      inp.lapTimes[k] = ok ? tires[k].lapSec : null;
      inp.maxLaps[k] = ok ? tires[k].maxLaps : null;
      if (ok && tires[k].required) inp.required.push(k);
    });
    return { ok: true, inputs: inp };
  }

  /* ---------- programmation dynamique sur les trains de pneus ----------
     État : (tours déjà couverts k, ensemble des gommes obligatoires déjà utilisées = masque). */
  function runDP(inp, allowed, required, nMax, FL) {
    var R = required.length, M = 1 << R, W = (nMax + 1) * M;
    var cost = new Float64Array(W).fill(Infinity), stops = new Int32Array(W);
    var cj = new Int8Array(W).fill(-1), cl = new Int32Array(W), pm = new Int8Array(W);
    cost[0] = 0;
    var bit = allowed.map(function (a) { var i = required.indexOf(a); return i === -1 ? 0 : 1 << i; });
    for (var k = 1; k <= nMax; k++) {
      for (var m = 0; m < M; m++) {
        var best = Infinity, bs = 0, bj = -1, bl = 0, bpm = 0;
        for (var a = 0; a < allowed.length; a++) {
          var b = bit[a];
          if (b && !(m & b)) continue;
          var lap = inp.lapTimes[allowed[a]], ml = Math.min(inp.maxLaps[allowed[a]], k);
          for (var pi = 0; pi < (b ? 2 : 1); pi++) {
            var pmk = b ? (pi === 0 ? m : m ^ b) : m;
            for (var L = 1; L <= ml; L++) {
              var prev = (k - L) * M + pmk, cp = cost[prev];
              if (cp === Infinity) continue;
              var seg = Math.ceil(L / FL);
              var c = cp + seg * inp.pitSec + L * lap + inp.tireSec, s = stops[prev] + seg;
              if (c < best - EPS || (Math.abs(c - best) <= EPS && s < bs)) { best = c; bs = s; bj = a; bl = L; bpm = pmk; }
            }
          }
        }
        var idx = k * M + m;
        cost[idx] = best; stops[idx] = bs; cj[idx] = bj; cl[idx] = bl; pm[idx] = bpm;
      }
    }
    return { cost: cost, cj: cj, cl: cl, pm: pm, allowed: allowed, required: required, M: M, full: M - 1 };
  }
  /* Meilleur temps total pour k tours avec exactement ce masque de gommes obligatoires utilisées (Infinity si impossible). */
  function tStar(dp, k, mask, inp) {
    if (k === 0) return mask === 0 ? 0 : Infinity;
    var c = dp.cost[k * dp.M + mask];
    return c === Infinity ? Infinity : c - inp.pitSec - inp.tireSec + fuelPct(k, inp.consumption, inp.margin) / inp.fillRate;
  }
  function reconstruct(dp, n, mask) {
    var sets = [], k = n, m = mask;
    while (k > 0) {
      var idx = k * dp.M + m;
      sets.unshift({ compound: dp.allowed[dp.cj[idx]], laps: dp.cl[idx] });
      m = dp.pm[idx]; k -= dp.cl[idx];
    }
    return sets;
  }

  /* Chaque train de L tours est découpé en ceil(L/FL) relais, aussi égaux que possible. */
  function buildPlan(sets, FL) {
    var stints = [];
    sets.forEach(function (set) {
      var k = Math.ceil(set.laps / FL), q = Math.floor(set.laps / k), r = set.laps % k;
      for (var s = 0; s < k; s++) stints.push({ laps: q + (s < r ? 1 : 0), compound: set.compound, newTires: s === 0 });
    });
    return { stints: stints };
  }

  /* ---------- évaluation d'une stratégie (proposée ou modifiée) ---------- */
  function normalize(plan) {
    var out = [];
    plan.stints.forEach(function (s, i) {
      var n = { laps: s.laps, compound: s.compound, newTires: i === 0 ? true : !!s.newTires };
      if (i > 0 && !n.newTires) n.compound = out[i - 1].compound;
      out.push(n);
    });
    return { stints: out };
  }

  function evaluate(plan, inp) {
    var c = inp.consumption, m = inp.margin, FL = fuelLimitLaps(c, m);
    var stints = normalize(plan).stints, issues = [], rows = [], stops = [];
    var tank = 100, t = 0, lapNo = 0, age = 0, done = false, planned = 0, tireFlag = false, litres = 0;
    var dur = inp.mode === 'duration', T = inp.durationSec;
    function err(x) { issues.push({ level: 'error', text: x }); }
    if (!stints.length) err('La stratégie ne contient aucun relais.');

    stints.forEach(function (s, i) {
      var valid = s.laps >= 1 && s.laps % 1 === 0;
      if (valid) planned += s.laps;
      var row = { index: i + 1, plannedLaps: s.laps, compound: s.compound, newTires: s.newTires, unused: false, laps: 0,
        startLap: null, endLap: null, age: 0, maxAge: inp.maxLaps[s.compound], overTires: false, durationSec: 0 };
      rows.push(row);
      if (done) { row.unused = true; return; }
      if (!valid) { err('Relais ' + (i + 1) + ' : le nombre de tours doit être un entier d’au moins 1.'); return; }
      var lap = inp.lapTimes[s.compound];
      if (lap == null) { err('Relais ' + (i + 1) + ' : aucune donnée pour la gomme ' + LABEL[s.compound] + ' (étape 4).'); return; }
      function stopFor(eff) {
        if (i === 0) return { add: 0, stopT: 0 };
        var add = Math.max(0, (eff + m) * c - tank);
        if (tank + add > 100) add = 100 - tank;
        return { add: add, stopT: inp.pitSec + (s.newTires ? inp.tireSec : 0) + add / inp.fillRate };
      }
      var eff = s.laps, st = stopFor(eff), S = t + st.stopT;
      if (dur && S + s.laps * lap >= T - EPS) {
        done = true;
        for (var it = 0; it < 5; it++) {
          var q = Math.min(s.laps, Math.max(1, Math.ceil((T - S) / lap - 1e-9)));
          if (q === eff) break;
          eff = q; st = stopFor(eff); S = t + st.stopT;
        }
      }
      if (eff > FL) err('Relais ' + (i + 1) + ' : le carburant ne permet que ' + plural(Math.max(FL, 0), 'tour', 'tours') +
        ' par relais (' + eff + ' prévus).');
      if (i === 0) tank = 100; else { tank = Math.min(100, tank + st.add); litres += st.add; }
      tank -= eff * c;
      if (i === 0 || s.newTires) { age = 0; tireFlag = false; }
      age += eff;
      var ml = inp.maxLaps[s.compound];
      row.age = age;
      if (age > ml) {
        row.overTires = true;
        if (!tireFlag) {
          tireFlag = true;
          err('Les pneus ' + LABEL[s.compound] + ' ne tiennent que ' + plural(ml, 'tour', 'tours') + ' à ce rythme : ' + age + ' tours prévus au relais ' + (i + 1) + '.');
        }
      }
      if (i > 0) stops.push({ index: stops.length + 1, afterLap: lapNo, newTires: s.newTires, from: stints[i - 1].compound,
        to: s.compound, addPct: st.add, refuelSec: st.add / inp.fillRate, timeSec: st.stopT });
      row.startLap = lapNo + 1; lapNo += eff; row.endLap = lapNo; row.laps = eff; row.durationSec = eff * lap;
      t = S + eff * lap;
    });

    if (inp.mode === 'laps') {
      if (planned !== inp.laps) err(planned < inp.laps
        ? 'Il manque ' + plural(inp.laps - planned, 'tour', 'tours') + ' : la stratégie en prévoit ' + planned + ' pour ' + inp.laps + '.'
        : 'Il y a ' + plural(planned - inp.laps, 'tour', 'tours') + ' de trop : la stratégie en prévoit ' + planned + ' pour ' + inp.laps + '.');
    } else if (!done) {
      err('La stratégie se termine avant la fin de la course : il manque au moins un tour.');
    } else if (planned - lapNo > 0) {
      issues.push({ level: 'warn', text: plural(planned - lapNo, 'tour prévu', 'tours prévus') + ' après la fin de la course : ' + (planned - lapNo === 1 ? 'il sera inutile.' : 'ils seront inutiles.') });
    }
    (inp.required || []).forEach(function (k) {
      var used = rows.some(function (r) { return !r.unused && r.laps > 0 && r.compound === k; });
      if (!used) err('La gomme ' + LABEL[k] + ' est obligatoire mais n’est pas utilisée.');
    });
    var valid2 = !issues.some(function (x) { return x.level === 'error'; });
    return { rows: rows, stops: stops, timeSec: t, laps: lapNo, plannedLaps: planned, stopsCount: stops.length,
      tireChanges: stops.filter(function (x) { return x.newTires; }).length, litres: litres, issues: issues, valid: valid2, done: done };
  }

  /* ---------- optimisation ---------- */
  /* Plan prévu pour n-1 tours, prolongé d'un tour : soit en allongeant le dernier relais, soit (si cela avance trop
     le ravitaillement) en ajoutant un dernier relais d'un tour. */
  function extendPlans(plan, inp, FL) {
    var base = plan.stints.map(function (s) { return { laps: s.laps, compound: s.compound, newTires: s.newTires }; });
    var last = base[base.length - 1], age = 0;
    base.forEach(function (s, i) { if (i === 0 || s.newTires) age = 0; age += s.laps; });
    var out = [];
    if (last.laps + 1 <= FL && age + 1 <= inp.maxLaps[last.compound]) {
      var a = clonePlan(plan);
      a.stints[a.stints.length - 1].laps += 1;
      out.push(a);
    }
    var b = clonePlan(plan);
    b.stints.push({ laps: 1, compound: last.compound, newTires: age + 1 > inp.maxLaps[last.compound] });
    out.push(b);
    return out;
  }

  function solve(inp, allowed) {
    var FL = fuelLimitLaps(inp.consumption, inp.margin);
    if (FL < 1) return { ok: false, error: 'margin', message: 'La marge de carburant est trop grande : le réservoir ne permet même pas un tour. Réduisez la marge.' };
    var required = (inp.required || []).filter(function (k) { return allowed.indexOf(k) !== -1; });
    var nMax;
    if (inp.mode === 'laps') nMax = inp.laps;
    else {
      var fastest = Math.min.apply(null, allowed.map(function (k) { return inp.lapTimes[k]; }));
      nMax = Math.ceil(inp.durationSec / fastest) + 2;
    }
    if (nMax > MAX_PLAN_LAPS) return { ok: false, error: 'tooLong', message: 'La course est trop longue pour le calcul (plus de ' + MAX_PLAN_LAPS + ' tours).' };
    var work = 0;
    allowed.forEach(function (k) { work += Math.min(inp.maxLaps[k], nMax); });
    if (work * nMax * (1 << required.length) * 2 > WORK_LIMIT) return { ok: false, error: 'tooHeavy',
      message: 'Le calcul est trop lourd avec ces valeurs. Réduisez le nombre de tours, le nombre maximal de tours des gommes ou le nombre de gommes obligatoires.' };
    var dp = runDP(inp, allowed, required, nMax, FL), full = dp.full, n, plan, ev;
    var tooShort = { ok: false, error: 'constraint', message: 'La course est trop courte pour utiliser toutes les gommes obligatoires (il faut au moins ' + required.length + (required.length > 1 ? ' tours).' : ' tour).') };
    var finite = function (x) { return x !== Infinity; };
    if (inp.mode === 'laps') {
      n = inp.laps;
      if (!finite(tStar(dp, n, full, inp))) return tooShort;
      plan = buildPlan(reconstruct(dp, n, full), FL);
      return { ok: true, plan: plan, ev: evaluate(plan, inp), n: n, FL: FL };
    }
    /* Durée : la course se termine au premier passage de ligne après la durée. Un plan de n tours donne n tours si le
       passage de ligne n-1 a lieu avant la durée. On peut toujours finir par un relais d'un tour (arrêt compté après
       le passage n-1), avec la gomme obligatoire manquante s'il en manque une. G(n) = meilleur temps au passage n-1. */
    var bestN = 0, bestMask = -1, g;
    for (var k = 1; k <= nMax; k++) {
      g = Infinity; var gm = -1;
      for (var m = 0; m <= full; m++) {
        var missing = full & ~m, single = missing === 0 || (missing & (missing - 1)) === 0;
        if (!single) continue;
        var tv = tStar(dp, k - 1, m, inp);
        if (tv < g) { g = tv; gm = m; }
      }
      if (g < inp.durationSec) { bestN = k; bestMask = gm; }
    }
    if (!bestN) return tooShort;
    n = bestN;
    var cands = [];
    if (finite(tStar(dp, n, full, inp))) cands.push(buildPlan(reconstruct(dp, n, full), FL));
    if (n === 1) cands.push({ stints: [{ laps: 1, compound: required[0] || allowed[0], newTires: true }] });
    else {
      var base = buildPlan(reconstruct(dp, n - 1, bestMask), FL), missingBits = full & ~bestMask;
      if (missingBits === 0) extendPlans(base, inp, FL).forEach(function (p2) { cands.push(p2); });
      else {
        var x = required[Math.log2(missingBits)], p3 = clonePlan(base);
        p3.stints.push({ laps: 1, compound: x, newTires: true });
        cands.push(p3);
      }
    }
    var found = null;
    cands.forEach(function (c) {
      var e = evaluate(c, inp);
      if (e.valid && e.laps === n && (!found || e.stopsCount < found.ev.stopsCount ||
        (e.stopsCount === found.ev.stopsCount && e.timeSec < found.ev.timeSec))) found = { plan: c, ev: e };
    });
    if (!found) { plan = cands[0]; found = { plan: plan, ev: evaluate(plan, inp) }; }
    return { ok: true, plan: found.plan, ev: found.ev, n: n, FL: FL };
  }

  /* Meilleure stratégie + comparaisons (sans obligation, ou avec une seule gomme quand c'est permis). */
  function optimize(inp) {
    var allowed = allowedOf(inp);
    if (!allowed.length) return { ok: false, error: 'noTires', message: 'Aucune gomme complète (étape 4).' };
    var req = inp.required || [];
    var main = solve(inp, allowed);
    if (!main.ok) return main;
    main.alternatives = [];
    function addAlt(label, compound, r) {
      if (!r.ok) return;
      main.alternatives.push({ compound: compound, label: label, stops: r.ev.stopsCount, laps: r.ev.laps, timeSec: r.ev.timeSec,
        deltaSec: r.ev.timeSec - main.ev.timeSec, deltaLaps: r.ev.laps - main.ev.laps });
    }
    if (req.length) addAlt('Sans gomme obligatoire (référence)', null, solve(Object.assign({}, inp, { required: [] }), allowed));
    if (allowed.length > 1) allowed.forEach(function (k) {
      if (req.some(function (x) { return x !== k; })) return;
      addAlt('Uniquement ' + LABEL[k], k, solve(Object.assign({}, inp, { required: req.filter(function (x) { return x === k; }) }), [k]));
    });
    return main;
  }

  /* ---------- modifications de la stratégie par l'utilisateur (sans mutation) ---------- */
  function clonePlan(plan) {
    return { stints: plan.stints.map(function (s) { return { laps: s.laps, compound: s.compound, newTires: s.newTires }; }) };
  }
  function setStintLaps(plan, i, laps) {
    var p = clonePlan(plan);
    if (p.stints[i]) p.stints[i].laps = laps;
    return p;
  }
  /* i = 0 : change la gomme de départ ; i > 0 : garde les pneus (flag = false) ou monte des pneus neufs de la gomme donnée. */
  function setTires(plan, i, flag, compound) {
    var p = clonePlan(plan);
    if (!p.stints[i] || KEYS.indexOf(compound || p.stints[i].compound) === -1) return p;
    if (i === 0) { if (compound) p.stints[0].compound = compound; return p; }
    p.stints[i].newTires = !!flag;
    if (flag && compound) p.stints[i].compound = compound;
    return p;
  }
  /* Ajoute un arrêt en coupant le plus long relais en deux (pneus conservés). Retourne le même plan si impossible. */
  function addStop(plan) {
    var best = -1;
    plan.stints.forEach(function (s, i) { if (s.laps >= 2 && (best === -1 || s.laps > plan.stints[best].laps)) best = i; });
    if (best === -1) return plan;
    var p = clonePlan(plan), s = p.stints[best], a = Math.ceil(s.laps / 2);
    p.stints.splice(best + 1, 0, { laps: s.laps - a, compound: s.compound, newTires: false });
    s.laps = a;
    return p;
  }
  /* Supprime l'arrêt avant le relais i (le relais est fusionné avec le précédent). */
  function removeStop(plan, i) {
    if (i < 1 || i >= plan.stints.length) return plan;
    var p = clonePlan(plan);
    p.stints[i - 1].laps += p.stints[i].laps;
    p.stints.splice(i, 1);
    return p;
  }

  return { KEYS: KEYS, LABEL: LABEL, MAX_PLAN_LAPS: MAX_PLAN_LAPS, fuelLimitLaps: fuelLimitLaps, fuelPct: fuelPct,
    buildInputs: buildInputs, normalize: normalize, evaluate: evaluate, optimize: optimize, solve: solve,
    clonePlan: clonePlan, setStintLaps: setStintLaps, setTires: setTires, addStop: addStop, removeStop: removeStop,
    allowedOf: allowedOf, tStar: tStar, runDP: runDP, reconstruct: reconstruct, buildPlan: buildPlan };
});
