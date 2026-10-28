// Contrôle doc ↔ code des domaines : chaque permission d'un contrôleur et chaque outil MCP du backend doit figurer dans la
// documentation de son domaine (README du domaine ou catalogue RBAC). Une permission ou un outil ajouté sans documentation
// fait échouer le contrôle, pour que README et skills restent la source de lecture fiable (AGENTS.md, « synchronisés »).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const racine = resolve(process.argv[2] ?? '.');
const source = join(racine, 'backend/src/main/java/staport/rh');
const docs = join(racine, 'docs');

// Dossier du backend → dossier de documentation.
const domaines = {
  equipe: 'equipe',
  function: 'function',
  chantier: 'chantier',
  employee: 'employee',
  paie: 'paie',
  heuresupp: 'heures-supp',
  audit: 'audit',
  parametre: 'parametre',
  auth: 'auth'
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
  ['systeme_', 'auth']
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
  return lire(join(docs, domaine, 'README.md')) + lire(join(docs, 'rbac', `${domaine}.md`)) + lire(join(docs, domaine, 'contrats.md'));
}

const manques = [];

for (const [dossier, doc] of Object.entries(domaines)) {
  const texte = documentation(doc);
  const controleurs = fichiers(join(source, dossier), (f) => /Controller\.java$/.test(f));
  const permissions = new Set();
  for (const f of controleurs) {
    for (const m of lire(f).matchAll(/has(?:Any)?Authority\(([^)]*)\)/g)) {
      for (const p of m[1].matchAll(/'([A-Z][A-Z_]+)'/g)) permissions.add(p[1]);
    }
  }
  for (const permission of permissions) {
    if (!texte.includes(permission)) manques.push(`permission ${permission} (backend/${dossier}) absente de docs/${doc}`);
  }
}

for (const f of fichiers(join(source, 'mcp/outils'), (chemin) => chemin.endsWith('.java'))) {
  for (const m of lire(f).matchAll(/@McpTool\(name = "([a-z_]+)"/g)) {
    const nom = m[1];
    const domaine = prefixesOutils.find(([prefixe]) => nom.startsWith(prefixe))?.[1];
    if (!domaine) {
      manques.push(`outil MCP ${nom} : préfixe sans domaine documenté (scripts/check-docs-domaines.mjs)`);
    } else if (!documentation(domaine).includes(nom)) {
      manques.push(`outil MCP ${nom} absent de docs/${domaine}`);
    }
  }
}

if (manques.length) {
  console.error(`Documentation en retard sur le code (${manques.length}) :\n- ${manques.join('\n- ')}`);
  process.exit(1);
}
console.log('Documentation des domaines : permissions et outils MCP tous documentés.');
