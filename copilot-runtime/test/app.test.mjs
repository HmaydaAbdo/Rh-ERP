// Sécurité du runtime (KAN-79) : authentification de chaque requête et fils réservés à leur propriétaire.
// L'API et le service IA sont simulés ; le gestionnaire Express officiel et la table de propriété sont les vrais.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { creerApp } from '../src/app.mjs';

const UTILISATEURS = {
  'jeton-1': { id: 1, permissionsEffectives: ['IA_UTILISER'] },
  'jeton-2': { id: 2, permissionsEffectives: ['IA_UTILISER'] },
  'jeton-sans-droit': { id: 3, permissionsEffectives: ['EMPLOYEE_READ'] }
};

const SECRET = 'reponse-privee-du-proprietaire';
let api;
let agent;
let serveur;
let base;
let dossier;
let fermer;

before(async () => {
  api = createServer((requete, reponse) => {
    const utilisateur = UTILISATEURS[(requete.headers.authorization ?? '').replace('Bearer ', '')];
    reponse.writeHead(utilisateur ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(utilisateur ?? {}));
  });
  await new Promise((ok) => api.listen(0, '127.0.0.1', ok));
  // Service IA simulé : un run AG-UI valide qui répond `SECRET`, pour qu'un historique existe à protéger.
  agent = createServer((requete, reponse) => {
    let corps = '';
    requete.on('data', (morceau) => (corps += morceau));
    requete.on('end', () => {
      const { threadId, runId } = JSON.parse(corps);
      const evenements = [
        { type: 'RUN_STARTED', threadId, runId },
        { type: 'TEXT_MESSAGE_START', messageId: `m-${runId}`, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: `m-${runId}`, delta: SECRET },
        { type: 'TEXT_MESSAGE_END', messageId: `m-${runId}` },
        { type: 'RUN_FINISHED', threadId, runId }
      ];
      reponse.writeHead(200, { 'content-type': 'text/event-stream' });
      reponse.end(evenements.map((evenement) => `data: ${JSON.stringify(evenement)}

`).join(''));
    });
  });
  await new Promise((ok) => agent.listen(0, '127.0.0.1', ok));
  dossier = mkdtempSync(join(tmpdir(), 'runtime-'));
  const creation = creerApp({
    urlAgent: `http://127.0.0.1:${agent.address().port}/agui`,
    urlApi: `http://127.0.0.1:${api.address().port}`,
    cheminBase: join(dossier, 'threads.db'),
    journal: { error: () => {} }
  });
  fermer = creation.fermer;
  serveur = creation.app.listen(0, '127.0.0.1');
  await new Promise((ok) => serveur.once('listening', ok));
  base = `http://127.0.0.1:${serveur.address().port}/copilotkit`;
});

after(() => {
  serveur.closeAllConnections();
  serveur.close();
  api.closeAllConnections();
  api.close();
  agent.closeAllConnections();
  agent.close();
  fermer();
  rmSync(dossier, { recursive: true, force: true, maxRetries: 3 });
});

// Les flux d'événements de l'agent simulé se terminent d'eux-mêmes : le corps est lu en entier (au plus 4 Ko).
const appeler = async (chemin, { jeton, corps, entetes = {} } = {}) => {
  const reponse = await fetch(`${base}${chemin}`, {
    method: corps ? 'POST' : 'GET',
    headers: { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...(corps ? { 'content-type': 'application/json' } : {}), ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  return { status: reponse.status, texte: (await reponse.text()).slice(0, 4096) };
};

const corpsRun = (threadId) => ({ threadId, runId: randomUUID(), messages: [], state: {}, tools: [], context: [], forwardedProps: {} });
// Une réponse « servie » est tout sauf un refus d'accès.
const refus = [401, 403, 404];

describe('authentification', () => {
  test('sans jeton ou avec un jeton inconnu : 401', async () => {
    assert.equal((await appeler('/info')).status, 401);
    assert.equal((await appeler('/info', { jeton: 'inconnu' })).status, 401);
  });

  test('sans le droit IA_UTILISER : 403', async () => {
    assert.equal((await appeler('/info', { jeton: 'jeton-sans-droit' })).status, 403);
  });

  test('avec le droit : la route info est servie', async () => {
    assert.equal((await appeler('/info', { jeton: 'jeton-1' })).status, 200);
  });

  test('les routes de fils, mémoires et inspecteur restent fermées : 404', async () => {
    for (const chemin of ['/threads', '/memories', '/inspector/metadata']) {
      assert.equal((await appeler(chemin, { jeton: 'jeton-1' })).status, 404, chemin);
    }
  });
});

describe('propriété des fils (runner SQLite et identifyUser officiels)', () => {
  test('le propriétaire lance puis reprend son fil', async () => {
    const run = await appeler('/agent/default/run', { jeton: 'jeton-1', corps: corpsRun('u1-reunion') });
    assert.ok(!refus.includes(run.status), `run : ${run.status}`);
    const connexion = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun('u1-reunion') });
    assert.ok(!refus.includes(connexion.status), `connect : ${connexion.status}`);
  });

  test("un autre utilisateur ne lance ni n'arrête le fil du propriétaire (404) et ne l'arrête ni ne le rejoue", async () => {
    await appeler('/agent/default/run', { jeton: 'jeton-1', corps: corpsRun('u1-prive') });
    assert.equal((await appeler('/agent/default/run', { jeton: 'jeton-2', corps: corpsRun('u1-prive') })).status, 404);
    const arret = await appeler('/agent/default/stop/u1-prive', { jeton: 'jeton-2', corps: {} });
    assert.equal(JSON.parse(arret.texte).stopped, false); // aucun effet sur le fil d'un autre
    // `connect` rejoue l'historique du fil : le propriétaire le reçoit, un autre utilisateur un flux vide comme pour un fil inconnu.
    const propriete = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun('u1-prive') });
    assert.ok(propriete.texte.includes(SECRET));
    const reprise = await appeler('/agent/default/connect', { jeton: 'jeton-2', corps: corpsRun('u1-prive') });
    assert.equal(reprise.texte, '');
  });

  test("un en-tête d'identité forgé par le client est écrasé", async () => {
    const reponse = await appeler('/agent/default/run', {
      jeton: 'jeton-2',
      corps: corpsRun('u1-prive'),
      entetes: { 'x-staport-utilisateur-verifie': '1' }
    });
    assert.equal(reponse.status, 404);
  });
});
