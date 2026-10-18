// Calcule l'emprise de la carte à partir de la frontière du Maroc (Natural Earth, domaine public, version « point de
// vue du Maroc ») et écrit les deux fichiers que le reste du projet lit :
//   - frontend/src/app/portail/chantier/carte/maroc.frontiere.json : la frontière (utilisée par les tests) ;
//   - frontend/src/app/portail/chantier/carte/emprise-maroc.json      : le territoire et l'emprise de la carte.
// Aucune valeur n'est saisie à la main. Voir docs/chantier/carte.md, « Emprise du Maroc ».
//
// Usage : node scripts/carte/calculer-emprise.mjs <ne_10m_admin_0_countries_mar.geojson>
//   Le fichier vient de https://github.com/nvkelso/natural-earth-vector (dossier geojson/).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Marge ajoutée autour du territoire, en degrés (environ 55 km) : contexte visible et marqueurs de bord non coupés. */
const MARGE_DEGRES = 0.5;
const DECIMALES_EMPRISE = 3;

const [, , source] = process.argv;
if (!source) {
  console.error('Usage : node scripts/carte/calculer-emprise.mjs <ne_10m_admin_0_countries_mar.geojson>');
  process.exit(1);
}

const dossier = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/src/app/portail/chantier/carte');
const maroc = JSON.parse(readFileSync(source, 'utf8')).features.find((f) => f.properties.ADM0_A3 === 'MAR');
if (!maroc) {
  console.error('Entité MAR introuvable dans le fichier.');
  process.exit(1);
}

const polygones = maroc.geometry.type === 'MultiPolygon' ? maroc.geometry.coordinates : [maroc.geometry.coordinates];
const points = polygones.flatMap((polygone) => polygone.flat());
const xs = points.map(([x]) => x);
const ys = points.map(([, y]) => y);
const territoire = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

const facteur = 10 ** DECIMALES_EMPRISE;
const [ouest, sud, est, nord] = territoire;
// Arrondi vers l'extérieur : l'emprise contient toujours le territoire et sa marge.
const emprise = [
  Math.floor((ouest - MARGE_DEGRES) * facteur) / facteur,
  Math.floor((sud - MARGE_DEGRES) * facteur) / facteur,
  Math.ceil((est + MARGE_DEGRES) * facteur) / facteur,
  Math.ceil((nord + MARGE_DEGRES) * facteur) / facteur
];

writeFileSync(
  resolve(dossier, 'maroc.frontiere.json'),
  JSON.stringify({ type: 'Feature', properties: { name: 'Maroc (point de vue du Maroc)', source: 'Natural Earth 10m admin 0 countries, version MAR' }, geometry: maroc.geometry }) + '\n'
);
// Une ligne par tableau : `scripts/carte/preparer-fond-carte.sh` lit la ligne « emprise » avec sed.
writeFileSync(
  resolve(dossier, 'emprise-maroc.json'),
  `{\n  "source": "Natural Earth 10m admin 0 countries, version MAR (domaine public)",\n  "margeDegres": ${MARGE_DEGRES},\n  "territoire": ${JSON.stringify(territoire)},\n  "emprise": ${JSON.stringify(emprise)}\n}\n`
);
console.log('territoire', territoire.join(', '));
console.log('emprise   ', emprise.join(', '));
