// Contrôle des contrastes des jetons de design (charte « standard de la catégorie », conventions/design-system.md).
// Compile frontend/src/styles/_tokens.scss, résout les jetons des thèmes clair et sombre, mesure chaque couple texte / surface
// et bordure / surface selon la formule de contraste de WCAG 2.2 (luminance relative, critère 1.4.3), puis écrit le rapport
// docs/frontend/contraste-jetons.md. Échoue (code 1) si un couple requis passe sous son seuil ou si un jeton de l'ancienne
// identité (échelle de marque, cuivre, Graphite) subsiste dans frontend/src. Les couples « informatifs » (palette des
// graphiques) sont signalés sans faire échouer le contrôle : les graphiques sont repris en E0.4.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const racine = resolve(process.argv[2] ?? '.');
const frontend = join(racine, 'frontend');
const require = createRequire(join(frontend, 'package.json'));
const sass = require('sass');

// ---- Résolution des jetons ----
const css = sass.compile(join(frontend, 'src/styles/_tokens.scss'), { loadPaths: [join(frontend, 'src/styles')] }).css;

function proprietes(selecteur) {
  const debut = css.indexOf(`${selecteur} {`);
  if (debut < 0) throw new Error(`Bloc introuvable : ${selecteur}`);
  const fin = css.indexOf('\n}', debut);
  const jetons = {};
  for (const m of css.slice(debut, fin).matchAll(/^\s*--([\w-]+):\s*(.+?);\s*$/gm)) jetons[m[1]] = m[2];
  return jetons;
}

const clair = proprietes(':root');
const sombre = { ...clair, ...proprietes(":root[data-theme=dark]") };

function valeur(jetons, nom, profondeur = 0) {
  let v = jetons[nom];
  if (v === undefined || profondeur > 8) throw new Error(`Jeton non résolu : --${nom}`);
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return valeur(jetons, ref[1], profondeur + 1);
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${nom} n'est pas un hexadécimal (${v}) : jeton non mesurable`);
  return v.toLowerCase();
}

// ---- Contraste WCAG 2.2 ----
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---- Couples à mesurer : [libellé, premier plan, arrière-plan, seuil, requis] ----
const TEXTE = 7; // texte courant (AAA)
const SECOND = 4.5; // texte secondaire, libellés de boutons, liens (AA)
const COMPOSANT = 3; // bordure franche, anneau de focus, composant d'interface (WCAG 1.4.11)
const LIGNE = 2.18; // séparateur de ligne de tableau (charte)

const surfaces = ['canvas', 'surface', 'surface-alt', 'surface-sunken', 'surface-hover'];
const couples = [];
for (const s of surfaces) {
  couples.push([`Texte sur ${s}`, 'color-text', `color-${s}`, TEXTE, true]);
  couples.push([`Texte secondaire sur ${s}`, 'color-text-muted', `color-${s}`, SECOND, true]);
}
couples.push(
  ['Lien sur surface', 'color-link', 'color-surface', SECOND, true],
  ['Lien sur fond de page', 'color-link', 'color-canvas', SECOND, true],
  ['Texte fort sur action douce', 'color-primary-strong', 'color-primary-soft', TEXTE, true],
  ['Libellé de bouton principal', 'color-primary-contrast', 'color-primary', SECOND, true],
  ['Libellé de bouton principal au survol', 'color-primary-contrast', 'color-primary-hover', SECOND, true],
  ['Action sur surface', 'color-primary', 'color-surface', COMPOSANT, true],
  ['Action sur fond de page', 'color-primary', 'color-canvas', COMPOSANT, true],
  ['Libellé du bouton de suppression', 'color-danger-contrast', 'color-danger', SECOND, true],
  ['Anneau de focus sur surface', 'color-focus', 'color-surface', COMPOSANT, true],
  ['Anneau de focus sur fond de page', 'color-focus', 'color-canvas', COMPOSANT, true],
  ['Bordure franche sur surface', 'color-border-strong', 'color-surface', COMPOSANT, true],
  ['Bordure franche sur fond de page', 'color-border-strong', 'color-canvas', COMPOSANT, true],
  ['Bordure de ligne sur surface', 'color-border', 'color-surface', LIGNE, true],
  ['Bordure de ligne sur fond de page (informatif)', 'color-border', 'color-canvas', LIGNE, false],
  ['Carte : texte', 'map-ui-text', 'map-ui-surface', TEXTE, true],
  ['Carte : texte secondaire', 'map-ui-text-muted', 'map-ui-surface', SECOND, true],
  ['Carte : icône', 'map-ui-icon', 'map-ui-surface', COMPOSANT, true],
  ['Carte : bordure', 'map-ui-border', 'map-ui-surface', LIGNE, true],
  ['Carte : infobulle', 'map-tooltip-text', 'map-tooltip-surface', TEXTE, true]
);
for (const statut of ['success', 'warning', 'danger', 'info']) {
  couples.push([`Statut ${statut} sur son fond teinté`, `color-${statut}`, `color-${statut}-bg`, TEXTE, true]);
  couples.push([`Statut ${statut} sur surface`, `color-${statut}`, 'color-surface', TEXTE, true]);
}
for (let i = 1; i <= 8; i++) couples.push([`Graphique : série ${i} sur surface (informatif)`, `chart-${i}`, 'color-surface', COMPOSANT, false]);

