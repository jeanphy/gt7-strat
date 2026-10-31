/* Données des circuits GT7. Format : [circuit, tracé, pays, longueur en km, vérifiée?]
   vérifiée = true : confirmée par une source officielle (gran-turismo.com).
   vérifiée = false : valeur approximative du circuit réel, à confirmer dans le jeu.
   Pour ajouter un tracé, ajoutez simplement une ligne. */
(function (root) {
  var rows = [
    ['Circuit de la Sarthe (24 Heures du Mans)', 'Tracé complet', 'France', 13.626, false],
    ['Nürburgring', 'Nordschleife', 'Allemagne', 20.832, false],
    ['Nürburgring', '24 Heures', 'Allemagne', 25.378, false],
    ['Nürburgring', 'Endurance', 'Allemagne', 23.864, true],
    ['Nürburgring', 'Grand Prix', 'Allemagne', 5.148, false],
    ['Spa-Francorchamps', 'Tracé complet', 'Belgique', 7.004, true],
    ['Suzuka', 'Tracé complet', 'Japon', 5.807, false],
    ['Fuji Speedway', 'Grand Prix', 'Japon', 4.563, false],
    ['Tsukuba', 'Tracé complet', 'Japon', 2.045, false],
    ['Autodromo Nazionale Monza', 'Tracé complet', 'Italie', 5.793, false],
    ['Autódromo José Carlos Pace (Interlagos)', 'Tracé complet', 'Brésil', 4.309, false],
    ['Mount Panorama', 'Tracé complet', 'Australie', 6.213, false],
    ['Daytona', 'Road Course', 'États-Unis', 5.729, false],
    ['WeatherTech Raceway Laguna Seca', 'Tracé complet', 'États-Unis', 3.602, false],
    ['Road Atlanta', 'Tracé complet', 'États-Unis', 4.088, false],
    ['Watkins Glen', 'Long Course', 'États-Unis', 5.472, false],
    ['Willow Springs', 'Big Willow', 'États-Unis', 4.023, false],
    ['Red Bull Ring', 'Tracé complet', 'Autriche', 4.318, false],
    ['Red Bull Ring', 'Short Track', 'Autriche', 2.336, true],
    ['Brands Hatch', 'Grand Prix', 'Royaume-Uni', 3.908, false],
    ['Brands Hatch', 'Indy', 'Royaume-Uni', 1.929, false],
    ['Goodwood', 'Motor Circuit', 'Royaume-Uni', 3.862, false],
    ['Circuit de Barcelona-Catalunya', 'Grand Prix', 'Espagne', 4.657, false]
  ];
  if (typeof module === 'object' && module.exports) module.exports = rows;
  else root.GT7_ROWS = rows;
})(typeof self !== 'undefined' ? self : this);
