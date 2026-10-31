// Veille de versions des composants IA (plan de travail IA, E0.2, couche 1) : compare les versions verrouillées
// (ia/uv.lock, frontend/package-lock.json, copilot-runtime/package-lock.json) à la dernière version stable publiée sur
// PyPI et npm, et signale les préversions plus récentes. À lancer à l'ouverture de toute tâche IA et au moins une fois par
// mois ; consigner le résultat au § 3 de docs/ia/plan-de-travail.md.
//
//   node scripts/ia/veille-versions.mjs            relevé (code de sortie 0)
//   node scripts/ia/veille-versions.mjs --strict   code de sortie 1 s'il reste un retard non expliqué
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const strict = process.argv.includes('--strict');
const racine = resolve(process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? '.');

// Retards connus et expliqués : ils n'échouent pas le mode strict. Les retirer dès que la cause disparaît.
const blocages = {
  'openai': 'LiteLLM exige openai<3.0.0 (plan, § 3 et E14)',
  '@a2ui/web_core': '@copilotkit/angular 0.6.0 épingle 0.10.4 (plan, § 3)',
  'agentevals': 'bibliothèque dormante : dernière publication le 2025-07-24 (plan, § 3)',
};

const pypi = ['langchain', 'langchain-core', 'langchain-litellm', 'langgraph', 'langgraph-checkpoint-postgres', 'langgraph-sdk',
  'deepagents', 'ag-ui-langgraph', 'ag-ui-protocol', 'copilotkit', 'mcp', 'litellm', 'openai', 'openevals', 'agentevals',
  'openinference-instrumentation-langchain', 'fastapi', 'pydantic', 'pydantic-settings', 'httpx', 'uvicorn'];
const npm = [
  ['frontend', '@copilotkit/angular'], ['frontend', '@copilotkit/core'], ['frontend', '@copilotkit/shared'],
  ['frontend', '@ag-ui/client'], ['frontend', '@ag-ui/core'], ['frontend', '@ag-ui/a2ui-middleware'],
  ['frontend', '@a2ui/web_core'], ['copilot-runtime', '@copilotkit/runtime'], ['copilot-runtime', '@copilotkit/sqlite-runner'],
];

const uvLock = readFileSync(join(racine, 'ia/uv.lock'), 'utf8');
const verrouPypi = (nom) => uvLock.match(new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\r?\\nversion = "([^"]+)"`))?.[1] ?? null;
const verrouNpm = (dossier, nom) => {
  const verrou = JSON.parse(readFileSync(join(racine, dossier, 'package-lock.json'), 'utf8'));
  const cle = Object.keys(verrou.packages).find((k) => k === `node_modules/${nom}` || k.endsWith(`/node_modules/${nom}`));
  return cle ? verrou.packages[cle].version : null;
};

const json = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.json();
};

const lignes = [];
const ajouter = (nom, verrouille, stable, prerelease, date) => {
  const retard = verrouille !== null && stable !== verrouille; // absent = composant non adopté (ex. deepagents avant E1.0)
  lignes.push({ nom, verrouille: verrouille ?? 'absent', stable, prerelease, date, retard, cause: retard ? (blocages[nom] ?? null) : null });
};

await Promise.all([
  ...pypi.map(async (nom) => {
    const d = await json(`https://pypi.org/pypi/${nom}/json`);
    const publies = Object.entries(d.releases).filter(([, f]) => f.length && !f.some((x) => x.yanked));
    const derniere = publies.map(([v, f]) => [v, f[0].upload_time]).sort((a, b) => a[1].localeCompare(b[1])).at(-1);
    const stable = d.info.version;
    ajouter(nom, verrouPypi(nom), stable, derniere && derniere[0] !== stable ? derniere[0] : '', d.releases[stable]?.[0]?.upload_time.slice(0, 10) ?? '');
  }),
  ...npm.map(async ([dossier, nom]) => {
    const d = await json(`https://registry.npmjs.org/${nom.replace('/', '%2F')}`);
    const stable = d['dist-tags'].latest;
    const pre = Object.entries(d['dist-tags']).filter(([t]) => ['next', 'beta', 'rc', 'alpha'].includes(t)).map(([t, v]) => `${t}=${v}`).join(', ');
    ajouter(nom, verrouNpm(dossier, nom), stable, pre, (d.time?.[stable] ?? '').slice(0, 10));
  }),
]);

lignes.sort((a, b) => a.nom.localeCompare(b.nom));
const largeur = (cle) => Math.max(...lignes.map((l) => String(l[cle]).length), cle.length);
const l = { nom: largeur('nom'), verrouille: largeur('verrouille'), stable: largeur('stable') };
console.log(`${'composant'.padEnd(l.nom)}  ${'verrouillé'.padEnd(l.verrouille)}  ${'stable'.padEnd(l.stable)}  date        état / préversion`);
for (const x of lignes) {
  const etat = x.verrouille === 'absent' ? 'non adopté' : x.retard ? (x.cause ? `RETARD EXPLIQUÉ : ${x.cause}` : 'RETARD') : 'à jour';
  console.log(`${x.nom.padEnd(l.nom)}  ${x.verrouille.padEnd(l.verrouille)}  ${x.stable.padEnd(l.stable)}  ${x.date.padEnd(10)}  ${etat}${x.prerelease ? `  [préversion : ${x.prerelease}]` : ''}`);
}
const inexpliques = lignes.filter((x) => x.retard && !x.cause);
console.log(`\n${lignes.length} composants, ${lignes.filter((x) => x.retard).length} en retard dont ${inexpliques.length} sans explication.`);
if (strict && inexpliques.length) process.exit(1);
