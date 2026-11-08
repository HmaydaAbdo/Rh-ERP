// Contrôle documentation ↔ code de l'IA. Échoue (code 1) si un fait consigné dans scripts/ia/verrous.txt ou dans la
// documentation ne correspond plus au code :
//   - les verrous (versions verrouillées dans ia/uv.lock et les package-lock.json, seuils de agent.py, nombre d'outils MCP
//     déclarés par @McpTool) ;
//   - toute mention « N outils MCP » de la documentation IA ;
//   - l'attente du test d'intégration MCP du backend.
// Mettre à jour scripts/ia/verrous.txt en même temps que le code : c'est ce qui rend les documents fiables après une reprise.
//
//   node scripts/ia/check-docs-code.mjs [racine]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const racine = resolve(process.argv[2] ?? '.');
const lire = (chemin) => readFileSync(join(racine, chemin), 'utf8');
const erreurs = [];

const bloc = lire('scripts/ia/verrous.txt');

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
const outilsMcp = fichiers(join(racine, 'api/src/staport/domains/mcp'), /\.py$/).reduce(
  (n, f) => n + (readFileSync(f, 'utf8').match(/^\s*@serveur\.tool\(/gm) ?? []).length,
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

const lignesBloc = bloc.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
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
    erreurs.push(`Ligne inconnue de scripts/ia/verrous.txt : ${ligne}`);
    continue;
  }
  if (reel === null || reel === undefined || Number.isNaN(reel)) erreurs.push(`${nom} : introuvable dans le code`);
  else if (reel !== attendu) erreurs.push(`${nom} : documenté ${attendu}, dans le code ${reel}`);
}

for (const cle of Object.keys(seuils)) {
  if (!lignesBloc.some((l) => l.startsWith(`seuil ${cle} `))) erreurs.push(`scripts/ia/verrous.txt ne porte pas le seuil ${cle}`);
}

for (const doc of ['docs/ia/decisions.md', 'docs/ia.md', 'ia/README.md', 'AGENTS.md']) {
  for (const [ligne, texte] of lire(doc).split(/\r?\n/).entries()) {
    if (/^\| \d{4}-\d{2}-\d{2} \|/.test(texte)) continue; // journal daté : état d'un jour donné
    for (const m of texte.matchAll(/\b(\d+) outils(?: de lecture| lecture| MCP)/g)) {
      if (Number(m[1]) !== outilsMcp) erreurs.push(`${doc}:${ligne + 1} : « ${m[0]} », ${outilsMcp} outils @serveur.tool dans l'API`);
    }
  }
}

const attenteTest = lire('api/tests/test_mcp.py').match(/assert len\(outils\) == (\d+)/)?.[1];
if (Number(attenteTest) !== outilsMcp) erreurs.push(`test_mcp.py attend ${attenteTest} outils, ${outilsMcp} déclarés`);

if (erreurs.length) {
  console.error(`Documentation et code divergent (${erreurs.length}) :\n- ${erreurs.join('\n- ')}`);
  process.exit(1);
}
console.log(`Documentation IA conforme au code (${outilsMcp} outils MCP, ${lignesBloc.length} verrous).`);
