// Contrôle « zéro composant visuel hors shared/ui/ » (E0.2, conventions/design-system.md).
// Un composant est en infraction lorsqu'il se trouve hors de `frontend/src/app/shared/ui/` et soit porte ses propres styles
// (`styleUrl`, `styleUrls` ou `styles` non vides), soit vit dans un dossier partagé autre que `shared/ui/` (`shared/components`,
// `shared/feedback`). Les écrans composés uniquement de composants partagés et de classes globales (`app-page`, `app-toolbar`…)
// ne sont pas des infractions.
//
// Mode cliquet : `scripts/composants-hors-ui.baseline.json` liste les infractions héritées de la refonte. Le contrôle échoue si
// une infraction nouvelle apparaît, ou si une infraction de la liste a disparu sans avoir été retirée de la liste (la liste ne
// fait que diminuer). Elle doit être vide à la fin d'E0.7. `--ecrire-baseline` la régénère.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const racine = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const app = join(racine, 'frontend/src/app');
const fichierBase = join(racine, 'scripts/composants-hors-ui.baseline.json');
const ecrireBase = process.argv.includes('--ecrire-baseline');

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.ts$/.test(nom) && !/\.spec\.ts$/.test(nom) ? [chemin] : [];
  });
}

const lignes = (texte) => texte.split(/\r?\n/).filter((l) => l.trim() !== '').length;

const infractions = {};
let composants = 0;
for (const chemin of fichiers(app)) {
  const source = readFileSync(chemin, 'utf8');
  if (!source.includes('@Component(')) continue;
  composants++;
  const rel = relative(app, chemin).replace(/\\/g, '/');
  if (rel.startsWith('shared/ui/')) continue;

  let styles = 0;
  const url = source.match(/styleUrls?:\s*\[?\s*'([^']+)'/);
  if (url) {
    const fichierStyle = join(dirname(chemin), url[1]);
    if (existsSync(fichierStyle)) styles = lignes(readFileSync(fichierStyle, 'utf8'));
  }
  const enLigne = source.match(/styles:\s*\[?\s*`([\s\S]*?)`/);
  if (enLigne) styles = Math.max(styles, lignes(enLigne[1]));

  const motifs = [];
  if (styles > 0) motifs.push(`styles propres (${styles} lignes)`);
  if (/^shared\/(components|feedback)\//.test(rel)) motifs.push('dossier partagé hors shared/ui');
  if (motifs.length) infractions[rel] = motifs.join(' ; ');
}

const base = existsSync(fichierBase) ? JSON.parse(readFileSync(fichierBase, 'utf8')) : {};
const nouvelles = Object.keys(infractions).filter((f) => !(f in base));
const levees = Object.keys(base).filter((f) => !(f in infractions));

if (ecrireBase) {
  writeFileSync(fichierBase, JSON.stringify(Object.fromEntries(Object.entries(infractions).sort()), null, 2) + '\n');
  console.log(`Liste régénérée : ${Object.keys(infractions).length} infraction(s) sur ${composants} composants.`);
  process.exit(0);
}

for (const f of nouvelles) console.error(`Infraction nouvelle : ${f} — ${infractions[f]}`);
for (const f of levees) console.error(`Infraction levée mais encore listée : retirer ${f} de scripts/composants-hors-ui.baseline.json (npm run check:composants -- --ecrire-baseline).`);
console.log(`Composants : ${composants} ; infractions : ${Object.keys(infractions).length} (liste héritée : ${Object.keys(base).length}).`);
process.exit(nouvelles.length || levees.length ? 1 : 0);
