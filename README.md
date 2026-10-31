# Stratégie d'endurance GT7

Site web statique (HTML, CSS, JavaScript) qui aide les joueurs de **Gran Turismo 7** à construire une stratégie
d'arrêts aux stands et de changements de pneus pour les courses d'endurance.

Aucun serveur, aucun PHP, aucune base de données : il suffit d'héberger les fichiers (DreamHost en serveur partagé,
GitHub Pages, etc.). Les données saisies restent dans le navigateur (`localStorage`).

## Les cinq étapes

1. **Circuit** : choix d'un tracé GT7 et modification possible de la longueur totale.
2. **Durée de la course** : en minutes (ou `1h30`) ou en nombre de tours, avec la distance totale en mode tours.
3. **Passage au stand et carburant** : temps de passage, temps additionnel pour les pneus, vitesse de remplissage,
   consommation par tour (pour un réservoir normalisé à 100 litres).
4. **Performances des pneus** : temps moyen au tour et nombre maximal de tours pour Soft, Medium, Hard, Intermédiaire
   et Pluie, avec une case « obligatoire » par gomme.
5. **Stratégie** : proposition du meilleur plan (nombre d'arrêts, gommes, essence à chaque arrêt), modifiable
   (tours par relais, pneus, ajout/suppression d'arrêts) avec contrôles en direct et comparaison.

## Structure

```
index.html          page unique
css/style.css       styles
js/tracks.js        données des circuits (une ligne par tracé)
js/logic.js         saisies, validations, formats, sauvegarde (étapes 1 à 4)
js/strategy.js      moteur de stratégie (fonctions pures)
js/app.js           interface (DOM)
tests/              tests Node et tests navigateur (Playwright)
```

## Utiliser en local

Ouvrir `index.html` dans un navigateur, ou lancer `npm run serve`.

## Tests

```bash
npm install
npx playwright install chromium   # une seule fois, pour les tests navigateur
npm test                          # logique et moteur de stratégie (Node)
npm run test:browser              # parcours réels dans Chromium
```

Le moteur de stratégie est comparé, sur de petites courses, à une recherche exhaustive de toutes les stratégies
possibles (course en tours et course à la durée, avec gommes obligatoires).

## Modèle de calcul (hypothèses)

- Départ réservoir plein ; ravitaillement limité au nécessaire jusqu'à l'arrêt suivant, plus une marge (0,5 tour par défaut).
- Durée d'un arrêt = passage au stand + changement de pneus éventuel + ravitaillement (additionnés).
- Temps au tour constants pour chaque gomme (ni poids du carburant, ni usure progressive).
- Un train de pneus dure au plus « nombre maximal de tours » tours cumulés, même sur plusieurs relais.
- Course à la durée : elle se termine au premier passage de ligne après la durée.
- « Obligatoire » = gomme utilisée au moins une fois pendant la course.

## Données des circuits

Seules trois longueurs sont confirmées par des sources officielles (Spa 7,004 km, Nürburgring Endurance 23,864 km,
Red Bull Ring Short 2,336 km). Les autres sont approximatives et signalées comme telles dans l'interface ; les circuits
fictifs de GT7 ne sont pas encore listés. Pour corriger ou ajouter un tracé, modifier `js/tracks.js` :

```js
['Nom du circuit', 'Tracé', 'Pays', 5.807, true]   // true = longueur confirmée
```

## Déploiement

Copier `index.html`, `css/` et `js/` à la racine du site (le dossier `tests/` n'est pas nécessaire en ligne).
Avec GitHub Pages : Settings → Pages → déployer depuis la branche `main`, dossier `/ (root)`.
