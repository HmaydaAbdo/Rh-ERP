#!/usr/bin/env node
// Contrôle E0.7 : l'espacement entre les sections d'un écran appartient au kit de page (`styles/_page.scss`, `--space-lg`), jamais
// aux gabarits des domaines. Un gabarit sous `portail/` ne pose donc aucune marge utilitaire (`mt-4`, `mb-2`, `my-3`, `space-y-4`…) ni
// style de marge en ligne : il compose des sections (`app-page`, `app-stack`, `app-section`) et laisse le kit les séparer.
// Usage : node scripts/check-espacement.mjs [racine]  — code de sortie 1 s'il reste une marge de ce genre.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const racine = process.argv[2] ?? '.';
const dossier = join(racine, 'frontend', 'src', 'app', 'portail');

// Les marges verticales (`mt`, `mb`, `my`, `m-N`, `space-y`) séparent des sections ; `m-0` (remise à zéro) et les marges en ligne (`ms`, `me`, `mx`) ne les touchent pas.
const MARGE_UTILITAIRE = /(?<![\w-])(?:-?m[tby]?-(?!0(?![\w-]))(?:\d+|px|auto)|space-y-(?:\d+|px))(?![\w-])/;
const MARGE_EN_LIGNE = /style="[^"]*\bmargin(?:-[a-z]+)?\s*:/;

function fichiers(rep) {
  const sortie = [];
  for (const nom of readdirSync(rep)) {
    const chemin = join(rep, nom);
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiers(chemin));
    } else if (/\.(html|ts)$/.test(nom) && !/\.spec\.ts$/.test(nom)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

const infractions = [];
for (const fichier of fichiers(dossier)) {
  readFileSync(fichier, 'utf8')
    .split(/\r?\n/)
    .forEach((ligne, i) => {
      // Seuls les attributs `class="…"` et `style="…"` comptent : le TypeScript et les textes ne sont pas des gabarits.
      const classes = [...ligne.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
      if (classes.some((c) => MARGE_UTILITAIRE.test(c)) || MARGE_EN_LIGNE.test(ligne)) {
        infractions.push(`${relative(racine, fichier)}:${i + 1}: ${ligne.trim()}`);
      }
    });
}

if (infractions.length > 0) {
  console.error(`Marges de section dans les gabarits des domaines : ${infractions.length}\n${infractions.join('\n')}`);
  process.exit(1);
}
console.log('Espacement : aucune marge de section dans les gabarits des domaines.');
