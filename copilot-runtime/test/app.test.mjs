// Sécurité du runtime (KAN-79) : authentification de chaque requête et fils réservés à leur propriétaire.
// L'API et le service IA sont simulés ; le gestionnaire Express officiel et la table de propriété sont les vrais.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { creerApp } from '../src/app.mjs';
import { ouvrirProprietaires } from '../src/proprietaires.mjs';

const UTILISATEURS = {
  'jeton-1': { id: 1, permissionsEffectives: ['IA_UTILISER'] },
  'jeton-2': { id: 2, permissionsEffectives: ['IA_UTILISER'] },
  'jeton-sans-droit': { id: 3, permissionsEffectives: ['EMPLOYEE_READ'] }
};

let api;
let agent;
let serveur;
let base;
let fermer;

before(async () => {
  api = createServer((requete, reponse) => {
    const utilisateur = UTILISATEURS[(requete.headers.authorization ?? '').replace('Bearer ', '')];
    reponse.writeHead(utilisateur ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(utilisateur ?? {}));
  });
  await new Promise((ok) => api.listen(0, '127.0.0.1', ok));
  // Service IA simulé : il refuse tout, seuls comptent les refus qui le précèdent et l'accès accordé jusqu'à lui.
  agent = createServer((_requete, reponse) => reponse.writeHead(500).end());
  await new Promise((ok) => agent.listen(0, '127.0.0.1', ok));
  const creation = creerApp({
    urlAgent: `http://127.0.0.1:${agent.address().port}/agui`,
    urlApi: `http://127.0.0.1:${api.address().port}`,
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
});

// Le corps n'est jamais lu : un flux d'événements ouvert est abandonné dès que l'état HTTP est connu.
const appeler = async (chemin, { jeton, corps, entetes = {} } = {}) => {
  const reponse = await fetch(`${base}${chemin}`, {
    method: corps ? 'POST' : 'GET',
    headers: { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...(corps ? { 'content-type': 'application/json' } : {}), ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  const { status } = reponse;
  await reponse.body?.cancel();
  return { status };
};

const corpsRun = (threadId) => ({ threadId, runId: 'r1', messages: [], state: {}, tools: [], context: [], forwardedProps: {} });
// Une réponse « servie » est tout sauf un refus d'accès : l'agent simulé répond en erreur.
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

describe('propriété des fils', () => {
  test('le propriétaire lance puis reprend son fil', async () => {
    const run = await appeler('/agent/default/run', { jeton: 'jeton-1', corps: corpsRun('u1-reunion') });
    assert.ok(!refus.includes(run.status), `run : ${run.status}`);
    const connexion = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun('u1-reunion') });
    assert.ok(!refus.includes(connexion.status), `connect : ${connexion.status}`);
  });

  test("un autre utilisateur ne lance, ne reprend ni n'arrête le fil du propriétaire : 403", async () => {
    await appeler('/agent/default/run', { jeton: 'jeton-1', corps: corpsRun('u1-prive') });
    for (const chemin of ['/agent/default/run', '/agent/default/connect']) {
      const reponse = await appeler(chemin, { jeton: 'jeton-2', corps: corpsRun('u1-prive') });
      assert.equal(reponse.status, 403, chemin);
    }
    assert.equal((await appeler('/agent/default/stop/u1-prive', { jeton: 'jeton-2', corps: {} })).status, 403);
  });

  test("un en-tête d'identité forgé par le client est écrasé", async () => {
    const reponse = await appeler('/agent/default/run', {
      jeton: 'jeton-2',
      corps: corpsRun('u1-prive'),
      entetes: { 'x-staport-utilisateur-verifie': '1' }
    });
    assert.equal(reponse.status, 403);
  });

  test('reprendre un fil inconnu, ou sans identifiant, est refusé : 403', async () => {
    assert.equal((await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun('u1-jamais-cree') })).status, 403);
    assert.equal((await appeler('/agent/default/run', { jeton: 'jeton-1', corps: { ...corpsRun('x'), threadId: undefined } })).status, 403);
  });

  test("la table réserve le fil au premier utilisateur qui le porte", () => {
    const table = ouvrirProprietaires();
    assert.equal(table.reserver('fil', 1), true);
    assert.equal(table.reserver('fil', 2), false);
    assert.equal(table.possede('fil', 1), true);
    assert.equal(table.possede('fil', 2), false);
    assert.equal(table.possede('inconnu', 1), false);
    table.fermer();
  });
});
