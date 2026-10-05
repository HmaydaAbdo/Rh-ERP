// Génère `src/styles/primeng-theme.css` à partir du thème Aura de PrimeNG, en remplaçant chaque couleur écrite en dur par
// une variable des jetons (`--pn-surface-*`, `--pn-primary-*`, définies dans `src/styles/_tokens.scss`). Le thème obtenu ne
// connaît plus aucun bleu ni gris : le bleu Staport et le thème sombre viennent uniquement des jetons.
//
//   npm run theme:generate        (à relancer après une mise à jour de PrimeNG, puis commiter le fichier généré)
//
// Les couleurs de statut (vert, rouge, orange, jaune, cyan, violet) sont conservées telles quelles : elles ne sont pas de la marque.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(racine, 'node_modules/primeng/resources/themes/aura-light-blue/theme.css');
const sortie = resolve(racine, 'src/styles/primeng-theme.css');

/** Échelle neutre d'Aura (slate) : la teinte de chaque rôle (fond, bordure, texte…) est choisie par nos jetons. */
const NEUTRES = {
  '#ffffff': 0,
  '#f8fafc': 50,
  '#f1f5f9': 100,
  '#e2e8f0': 200,
  '#cbd5e1': 300,
  '#94a3b8': 400,
  '#64748b': 500,
  '#475569': 600,
  '#334155': 700,
  '#1e293b': 800,
  '#0f172a': 900,
  '#020617': 950
};

/** Échelle primaire d'Aura (bleu) : Tailwind et la palette propre d'Aura, rangées par niveau. */
const PRIMAIRES = {
  '#eff6ff': 50,
  '#f5f9ff': 50,
  '#dbeafe': 100,
  '#d0e1fd': 100,
  '#bfdbfe': 200,
  '#bedaff': 200,
  '#abc9fb': 200,
  '#93c5fd': 300,
  '#85b2f9': 300,
  '#60a5fa': 400,
  '#609af8': 400,
  '#3b82f6': 500,
  '#2563eb': 600,
  '#326fd1': 600,
  '#1d4ed8': 700,
  '#295bac': 700,
  '#1e40af': 800,
  '#204887': 800,
  '#1e3a8a': 900,
  '#183462': 900,
  '#172554': 950
};

const variable = (hex) => {
  const cle = hex.toLowerCase();
  if (cle in NEUTRES) return `var(--pn-surface-${NEUTRES[cle]})`;
  if (cle in PRIMAIRES) return `var(--pn-primary-${PRIMAIRES[cle]})`;
  return hex;
};

/** `rgba(r, g, b, a)` d'une couleur de l'échelle : devient un mélange avec la variable, pour suivre le thème. */
const RGBA = new Map([
  ['59, 130, 246', 'var(--pn-primary-500)'],
  ['239, 246, 255', 'var(--pn-primary-50)'],
  ['2, 6, 23', 'var(--pn-surface-950)'],
  ['241, 245, 249', 'var(--pn-surface-100)'],
  ['226, 232, 240', 'var(--pn-surface-200)'],
  ['74, 85, 103', 'var(--pn-surface-600)'],
  ['18, 18, 23', 'var(--pn-surface-950)']
]);

let css = readFileSync(source, 'utf8');

// La police vient de nos jetons (IBM Plex, embarquée) : on retire l'Inter d'Aura et ses fichiers.
css = css.replace(/@font-face\s*\{[^}]*\}\s*/g, '');
css = css.replace(/^\s*font-family: "Inter var", sans-serif;\n/m, '');
css = css.replace(/^\s*font-feature-settings: [^;]*;\n/gm, '');
css = css.replace(/^\s*font-variation-settings: normal;\n/m, '');
css = css.replace(/--font-family: "Inter var", sans-serif;/, '--font-family: var(--font-sans);');
// Le schéma de couleur (formulaires, barres de défilement) est posé par les jetons, clair ou sombre.
css = css.replace(/^\s*color-scheme: light;\n/m, '');

css = css.replace(/#[0-9a-fA-F]{6}\b/g, variable);
css = css.replace(/rgba\((\d+, \d+, \d+), ([\d.]+)\)/g, (tout, canal, alpha) => {
  const couleur = RGBA.get(canal);
  return couleur ? `color-mix(in srgb, ${couleur} ${Math.round(parseFloat(alpha) * 100)}%, transparent)` : tout;
});

const entete = `/* GÉNÉRÉ par scripts/generate-primeng-theme.mjs (npm run theme:generate) à partir du thème Aura de PrimeNG — ne pas modifier à la main.
 * Les couleurs de marque et de surface sont des variables des jetons (src/styles/_tokens.scss). */\n`;
writeFileSync(sortie, entete + css);
console.log(`${sortie} écrit (${css.length} octets)`);