// ---- Mesure ----
const arrondi = (n) => Math.round(n * 100) / 100;
const resultats = { clair: [], sombre: [] };
let echecs = 0;
let avertissements = 0;
for (const [theme, jetons] of [['clair', clair], ['sombre', sombre]]) {
  for (const [libelle, fg, bg, seuil, requis] of couples) {
    const [a, b] = [valeur(jetons, fg), valeur(jetons, bg)];
    const ratio = arrondi(contraste(a, b));
    const ok = ratio >= seuil;
    if (!ok && requis) echecs++;
    if (!ok && !requis) avertissements++;
    resultats[theme].push({ libelle, fg: `--${fg}`, bg: `--${bg}`, a, b, ratio, seuil, ok, requis });
  }
}

// ---- Ancienne identité ----
const interdits = [
  [/--brand-\d|--brand-copper|--color-brand-accent/, 'échelle de marque ou cuivre'],
  [/--neutral-\d|--primary-\d/, 'ancienne échelle de neutres ou de bleus'],
  [/#c88e5c|#d9ae82|#168dff|#68aaff|#0d0d0d|#151515|#2b2b2b|#084478|#052a49/i, 'valeur de l\'ancienne identité (cuivre, Graphite, bleu de marque)'],
  [/IBM Plex/i, 'ancienne police']
];
const trouves = [];
function parcourir(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) parcourir(chemin);
    else if (/\.(scss|css|ts|html)$/.test(nom)) {
      readFileSync(chemin, 'utf8').split(/\r?\n/).forEach((ligne, i) => {
        for (const [motif, nature] of interdits) if (motif.test(ligne)) trouves.push(`${chemin.replace(racine, '').replace(/\\/g, '/')}:${i + 1} — ${nature}`);
      });
    }
  }
}
parcourir(join(frontend, 'src'));

// ---- Rapport ----
const ligne = (r) =>
  `| ${r.libelle} | \`${r.fg}\` ${r.a} | \`${r.bg}\` ${r.b} | ${r.ratio.toFixed(2).replace('.', ',')}:1 | ${String(r.seuil).replace('.', ',')}:1 | ${r.ok ? 'OK' : r.requis ? '**ÉCHEC**' : 'sous le seuil, informatif'} |`;
let md = `# Contrastes des jetons de design\n\n` +
  `Rapport généré par \`npm run check:contraste\` (script \`scripts/check-contraste-jetons.mjs\`) à partir de \`frontend/src/styles/_tokens.scss\`. ` +
  `Formule de contraste de WCAG 2.2 (critère 1.4.3). Seuils : texte courant 7:1 (AAA), texte secondaire, libellés de boutons et liens 4,5:1 (AA), ` +
  `bordures franches, anneau de focus, composants et éléments graphiques 3:1 (1.4.11), séparateur de ligne de tableau 2,18:1 (charte). ` +
  `Les couples marqués « informatif » ne bloquent pas le contrôle.\n\n`;
for (const [theme, titre] of [['clair', 'Thème clair'], ['sombre', 'Thème sombre']]) {
  md += `## ${titre}\n\n| Couple | Premier plan | Arrière-plan | Contraste | Seuil | Résultat |\n|---|---|---|---|---|---|\n${resultats[theme].map(ligne).join('\n')}\n\n`;
}
md += `## Bilan\n\n- Couples requis en échec : ${echecs}\n- Couples informatifs sous le seuil : ${avertissements}\n- Jetons de l'ancienne identité restants dans \`frontend/src\` : ${trouves.length}\n`;
const sortie = join(racine, 'docs/frontend/contraste-jetons.md');
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, md);

for (const t of trouves) console.error(`Ancienne identité : ${t}`);
for (const [theme, liste] of Object.entries(resultats)) for (const r of liste) if (!r.ok && r.requis) console.error(`ÉCHEC (${theme}) ${r.libelle} : ${r.ratio}:1 < ${r.seuil}:1`);
console.log(`Contraste : ${echecs} échec(s) requis, ${avertissements} avertissement(s) informatif(s), ${trouves.length} jeton(s) de l'ancienne identité. Rapport : docs/frontend/contraste-jetons.md`);
process.exit(echecs > 0 || trouves.length > 0 ? 1 : 0);
