// Contrôle documentation ↔ code de l'IA (plan de travail IA, E1.5). Échoue (code 1) si un fait consigné dans
// docs/ia/plan-de-travail.md ne correspond plus au code :
//   - le bloc « verrous » du § 3 (versions verrouillées dans ia/uv.lock et les package-lock.json, seuils de agent.py,
//     nombre d'outils MCP déclarés par @McpTool) ;
//   - toute mention « N outils MCP » de la documentation IA ;
//   - l'attente du test d'intégration MCP du backend.
// Mettre à jour le bloc en même temps que le code : c'est ce qui rend le plan fiable après une reprise.
//
//   node scripts/ia/check-docs-code.mjs [racine]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const racine = resolve(process.argv[2] ?? '.');
const lire = (chemin) => readFileSync(join(racine, chemin), 'utf8');
const erreurs = [];

const plan = lire('docs/ia/plan-de-travail.md');
const bloc = plan.match(/<!-- verrous:debut -->([\s\S]*?)<!-- verrous:fin -->/)?.[1];
if (!bloc) {
  console.error('Bloc « verrous » introuvable dans docs/ia/plan-de-travail.md (§ 3).');
  process.exit(1);
}

// uv.lock : « [[package]] » suivi de name puis version, sur des lignes consécutives.
const versionsPypi = new Map();
for (const m of lire('ia/uv.lock').matchAll(/\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"/g)) {
  versionsPypi.set(m[1], m[2]);
}
const verrousNpm = {};
const versionNpm = (dossier, nom) => {
  verrousNpm[dossier] ??= JSON.parse(lire(`${dossier}/package-lock.json`)).packages;
  return verrousNpm[dossier][`node_modules/${nom}`]?.version ?? null;
};

function fichiers(dossier, motif) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin, motif) : motif.test(nom) ? [chemin] : [];
  });
}
const outilsMcp = fichiers(join(racine, 'backend/src/main/java'), /\.java$/).reduce(
  (n, f) => n + (readFileSync(f, 'utf8').match(/^\s*@McpTool\(/gm) ?? []).length,
  0
);
const agent = lire('ia/src/erp_rh_ia/agent.py');
const seuils = {
  resume_jetons: Number(agent.match(/^SEUIL_RESUME_JETONS = ([\d_]+)/m)?.[1].replaceAll('_', '')),
  resume_messages: Number(agent.match(/keep=\("messages", (\d+)\)/)?.[1]),
  appels_modele: Number(agent.match(/appels_modele: int = (\d+)/)?.[1]),
  appels_outils: Number(agent.match(/appels_outils: int = (\d+)/)?.[1]),
  outils_mcp: outilsMcp,
};

const lignesBloc = bloc.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(py|npm|seuil|\S+) /.test(l) && !l.startsWith('```'));
for (const ligne of lignesBloc) {
  const [genre, ...reste] = ligne.split(/\s+/);
  let reel;
  let attendu;
  let nom;
  if (genre === 'py') {
    [nom, attendu] = reste;
    reel = versionsPypi.get(nom) ?? null;
  } else if (genre === 'npm') {
    const [dossier, paquet, version] = reste;
    nom = `${dossier}:${paquet}`;
    attendu = version;
    reel = versionNpm(dossier, paquet);
  } else if (genre === 'seuil') {
    [nom, attendu] = reste;
    reel = seuils[nom];
    attendu = Number(attendu);
  } else {
    erreurs.push(`Ligne inconnue du bloc « verrous » : ${ligne}`);
    continue;
  }
  if (reel === null || reel === undefined || Number.isNaN(reel)) erreurs.push(`${nom} : introuvable dans le code`);
  else if (reel !== attendu) erreurs.push(`${nom} : documenté ${attendu}, dans le code ${reel}`);
}

for (const cle of Object.keys(seuils)) {
  if (!lignesBloc.some((l) => l.startsWith(`seuil ${cle} `))) erreurs.push(`Le bloc « verrous » ne porte pas le seuil ${cle}`);
}

for (const doc of ['docs/ia/plan-de-travail.md', 'docs/ia.md', 'ia/README.md', 'AGENTS.md']) {
  for (const [ligne, texte] of lire(doc).split(/\r?\n/).entries()) {
    if (/^\| \d{4}-\d{2}-\d{2} \|/.test(texte)) continue; // journal daté : état d'un jour donné
    for (const m of texte.matchAll(/\b(\d+) outils(?: de lecture| lecture| MCP)/g)) {
      if (Number(m[1]) !== outilsMcp) erreurs.push(`${doc}:${ligne + 1} : « ${m[0]} », ${outilsMcp} outils @McpTool dans le backend`);
    }
  }
}

const attenteTest = lire('backend/src/test/java/staport/rh/mcp/McpOutilsLectureIntegrationTest.java').match(/noms\)\.hasSize\((\d+)\)/)?.[1];
if (Number(attenteTest) !== outilsMcp) erreurs.push(`McpOutilsLectureIntegrationTest attend ${attenteTest} outils, ${outilsMcp} déclarés`);

if (erreurs.length) {
  console.error(`Documentation et code divergent (${erreurs.length}) :\n- ${erreurs.join('\n- ')}`);
  process.exit(1);
}
console.log(`Documentation IA conforme au code (${outilsMcp} outils MCP, ${lignesBloc.length} verrous).`);
