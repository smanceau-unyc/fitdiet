/**
 * coachEngine.js — Moteur de décision du coach.
 *
 * Toute la logique est déterministe et testable (voir tests.html). Le texte produit
 * explique la décision ; il ne la prend jamais.
 *
 * Règles directrices :
 *  - une pesée isolée ne déclenche jamais de modification ;
 *  - une réduction calorique n'est jamais la première réponse ;
 *  - on ne modifie qu'une variable à la fois, et le moins possible ;
 *  - "aucune modification" est une vraie décision.
 */
window.FD = window.FD || {};

FD.coach = (function () {
  const U = FD.utils;

  const DECISIONS = {
    securite: 'Avis professionnel recommandé',
    donnees_insuffisantes: 'Pas encore assez de données',
    maintenir: 'Aucune modification',
    maintenir_recompo: 'Aucune modification calorique',
    observer: 'Continuer à observer',
    ameliorer_adherence: 'Améliorer la régularité du suivi',
    ameliorer_proteines: 'Remonter les protéines',
    plateau: 'Stagnation confirmée : un petit ajustement',
    augmenter_kcal: 'Déficit probablement trop important'
  };

  /** Réponses au questionnaire hebdo le plus récent (semaine en cours ou précédente). */
  function latestCheckin(state, iso) {
    const cur = state.checkins[U.isoWeekKey(iso)];
    if (cur) return cur;
    return state.checkins[U.isoWeekKey(U.addDays(iso, -7))] || null;
  }

  function confidenceOf(state, iso, wt) {
    const food28 = FD.adherence.stats(state, iso, 28).trackedDays;
    const w28 = wt.avg28.count;
    const full = wt.blocks[3] && wt.blocks[3].count >= 3;
    if (full && w28 >= 15 && food28 >= 15) return { level: 'eleve', label: 'Élevée', reason: 'Données complètes sur au moins 3 semaines (' + w28 + ' pesées, ' + food28 + ' jours de journal).' };
    if (wt.avg14.count >= 8) return { level: 'moyen', label: 'Moyenne', reason: 'Données partielles : ' + wt.avg28.count + ' pesées et ' + food28 + ' jours de journal sur 28 jours.' };
    return { level: 'faible', label: 'Faible', reason: 'Seulement ' + wt.avg28.count + ' pesée' + (wt.avg28.count > 1 ? 's' : '') + ' sur les 28 derniers jours.' };
  }

  function perfStatus(adh, checkin) {
    if (checkin && checkin.performance) return checkin.performance;
    if (adh.perfDown >= 2 && adh.perfDown > adh.perfUp) return 'baisse';
    if (adh.perfUp >= 2 && adh.perfUp > adh.perfDown) return 'hausse';
    return adh.perfLogged ? 'stable' : 'inconnu';
  }

  /** Problèmes d'adhérence identifiés, avec une solution pratique pour chacun. */
  function adherenceIssues(adh) {
    const issues = [];
    if (adh.trackedPct !== null && adh.trackedPct < 85) issues.push({ code: 'non_suivi', text: (adh.n - adh.trackedDays) + ' jour(s) sans journal sur 7.', fix: 'Même une saisie approximative vaut mieux qu\'une journée vide : utilise tes repas types en un clic.' });
    if (adh.weekendGap !== null && adh.weekendGap > 300) issues.push({ code: 'weekend', text: 'Le week-end est en moyenne ' + U.kcal(adh.weekendGap) + ' kcal au-dessus de la semaine.', fix: 'Prévois un repas libre dans ton budget hebdomadaire plutôt que de le subir.' });
    if (adh.freeMeals >= 3) issues.push({ code: 'repas_libres', text: adh.freeMeals + ' repas libres ou restaurant cette semaine, estimés à la louche.', fix: 'Pour les repas hors maison, estime large : sauces et huile de cuisson sont souvent sous-estimées.' });
    if (adh.kcalAdherence !== null && adh.kcalAdherence < 85 && !issues.length) issues.push({ code: 'portions', text: 'Les calories s\'écartent souvent de plus de 10 % de la cible.', fix: 'Pèse les féculents et les matières grasses quelques jours : ce sont eux qui font varier le total.' });
    return issues;
  }

  /** Choix entre +pas et −kcal selon le contexte (renvoie 'pas' ou 'kcal' et les raisons). */
  function choosePriority(state, adh, hungerHigh, perf, checkin) {
    const p = state.profile;
    const reasons = { pas: [], kcal: [] };
    const avgTargetAfter = adh.avgTarget - 100;
    if (adh.avgSteps !== null && adh.avgSteps < 8000) reasons.pas.push('activité quotidienne encore modérée (' + U.num(U.roundTo(adh.avgSteps, 100)) + ' pas/j)');
    if (hungerHigh) reasons.pas.push('faim élevée');
    if (checkin && checkin.cravings === 'souvent') reasons.pas.push('fringales fréquentes le soir');
    if (perf !== 'baisse') reasons.pas.push('performances bonnes ou stables');
    if (avgTargetAfter < p.kcalMin) reasons.pas.push('une baisse ferait passer sous ton plancher de ' + U.num(p.kcalMin) + ' kcal');
    if (adh.avgSteps !== null && adh.avgSteps >= 10000) reasons.kcal.push('pas déjà élevés (' + U.num(U.roundTo(adh.avgSteps, 100)) + '/j)');
    if (adh.kcalAdherence !== null && adh.kcalAdherence >= 95) reasons.kcal.push('adhérence alimentaire excellente');
    if (adh.avgTarget > p.kcalMax + 100) reasons.kcal.push('calories actuelles relativement élevées');
    if (checkin && checkin.cannotMoveMore) reasons.kcal.push('activité difficile à augmenter');
    return { choice: reasons.pas.length >= reasons.kcal.length ? 'pas' : 'kcal', reasons };
  }

  function stepsOption(state, adh) {
    const base = Math.max(adh.avgSteps || state.profile.steps || 0, 0);
    const lo = U.roundTo(base + 1000, 500), hi = U.roundTo(base + 2000, 500);
    const target = U.roundTo(base + 1500, 500);
    return {
      id: 'pas', label: 'Augmenter les pas à environ ' + U.num(lo) + '–' + U.num(hi) + ' par jour',
      consequence: 'Tes calories restent identiques. Environ 50 à 100 kcal de dépense en plus par jour (estimation).',
      apply: { type: 'stepsGoal', value: target }, applyLabel: 'Objectif de pas : ' + U.num(target)
    };
  }

  function kcalDownOption(state) {
    const p = state.profile;
    const minT = Math.min.apply(null, state.sessionTypes.map((t) => t.kcal + p.kcalOffset)) - 100;
    return {
      id: 'kcal', label: 'Réduire les calories d\'environ 100–150 kcal/jour',
      consequence: 'Activité inchangée, assiettes un peu plus légères (ex. −30 g de riz cru ou −10 g d\'huile).' + (minT < p.kcalMin ? ' Attention : certains jours passeraient sous ton plancher de ' + U.num(p.kcalMin) + ' kcal.' : ''),
      apply: { type: 'kcalOffset', value: p.kcalOffset - 100 }, applyLabel: 'Toutes les cibles −100 kcal'
    };
  }

  function kcalUpOption(state, amount) {
    const p = state.profile;
    return {
      id: 'kcal_plus', label: 'Augmenter les calories d\'environ ' + amount + ' kcal/jour, en glucides',
      consequence: 'Perte un peu plus lente mais meilleure récupération et performances mieux préservées.',
      apply: { type: 'kcalOffset', value: p.kcalOffset + amount }, applyLabel: 'Toutes les cibles +' + amount + ' kcal'
    };
  }

  /**
   * Évalue la situation et renvoie une décision complète et expliquée.
   * @param {object} state  état de l'application
   * @param {string} iso    date d'évaluation (YYYY-MM-DD)
   */
  function evaluateUserState(state, iso) {
    const p = state.profile;
    const cfg = state.settings.coach;

    // 1-4. Données, qualité, moyennes, tendances
    const wt = FD.trends.weightTrend(state, iso);
    const waist = FD.trends.waistTrend(state, iso);
    const adh = FD.adherence.stats(state, FD.adherence.windowEnd(state, iso), 7);
    const checkin = latestCheckin(state, iso);
    const notes = FD.trends.fluctuations(state, iso);
    const confidence = confidenceOf(state, iso, wt);
    const perf = perfStatus(adh, checkin);
    const hungerHigh = (checkin && checkin.hunger >= 7) || (adh.avgHunger !== null && adh.avgHunger >= 7);
    const proteinPct = adh.avgProtein !== null ? adh.avgProtein / p.proteinG * 100 : null;
    const tips = [];

    if (waist.caution) notes.push({ code: 'mesure', text: 'Les conditions de mesure du tour de taille semblent différentes. Comparaison à interpréter avec prudence.' });
    if (adh.weekendGap !== null && adh.weekendGap > 300) notes.push({ code: 'weekend', text: 'Semaine ≈ ' + U.kcal(adh.weekdayKcal) + ' kcal/j, week-end ≈ ' + U.kcal(adh.weekendKcal) + ' kcal/j. La moyenne hebdomadaire est probablement plus élevée que l\'objectif quotidien ne le laisse penser.' });
    if (checkin && checkin.cravings === 'souvent') tips.push('Fringales du soir : garde plus de calories pour le dîner, augmente le volume de légumes, ajoute une source de protéines rassasiante, ou prévois un dessert léger volontairement.');
    if (adh.avgFiber !== null && adh.trackedDays >= 4 && adh.avgFiber < 25) tips.push('Fibres autour de ' + U.num(adh.avgFiber) + ' g/j : ajoute légumes, fruits, légumineuses ou céréales complètes.');

    // Observations (ce que j'observe)
    const observe = [];
    if (wt.avg7.avg !== null) observe.push('Poids moyen 7 jours : ' + U.num(wt.avg7.avg, 1) + ' kg' + (wt.change !== null ? ' (' + (wt.change > 0 ? '+' : '') + U.num(wt.change, 1) + ' kg vs semaine précédente, ' + wt.label + ')' : '') + '.');
    if (wt.flatWeeks >= 2) observe.push('Poids sans baisse significative depuis ' + (wt.flatWeeks + 1) + ' semaines.');
    if (waist.status !== 'inconnu') observe.push('Tour de taille : ' + (waist.delta > 0 ? '+' : '') + U.num(waist.delta, 1) + ' cm en ' + waist.days + ' jours (' + waist.status + ').');
    else observe.push('Tour de taille : pas assez de mesures pour une tendance.');
    if (adh.avgKcal !== null) observe.push('Calories : ≈ ' + U.kcal(adh.avgKcal) + ' kcal/j en moyenne (cible moyenne ≈ ' + U.kcal(adh.avgTarget) + ').');
    if (proteinPct !== null) observe.push('Protéines : ' + U.num(adh.avgProtein) + ' g/j, soit ' + Math.round(proteinPct) + ' % de l\'objectif.');
    if (adh.avgSteps !== null) observe.push('Pas : ≈ ' + U.num(U.roundTo(adh.avgSteps, 100)) + '/j (objectif ' + U.num(p.stepsGoal) + ').');
    if (perf !== 'inconnu') observe.push('Performances : ' + perf + '.');
    if (adh.score !== null) observe.push('Adhérence cette semaine : ' + adh.score + ' %.');

    let code, meaning, recommend, why, options = [], reevalDays = 14, applyNow = null;

    // 5. Sécurité : priorité absolue
    const floor = FD.calc.floorKcal(state);
    const safety = [];
    if (p.pregnancy) safety.push('grossesse déclarée');
    if (p.medicalCondition) safety.push('pathologie nécessitant un suivi médical');
    if (p.medication) safety.push('traitement pouvant affecter le poids ou l\'alimentation');
    if (checkin && checkin.symptoms) safety.push('symptômes signalés (vertiges, malaise, fatigue inhabituelle…)');
    if (checkin && checkin.foodConcern) safety.push('relation difficile avec l\'alimentation signalée');
    if (adh.avgKcal !== null && adh.trackedDays >= 4 && adh.avgKcal < floor) safety.push('apport moyen très bas (≈ ' + U.kcal(adh.avgKcal) + ' kcal/j)');
    if (wt.pct !== null && wt.pct <= -1.5) safety.push('perte de poids extrêmement rapide (' + U.num(wt.pct, 1) + ' %/semaine)');

    if (safety.length) {
      code = 'securite';
      meaning = 'Situation détectée : ' + safety.join(', ') + '.';
      recommend = 'Cette situation nécessite un avis professionnel. L\'application ne modifiera pas automatiquement ton objectif calorique.';
      why = 'Dans ces cas, un ajustement automatique pourrait être inadapté. Un médecin ou un diététicien pourra tenir compte de ta situation complète.';
      reevalDays = 7;
    } else if (wt.pct === null) {
      // 6. Données insuffisantes
      code = 'donnees_insuffisantes';
      meaning = 'Il faut au moins 3 pesées sur chacune des 2 dernières semaines pour calculer une tendance.';
      recommend = 'Pèse-toi le matin à jeun, au moins 5 jours sur 7, et renseigne ton journal. Aucune modification en attendant.';
      why = 'Une pesée isolée varie de ±1 kg selon l\'eau et le contenu digestif : elle ne permet aucune conclusion.';
      reevalDays = 7;
    } else if (wt.cls === 'perte_tres_elevee' || wt.cls === 'perte_elevee') {
      // 7. Perte rapide
      if (wt.cls === 'perte_tres_elevee' || perf === 'baisse' || hungerHigh) {
        code = 'augmenter_kcal';
        const amount = wt.cls === 'perte_tres_elevee' ? 150 : 100;
        meaning = 'La perte dépasse 0,75 % du poids par semaine' + (perf === 'baisse' ? ', avec des performances en baisse' : '') + (hungerHigh ? ' et une faim élevée' : '') + '. Le déficit pourrait être trop important pour préserver le muscle.';
        recommend = 'Augmenter légèrement les calories (+' + amount + ' kcal/j, surtout en glucides). Ne pas réduire l\'entraînement.';
        why = 'L\'objectif est de perdre de la masse grasse en gardant le muscle et les performances, pas de faire bouger la balance au plus vite.';
        options = [kcalUpOption(state, amount)];
        applyNow = options[0];
      } else {
        code = 'maintenir';
        meaning = 'La perte est rapide (' + U.num(wt.pct, 2) + ' %/sem.) mais performances et faim restent correctes.';
        recommend = 'Ne rien réduire. Surveiller performances et faim ; si l\'une des deux se dégrade, on remontera un peu les calories.';
        why = 'Un rythme élevé est tolérable tant que la récupération suit, mais il n\'y a aucune raison d\'accélérer.';
      }
    } else if (wt.cls === 'perte_moderee' || wt.cls === 'perte_faible') {
      // 8. Perte en cours : on ne touche à rien
      code = 'maintenir';
      meaning = waist.status === 'baisse'
        ? 'Le poids et le tour de taille baissent : situation favorable.'
        : 'Le poids baisse à un rythme ' + (wt.cls === 'perte_faible' ? 'lent' : 'modéré') + '. C\'est compatible avec une perte de gras et la conservation du muscle.';
      recommend = 'Aucune modification. Garde tes calories et ton activité actuelles.';
      why = 'Une semaine qui progresse ne nécessite aucune modification : changer maintenant ajouterait de la contrainte sans bénéfice.';
      if (adh.avgSteps !== null && adh.avgSteps < p.stepsGoal * 0.9) tips.push('Pas autour de ' + U.num(U.roundTo(adh.avgSteps, 100)) + '/j pour un objectif de ' + U.num(p.stepsGoal) + ' : te rapprocher progressivement de l\'objectif reste un levier utile, sans urgence.');
      if (proteinPct !== null && proteinPct < cfg.proteinMin) tips.unshift('Protéines à ' + Math.round(proteinPct) + ' % de l\'objectif : remonte-les sans changer les calories (poulet, skyr, œufs, poisson).');
    } else if (waist.status === 'baisse') {
      // 9. Cas critique : poids stable (ou en légère hausse) mais tour de taille en baisse
      code = 'maintenir_recompo';
      meaning = 'Le poids est stable mais le tour de taille diminue. Cela peut être compatible avec une perte de masse grasse et une recomposition corporelle.';
      const lowSteps = adh.avgSteps !== null && adh.avgSteps < p.stepsGoal;
      if (lowSteps) {
        const opt = stepsOption(state, adh);
        opt.apply.value = Math.max(p.stepsGoal, U.roundTo((adh.avgSteps || 0) + 1000, 500));
        opt.label = 'Augmenter progressivement les pas vers ' + U.num(opt.apply.value) + '/jour';
        opt.applyLabel = 'Objectif de pas : ' + U.num(opt.apply.value);
        options = [opt];
        recommend = 'Ne pas réduire les calories. Augmenter progressivement l\'activité quotidienne : cible initiale d\'environ ' + U.num(opt.apply.value) + ' pas/jour.';
        why = 'Le tour de taille indique un progrès que la balance ne montre pas. L\'activité quotidienne est le levier le moins contraignant pour accompagner cette tendance.';
      } else {
        recommend = 'Maintenir le plan et continuer à observer la tendance.';
        why = 'Réduire les calories maintenant risquerait de freiner une recomposition qui semble fonctionner.' + (perf !== 'baisse' ? ' Avec des performances stables, il vaut mieux ne rien modifier.' : '');
      }
    } else {
      // 10. Poids stable + tour de taille stable / inconnu
      const issues = adherenceIssues(adh);
      const lowAdh = (adh.kcalAdherence !== null && adh.kcalAdherence < cfg.adherenceMin) || (adh.trackedPct !== null && adh.trackedPct < cfg.adherenceMin);
      const spike = notes.some((n) => n.code === 'hausse_rapide');
      if (spike) {
        code = 'observer';
        meaning = 'Le poids a augmenté brusquement ces 2 derniers jours. Ce n\'est pas une prise de graisse : l\'eau, le sel, les glucides et le contenu digestif suffisent à l\'expliquer.';
        recommend = 'Aucune modification. On regarde la moyenne des prochains jours avant de conclure quoi que ce soit.';
        why = 'Ajuster les calories sur une hausse de 2 jours reviendrait à réagir au bruit plutôt qu\'à la tendance.';
        reevalDays = 7;
      } else if (lowAdh) {
        code = 'ameliorer_adherence';
        meaning = 'L\'adhérence calorique est de ' + (adh.kcalAdherence || 0) + ' % (' + adh.trackedDays + ' jours suivis sur 7) : les données ne permettent pas de savoir si le plan actuel fonctionne.';
        recommend = 'Avant de modifier l\'objectif calorique, il est préférable d\'améliorer la régularité du suivi. ' + (issues[0] ? issues[0].fix : '');
        why = 'Réduire les calories sur la base d\'un suivi incomplet risquerait de corriger un problème qui n\'existe pas.';
        options = issues.map((i) => ({ id: 'adh_' + i.code, label: i.text, consequence: i.fix }));
        reevalDays = 7;
      } else if (wt.flatWeeks < 2 || waist.status === 'inconnu') {
        code = 'observer';
        meaning = 'Pas suffisamment de données pour conclure à une stagnation' + (waist.status === 'inconnu' ? ' (il manque des mesures du tour de taille)' : ' (moins de 3 semaines sans baisse)') + '.';
        recommend = 'Aucune modification. ' + (waist.status === 'inconnu' ? 'Mesure ton tour de taille une fois par semaine, dans les mêmes conditions.' : 'Continue le suivi une semaine de plus.');
        why = 'Une stagnation ne se juge que sur 2 à 3 semaines, avec le tour de taille.';
        reevalDays = 7;
      } else if (proteinPct !== null && proteinPct < cfg.proteinMin) {
        code = 'ameliorer_proteines';
        meaning = 'Les protéines sont à ' + Math.round(proteinPct) + ' % de l\'objectif. C\'est la priorité avant toute baisse de calories.';
        recommend = 'Atteindre ≈ ' + p.proteinG + ' g/j à calories constantes : poulet, dinde, poisson, œufs, skyr, fromage blanc, viande maigre, légumineuses, tofu.';
        why = 'Des protéines suffisantes protègent la masse musculaire en déficit et améliorent la satiété.';
        reevalDays = 14;
      } else {
        code = 'plateau';
        const pr = choosePriority(state, adh, hungerHigh, perf, checkin);
        const steps = stepsOption(state, adh), down = kcalDownOption(state);
        options = pr.choice === 'pas' ? [steps, down] : [down, steps];
        options[0].recommended = true;
        meaning = 'Poids et tour de taille stables depuis ' + (wt.flatWeeks + 1) + ' semaines avec une bonne adhérence (' + adh.kcalAdherence + ' %) : la stagnation est réelle.';
        recommend = pr.choice === 'pas'
          ? 'Option recommandée : augmenter les pas de 1 000 à 2 000 par jour, sans toucher aux calories.'
          : 'Option recommandée : réduire les calories de 100 à 150 kcal/jour, sans toucher à l\'activité.';
        why = 'Raisons : ' + (pr.reasons[pr.choice].join(', ') || 'modification la plus simple') + '. Une seule variable change à la fois, pour savoir ce qui fonctionne. Ne jamais appliquer les deux en même temps.';
      }
    }

    // Expert : dépense estimée et recalibrage par la tendance
    const t = FD.calc.tdee(p);
    const details = {
      data: {
        'Poids moyen 7 j': wt.avg7.avg !== null ? U.num(wt.avg7.avg, 1) + ' kg (' + wt.avg7.count + ' pesées)' : '—',
        'Poids moyen 14 j': wt.avg14.avg !== null ? U.num(wt.avg14.avg, 1) + ' kg' : '—',
        'Poids moyen 28 j': wt.avg28.avg !== null ? U.num(wt.avg28.avg, 1) + ' kg' : '—',
        'Variation hebdo': wt.pct !== null ? U.num(wt.change, 2) + ' kg (' + U.num(wt.pct, 2) + ' %)' : '—',
        'Jours suivis (7 j)': adh.trackedDays + '/7',
        'Apport moyen': adh.avgKcal !== null ? '≈ ' + U.kcal(adh.avgKcal) + ' kcal' : '—',
        'Pas moyens': adh.avgSteps !== null ? U.num(U.roundTo(adh.avgSteps, 100)) : '—'
      },
      calc: [
        'Dépense estimée par formule : ' + U.kcal(t.low) + '–' + U.kcal(t.high) + ' kcal/j (BMR Mifflin × ' + U.num(t.factor, 2) + ' + sport).'
      ],
      hypotheses: [
        '1 kg de variation de poids ≈ 7 700 kcal (approximation qui ignore l\'eau et le glycogène).',
        'Les jours sans journal sont exclus des moyennes d\'apport.',
        'Valeurs nutritionnelles de démonstration : indicatives tant que la base Ciqual n\'est pas importée.'
      ],
      uncertainty: confidence.level === 'eleve' ? 'modérée' : 'élevée'
    };
    if (adh.avgKcal !== null) {
      details.calc.push('Déficit estimé : ' + U.kcal(t.low - adh.avgKcal) + '–' + U.kcal(t.high - adh.avgKcal) + ' kcal/j (incertitude ' + details.uncertainty + ').');
      if (wt.change !== null && confidence.level !== 'faible' && adh.trackedDays >= 5) {
        const obs = adh.avgKcal - wt.change * 7700 / 7;
        details.calc.push('Dépense recalibrée par la tendance : ≈ ' + U.kcal(obs - 150) + '–' + U.kcal(obs + 150) + ' kcal/j.');
      }
    }

    // Durée indicative vers l'objectif
    let eta = null;
    if (wt.pct !== null && wt.pct <= -0.25 && wt.avg7.avg > p.targetWeight) {
      const weeks = (wt.avg7.avg - p.targetWeight) / -wt.change;
      eta = { min: Math.max(1, Math.round(weeks * 0.8)), max: Math.round(weeks * 1.3), basis: 'rythme actuel' };
    } else {
      const g = FD.calc.timeToGoal(Object.assign({}, p, { weight: wt.avg7.avg || p.weight }), 0.25, 0.5);
      if (g) eta = { min: g.min, max: g.max, basis: 'rythme cible de 0,25–0,5 %/semaine' };
    }

    const result = {
      date: iso, code, title: DECISIONS[code], observe, meaning, recommend, why, options, applyNow, tips, notes,
      confidence, reevaluate: U.addDays(iso, reevalDays), details, eta,
      metrics: { avgWeight: wt.avg7.avg, waist: waist.now ? waist.now.v : null, waistStatus: waist.status, weightClass: wt.cls, pct: wt.pct, flatWeeks: wt.flatWeeks, avgKcal: adh.avgKcal, avgProtein: adh.avgProtein, avgSteps: adh.avgSteps, adherence: adh.score, kcalAdherence: adh.kcalAdherence, perf, hungerHigh },
      adherence: adh
    };
    result.summary = summarize(result, state);
    return result;
  }

  /** Synthèse en langage naturel (ton direct, calme, jamais culpabilisant). */
  function summarize(r, state) {
    const m = r.metrics;
    const parts = [];
    switch (r.code) {
      case 'securite': return 'Je préfère ne rien ajuster automatiquement cette semaine. ' + r.meaning + ' Un avis professionnel est la bonne étape.';
      case 'donnees_insuffisantes': return 'Il me manque encore des pesées pour dégager une tendance. Continue à te peser le matin et à remplir ton journal : je pourrai analyser dès la semaine prochaine.';
      default: break;
    }
    if (m.weightClass && m.weightClass.startsWith('perte')) parts.push('Ton poids moyen baisse (' + FD.trends.CLASS_LABEL[m.weightClass] + ')');
    else if (m.weightClass === 'stable') parts.push('Ton poids moyen est stable');
    else if (m.weightClass === 'hausse') parts.push('Ton poids moyen remonte légèrement');
    if (m.waistStatus === 'baisse') parts.push('ton tour de taille continue de diminuer');
    else if (m.waistStatus === 'stable') parts.push('ton tour de taille est stable');
    let s = parts.join(' et ') + '. ';
    if (m.avgProtein !== null) s += (m.avgProtein >= state.profile.proteinG * 0.9 ? 'Tes protéines sont suffisantes. ' : 'Tes protéines sont un peu justes. ');
    s += r.recommend;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Rapport hebdomadaire : 7 derniers jours vs 7 précédents. */
  function weeklyReport(state, iso) {
    const cur = FD.adherence.stats(state, FD.adherence.windowEnd(state, iso), 7);
    const prevEnd = U.addDays(iso, -7);
    const w0 = FD.trends.windowAvg(state, 'weight', iso, 7), w1 = FD.trends.windowAvg(state, 'weight', prevEnd, 7);
    const waistNow = FD.trends.lastValue(state, 'waist', iso);
    const waistPrev = FD.trends.lastValue(state, 'waist', U.addDays(iso, -7));
    const r = evaluateUserState(state, iso);
    return {
      period: [U.addDays(iso, -6), iso],
      weight: w0.avg, prevWeight: w1.avg, delta: w0.avg !== null && w1.avg !== null ? w0.avg - w1.avg : null,
      waistFrom: waistPrev && waistNow && waistPrev.iso !== waistNow.iso ? waistPrev.v : null, waistTo: waistNow ? waistNow.v : null,
      kcal: cur.avgKcal, protein: cur.avgProtein, steps: cur.avgSteps, adherence: cur.score, components: cur.components,
      analysis: r.meaning, action: r.recommend, decision: r
    };
  }

  return { evaluateUserState, weeklyReport, DECISIONS, latestCheckin };
})();
