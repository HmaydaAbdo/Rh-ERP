import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPath = resolve(process.argv[2] ?? 'backend/target/site/jacoco/jacoco.xml');
const xml = readFileSync(reportPath, 'utf8');
const domains = {
  auth: { prefix: 'staport/rh/auth/', line: 70, branch: 50 },
  employee: { prefix: 'staport/rh/employee/', line: 70, branch: 50 },
  function: { prefix: 'staport/rh/function/', line: 70, branch: 50 },
  chantier: { prefix: 'staport/rh/chantier/', line: 70, branch: 25 },
  equipe: { prefix: 'staport/rh/equipe/', line: 70, branch: 25 },
  paie: { prefix: 'staport/rh/paie/', line: 70, branch: 70 },
  'heures-supp': { prefix: 'staport/rh/heuresupp/', line: 70, branch: 50 },
  parametre: { prefix: 'staport/rh/parametre/', line: 70, branch: 70 },
  audit: { prefix: 'staport/rh/audit/', line: 70, branch: 60 },
  mcp: { prefix: 'staport/rh/mcp/', line: 70, branch: 50 }
};

const packages = [...xml.matchAll(/<package name="([^"]+)"[\s\S]*?<\/package>/g)].map((match) => match[0]);
const total = (block, type, field) => [...block.matchAll(new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"\\s*/>`, 'g'))]
  .reduce((sum, [, missed, covered]) => sum + (field === 'covered' ? Number(covered) : Number(missed) + Number(covered)), 0);
const covered = (blocks, type) => blocks.reduce((sum, block) => sum + total(block, type, 'covered'), 0);
const all = (blocks, type) => blocks.reduce((sum, block) => sum + total(block, type, 'all'), 0);

const failures = [];
for (const [domain, threshold] of Object.entries(domains)) {
  const blocks = packages.filter((block) => block.includes(`name="${threshold.prefix}`));
  const linesCovered = covered(blocks, 'LINE');
  const linesTotal = all(blocks, 'LINE');
  const branchesCovered = covered(blocks, 'BRANCH');
  const branchesTotal = all(blocks, 'BRANCH');
  const linePct = linesTotal ? (linesCovered * 100) / linesTotal : 0;
  const branchPct = branchesTotal ? (branchesCovered * 100) / branchesTotal : 0;
  console.log(`${domain}: lines ${linePct.toFixed(1)}% (min ${threshold.line}%), branches ${branchPct.toFixed(1)}% (min ${threshold.branch}%)`);
  if (linePct < threshold.line || branchPct < threshold.branch) {
    failures.push(domain);
  }
}
if (failures.length) {
  console.error(`Domain coverage gate failed: ${failures.join(', ')}`);
  process.exit(1);
}
