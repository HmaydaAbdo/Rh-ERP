#!/usr/bin/env node
// Contrôle E0.8 : aucune position ni marge gauche/droite en dur dans le code d'interface.
// Les propriétés logiques (`margin-inline-start`, `inset-inline-end`, `text-align: start`, `ms-*`, `text-end`…) suivent la
// direction du document : l'arabe (de droite à gauche) pourra être livré sans toucher aux feuilles de style.
// Usage : node scripts/check-proprietes-logiques.mjs [racine]  — code de sortie 1 s'il reste une propriété physique.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const racine = process.argv[2] ?? '.';
const dossier = join(racine, 'frontend', 'src');

// Propriétés CSS physiques (écrites en CSS, SCSS, gabarits ou styles en ligne de composants)
const CSS = [
  /(?:^|[\s;{"'`])(?:margin|padding|border)-(?:left|right)\b/,
  /(?:^|[\s;{"'`])(?:border-(?:top|bottom)-(?:left|right)-radius)\b/,
  /(?:^|[\s;{"'`])(?:left|right)\s*:\s*(?!\s*\{)/,
  /text-align\s*:\s*(?:left|right)\b/,
  /float\s*:\s*(?:left|right)\b/,
  /(?:^|[\s;{"'`])(?:scroll-)?(?:margin|padding)-(?:left|right)\b/
];
// Classes utilitaires physiques (Tailwind ou maison) dans les gabarits et les définitions de colonnes
const CLASSES = [/(?<![\w-])(?:ml|mr|pl|pr)-(?:\d|auto|px)/, /(?<![\w-])text-(?:left|right)(?![\w-])/, /(?<![\w-])(?:left|right)-(?:\d|auto|full|px)/, /(?<![\w-])(?:float|rounded-[lr]|border-[lr])-/];

function fichiers(rep) {
  const sortie = [];
  for (const nom of readdirSync(rep)) {
    const chemin = join(rep, nom);
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiers(chemin));
    } else if (/\.(scss|css|html|ts)$/.test(nom) && !/\.spec\.ts$/.test(nom)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

const infractions = [];
for (const fichier of fichiers(dossier)) {
  const estTs = fichier.endsWith('.ts');
  const lignes = readFileSync(fichier, 'utf8').split(/\r?\n/);
  lignes.forEach((ligne, i) => {
    const texte = ligne.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    // Dans le TypeScript, seuls le CSS en ligne et les classes de colonnes comptent : les API de bibliothèques (Chart.js, MapLibre)
    // exposent des options `left`/`right` qui ne sont pas du CSS.
    const css = estTs ? CSS.filter((re) => !/left\|right\)\\s\*:/.test(re.source) && !re.source.startsWith('(?:^|[\\s;{"\'`])(?:left|right)')) : CSS;
    if (css.some((re) => re.test(texte)) || CLASSES.some((re) => re.test(texte))) {
      infractions.push(`${relative(racine, fichier)}:${i + 1}: ${ligne.trim()}`);
    }
  });
}

if (infractions.length > 0) {
  console.error(`Propriétés physiques gauche/droite : ${infractions.length}\n${infractions.join('\n')}`);
  process.exit(1);
}
console.log('Propriétés logiques : aucune propriété physique gauche/droite.');
