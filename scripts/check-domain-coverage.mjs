import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Seuil de couverture par domaine (lignes et branches). Deux formats lus :
// - rapport JSON de coverage.py (`pytest --cov --cov-branch --cov-report=json`) : l'API FastAPI, `api/src/staport/domains/<domaine>/` ;
// - rapport XML JaCoCo : le backend Spring, retiré à la phase finale de la migration (avec cette branche du script).
const reportPath = resolve(process.argv[2] ?? 'api/coverage.json');
const contenu = readFileSync(reportPath, 'utf8');
const domains = {
  auth: { java: 'staport/rh/auth/', python: 'auth', line: 70, branch: 50 },
  employee: { java: 'staport/rh/employee/', python: 'employee', line: 70, branch: 50 },
  function: { java: 'staport/rh/function/', python: 'function', line: 70, branch: 50 },
  chantier: { java: 'staport/rh/chantier/', python: 'chantier', line: 70, branch: 25 },
  equipe: { java: 'staport/rh/equipe/', python: 'equipe', line: 70, branch: 25 },
  paie: { java: 'staport/rh/paie/', python: 'paie', line: 70, branch: 70 },
  'heures-supp': { java: 'staport/rh/heuresupp/', python: 'heuresupp', line: 70, branch: 50 },
  parametre: { java: 'staport/rh/parametre/', python: 'parametre', line: 70, branch: 70 },
  audit: { java: 'staport/rh/audit/', python: 'audit', line: 70, branch: 60 },
  mcp: { java: 'staport/rh/mcp/', python: 'mcp', line: 70, branch: 50 }
};

/** Couverture d'un domaine : { lines: [couvertes, total], branches: [couvertes, total] }. */
function mesurerPython() {
  const fichiers = Object.entries(JSON.parse(contenu).files);
  return (domaine) => {
    const mesure = { lines: [0, 0], branches: [0, 0] };
    for (const [chemin, { summary }] of fichiers) {
      if (!chemin.replaceAll('\\', '/').includes(`staport/domains/${domaine.python}/`)) continue;
      mesure.lines[0] += summary.covered_lines;
      mesure.lines[1] += summary.num_statements;
      mesure.branches[0] += summary.covered_branches ?? 0;
      mesure.branches[1] += summary.num_branches ?? 0;
    }
    return mesure;
  };
}

function mesurerJacoco() {
  const packages = [...contenu.matchAll(/<package name="([^"]+)"[\s\S]*?<\/package>/g)].map((match) => match[0]);
  const somme = (blocks, type, couvert) =>
    blocks.reduce(
      (sum, block) =>
        sum +
        [...block.matchAll(new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"\\s*/>`, 'g'))].reduce(
          (s, [, missed, covered]) => s + (couvert ? Number(covered) : Number(missed) + Number(covered)),
          0
        ),
      0
    );
  return (domaine) => {
    const blocks = packages.filter((block) => block.includes(`name="${domaine.java}`));
    return {
      lines: [somme(blocks, 'LINE', true), somme(blocks, 'LINE', false)],
      branches: [somme(blocks, 'BRANCH', true), somme(blocks, 'BRANCH', false)]
    };
  };
}

const mesurer = reportPath.endsWith('.json') ? mesurerPython() : mesurerJacoco();
const pourcentage = ([couvert, total]) => (total ? (couvert * 100) / total : 0);

const failures = [];
for (const [domain, threshold] of Object.entries(domains)) {
  const { lines, branches } = mesurer(threshold);
  const linePct = pourcentage(lines);
  // Un domaine sans branche (aucun `if`) est entièrement couvert en branches.
  const branchPct = branches[1] ? pourcentage(branches) : 100;
  console.log(`${domain}: lines ${linePct.toFixed(1)}% (min ${threshold.line}%), branches ${branchPct.toFixed(1)}% (min ${threshold.branch}%)`);
  if (lines[1] === 0 || linePct < threshold.line || branchPct < threshold.branch) {
    failures.push(domain);
  }
}
if (failures.length) {
  console.error(`Domain coverage gate failed: ${failures.join(', ')}`);
  process.exit(1);
}
