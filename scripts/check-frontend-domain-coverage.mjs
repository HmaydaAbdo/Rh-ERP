import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPath = resolve(process.argv[2] ?? 'frontend/coverage/frontend/lcov.info');
const lcov = readFileSync(reportPath, 'utf8');
const domains = [
  {
    name: 'parametre',
    matches: (path) => path.startsWith('src/app/portail/admin/parametres/')
  },
  {
    name: 'auth-admin',
    matches: (path) => path.startsWith('src/app/core/auth/')
      || path === 'src/app/portail/admin.routes.ts'
      || (path.startsWith('src/app/portail/admin/') && !path.startsWith('src/app/portail/admin/parametres/'))
  },
  ...['employee', 'function', 'chantier', 'equipe', 'paie', 'audit'].map((domain) => ({
    name: domain,
    matches: (path) => path.startsWith(`src/app/portail/${domain}/`)
  })),
  {
    name: 'shared',
    matches: (path) => path.startsWith('src/app/shared/')
  },
  {
    name: 'foundation',
    matches: (path) => path.startsWith('src/app/core/') || /^src\/app\/[^/]+\.ts$/.test(path)
  }
];

const totals = new Map(domains.map(({ name }) => [name, { linesHit: 0, linesFound: 0, branchesHit: 0, branchesFound: 0 }]));
const failures = [];
const unassigned = [];

for (const record of lcov.split('end_of_record')) {
  const source = record.match(/^SF:(.+)$/m)?.[1];
  if (!source) continue;

  const normalized = source.replaceAll('\\', '/');
  const appSourceIndex = normalized.lastIndexOf('src/app/');
  if (appSourceIndex < 0) continue;
  const path = normalized.slice(appSourceIndex);
  const domain = domains.find(({ matches }) => matches(path));
  if (!domain) {
    unassigned.push(path);
    continue;
  }

  const entry = totals.get(domain.name);
  for (const [counter, key] of [['LF', 'linesFound'], ['LH', 'linesHit'], ['BRF', 'branchesFound'], ['BRH', 'branchesHit']]) {
    const value = Number(record.match(new RegExp(`^${counter}:(\\d+)$`, 'm'))?.[1] ?? 0);
    entry[key] += value;
  }
}

if (unassigned.length) {
  console.error(`Frontend coverage files are not mapped to a domain: ${[...new Set(unassigned)].join(', ')}`);
  process.exit(1);
}

for (const { name } of domains) {
  const { linesHit, linesFound, branchesHit, branchesFound } = totals.get(name);
  if (linesFound === 0) {
    failures.push(`${name} (no source files in the LCOV report)`);
    console.log(`${name}: no source files in the LCOV report`);
    continue;
  }

  const linePct = (linesHit * 100) / linesFound;
  const branchPct = branchesFound === 0 ? null : (branchesHit * 100) / branchesFound;
  const branchDisplay = branchPct === null ? 'n/a (no branches)' : `${branchPct.toFixed(1)}%`;
  console.log(`${name}: lines ${linePct.toFixed(1)}% (min 70%), branches ${branchDisplay} (min 50%)`);

  if (linePct < 70 || (branchPct !== null && branchPct < 50)) {
    failures.push(name);
  }
}

if (failures.length) {
  console.error(`Frontend domain coverage gate failed: ${failures.join(', ')}`);
  process.exit(1);
}
