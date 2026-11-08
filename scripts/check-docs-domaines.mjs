// Contrôle doc ↔ code des domaines : chaque permission d'un routeur FastAPI et chaque outil MCP de l'API doit figurer dans la
// documentation de son domaine (page du domaine, droits ou contrats sur le site). Une permission ou un outil ajouté sans documentation
// fait échouer le contrôle, pour que pages de domaine et guides agent restent la source de lecture fiable (AGENTS.md, « synchronisés »).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const racine = resolve(process.argv[2] ?? '.');
const source = join(racine, 'api/src/staport/domains');
const docs = join(racine, 'site/docs/domaines');

// Dossier du domaine Python → dossier de documentation.
const domaines = {
  equipe: 'equipe',
  function: 'function',
  chantier: 'chantier',
  employee: 'employee',
  paie: 'paie',
  heuresupp: 'heures-supp',
  audit: 'audit',
  parametre: 'parametre',
  auth: 'auth',
  accueil: 'accueil'
};

// Préfixe d'un outil MCP → domaine documenté.
const prefixesOutils = [
  ['chantier_', 'chantier'],
  ['equipe_', 'equipe'],
  ['fonction_', 'function'],
  ['employe', 'employee'],
  ['paie_', 'paie'],
  ['heures_supp_', 'heures-supp'],
  ['rapport_', 'paie'],
  ['audit_', 'audit'],
  ['parametres_', 'parametre'],
  ['roles_', 'auth'],
  ['systeme_', 'auth'],
  ['accueil_', 'accueil']
];

function fichiers(dossier, filtre) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin, filtre) : filtre(chemin) ? [chemin] : [];
  });
}

function lire(chemin) {
  return existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
}

function documentation(domaine) {
  return lire(join(docs, domaine, 'index.md')) + lire(join(docs, domaine, 'droits.md')) + lire(join(docs, domaine, 'contrats.md'));
}

const manques = [];

for (const [dossier, doc] of Object.entries(domaines)) {
  const texte = documentation(doc);
  const routeurs = fichiers(join(source, dossier), (f) => /router\.py$/.test(f));
  const permissions = new Set();
  for (const f of routeurs) {
    for (const m of lire(f).matchAll(/exiger\(([^)]*)\)/g)) {
      for (const p of m[1].matchAll(/"([A-Z][A-Z_]+)"/g)) permissions.add(p[1]);
    }
  }
  for (const permission of permissions) {
    if (!texte.includes(permission)) manques.push(`permission ${permission} (api/${dossier}) absente de site/docs/domaines/${doc}`);
  }
}

for (const f of fichiers(join(source, 'mcp'), (chemin) => chemin.endsWith('.py'))) {
  for (const m of lire(f).matchAll(/\.tool\([^)]*?name="([a-z_]+)"/gs)) {
    const nom = m[1];
    const domaine = prefixesOutils.find(([prefixe]) => nom.startsWith(prefixe))?.[1];
    if (!domaine) {
      manques.push(`outil MCP ${nom} : préfixe sans domaine documenté (scripts/check-docs-domaines.mjs)`);
    } else if (!documentation(domaine).includes(nom)) {
      manques.push(`outil MCP ${nom} absent de site/docs/domaines/${domaine}`);
    }
  }
}

if (manques.length) {
  console.error(`Documentation en retard sur le code (${manques.length}) :\n- ${manques.join('\n- ')}`);
  process.exit(1);
}
console.log('Documentation des domaines : permissions et outils MCP tous documentés.');
