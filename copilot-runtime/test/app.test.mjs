// Sécurité du runtime (KAN-79) : authentification de chaque requête et fils réservés à leur propriétaire.
// L'API et le service IA sont simulés ; le gestionnaire Express officiel et la table de propriété sont les vrais.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import Database from 'better-sqlite3';
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
let purger;
const suppressionsIa = [];
let panneIa = false;

before(async () => {
  api = createServer((requete, reponse) => {
    const utilisateur = UTILISATEURS[(requete.headers.authorization ?? '').replace('Bearer ', '')];
    reponse.writeHead(utilisateur ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(utilisateur ?? {}));
  });
  await new Promise((ok) => api.listen(0, '127.0.0.1', ok));
  // Service IA simulé : un run AG-UI valide qui répond `SECRET`, pour qu'un historique existe à protéger.
  agent = createServer((requete, reponse) => {
    if (requete.method === 'DELETE') {
      suppressionsIa.push({ url: requete.url, autorisation: requete.headers.authorization });
      return reponse.writeHead(panneIa ? 500 : 204).end();
    }
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
  purger = creation.purger;
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

describe('liste des conversations (KAN-81)', () => {
  const run = (jeton, threadId, question) =>
    appeler('/agent/default/run', { jeton, corps: { ...corpsRun(threadId), messages: [{ id: randomUUID(), role: 'user', content: question }] } });
  const requete = async (methode, chemin, { jeton, corps } = {}) => {
    const reponse = await fetch(`${base}/conversations${chemin}`, {
      method: methode,
      headers: { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...(corps ? { 'content-type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(10_000)
    });
    const texte = await reponse.text();
    return { status: reponse.status, json: reponse.headers.get('content-type')?.includes('json') ? JSON.parse(texte) : undefined };
  };

  test('exige une authentification', async () => {
    assert.equal((await requete('GET', '')).status, 401);
    assert.equal((await requete('GET', '', { jeton: 'jeton-sans-droit' })).status, 403);
  });

  test('chaque utilisateur ne voit que ses conversations, titrées par sa première question, la plus récente en tête', async () => {
    await run('jeton-1', 'u1-liste-a', '  Quelle est la   masse salariale de septembre 2026 pour tous les services de la société, détail par direction ?  ');
    await new Promise((ok) => setTimeout(ok, 5));
    await run('jeton-1', 'u1-liste-b', 'Combien de salariés ?');
    await run('jeton-2', 'u2-liste', 'Question privée du second');
    const liste = (await requete('GET', '', { jeton: 'jeton-1' })).json.filter((c) => c.id.startsWith('u1-liste'));
    assert.deepEqual(liste.map((c) => c.id), ['u1-liste-b', 'u1-liste-a']);
    assert.equal(liste[0].title, 'Combien de salariés ?');
    assert.ok(liste[1].title.length <= 60 && liste[1].title.endsWith('…') && liste[1].title.startsWith('Quelle est la masse'));
    const autre = (await requete('GET', '', { jeton: 'jeton-2' })).json;
    assert.ok(autre.some((c) => c.id === 'u2-liste') && !autre.some((c) => c.id.startsWith('u1-')));
  });

  test("le fil d'un autre ne crée ni ne vole une ligne de liste", async () => {
    await run('jeton-1', 'u1-vol', 'Mon fil');
    await run('jeton-2', 'u1-vol', 'Tentative'); // refusé (404) par le runner
    const chez2 = (await requete('GET', '', { jeton: 'jeton-2' })).json;
    assert.ok(!chez2.some((c) => c.id === 'u1-vol'));
    const chez1 = (await requete('GET', '', { jeton: 'jeton-1' })).json.find((c) => c.id === 'u1-vol');
    assert.equal(chez1.title, 'Mon fil');
  });

  test('renomme ses conversations seulement', async () => {
    await run('jeton-1', 'u1-nom', 'Titre initial');
    assert.equal((await requete('PATCH', '/u1-nom', { jeton: 'jeton-2', corps: { title: 'Piraté' } })).status, 404);
    assert.equal((await requete('PATCH', '/u1-nom', { jeton: 'jeton-1', corps: { title: '   ' } })).status, 422);
    assert.equal((await requete('PATCH', '/u1-nom', { jeton: 'jeton-1', corps: { title: ' Paie  de septembre ' } })).status, 204);
    const trouvee = (await requete('GET', '', { jeton: 'jeton-1' })).json.find((c) => c.id === 'u1-nom');
    assert.equal(trouvee.title, 'Paie de septembre');
  });

  test("supprime la liste, l'historique et la mémoire IA ; refuse celle d'un autre", async () => {
    await run('jeton-1', 'u1-suppr', 'À effacer');
    assert.equal((await requete('DELETE', '/u1-suppr', { jeton: 'jeton-2' })).status, 404);
    assert.equal(suppressionsIa.length, 0);
    assert.equal((await requete('DELETE', '/u1-suppr', { jeton: 'jeton-1' })).status, 204);
    assert.deepEqual(suppressionsIa, [{ url: '/conversations/u1-suppr', autorisation: 'Bearer jeton-1' }]);
    assert.ok(!(await requete('GET', '', { jeton: 'jeton-1' })).json.some((c) => c.id === 'u1-suppr'));
    const rejoue = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun('u1-suppr') });
    assert.ok(!rejoue.texte.includes(SECRET)); // l'historique du runner est effacé
  });

  test("si la mémoire IA ne répond pas, rien n'est supprimé (502) et on peut réessayer", async () => {
    await run('jeton-1', 'u1-panne', 'Fil gardé');
    panneIa = true;
    assert.equal((await requete('DELETE', '/u1-panne', { jeton: 'jeton-1' })).status, 502);
    panneIa = false;
    assert.ok((await requete('GET', '', { jeton: 'jeton-1' })).json.some((c) => c.id === 'u1-panne'));
    assert.equal((await requete('DELETE', '/u1-panne', { jeton: 'jeton-1' })).status, 204);
  });
});

describe('expiration des conversations (KAN-82)', () => {
  const JOUR = 24 * 3600 * 1000;
  const run = (threadId, question) =>
    appeler('/agent/default/run', { jeton: 'jeton-1', corps: { ...corpsRun(threadId), messages: [{ id: randomUUID(), role: 'user', content: question }] } });
  const liste = async () => {
    const reponse = await fetch(`${base}/conversations`, { headers: { authorization: 'Bearer jeton-1' } });
    return (await reponse.json()).map((c) => c.id);
  };
  const vieillir = (threadId, jours, { ligne = true } = {}) => {
    const db = new Database(join(dossier, 'threads.db'));
    db.prepare('UPDATE agent_runs SET created_at = created_at - ? WHERE thread_id = ?').run(jours * JOUR, threadId);
    if (ligne) {
      db.prepare('UPDATE assistant_conversations SET updated_at = updated_at - ? WHERE thread_id = ?').run(jours * JOUR, threadId);
    } else {
      db.prepare('DELETE FROM assistant_conversations WHERE thread_id = ?').run(threadId);
    }
    db.close();
  };
  const lignes = (table, threadId) => {
    const db = new Database(join(dossier, 'threads.db'), { readonly: true });
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE thread_id = ?`).get(threadId);
    db.close();
    return n;
  };

  test('supprime liste, historique et propriété des conversations inactives, garde les récentes', async () => {
    await run('u1-exp-ancien', 'Vieille question');
    await run('u1-exp-recent', 'Question récente');
    vieillir('u1-exp-ancien', 40);
    vieillir('u1-exp-recent', 10);

    assert.ok(purger(30) >= 1);

    const ids = await liste();
    assert.ok(!ids.includes('u1-exp-ancien') && ids.includes('u1-exp-recent'));
    for (const table of ['agent_runs', 'run_state', 'thread_owners', 'assistant_conversations']) {
      assert.equal(lignes(table, 'u1-exp-ancien'), 0, table);
    }
    assert.ok(lignes('agent_runs', 'u1-exp-recent') > 0);
    const rejoue = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun('u1-exp-ancien') });
    assert.ok(!rejoue.texte.includes(SECRET));
  });

  test('purge aussi un fil sans ligne de liste (créé avant la liste) et ne touche pas une conversation active', async () => {
    await run('u1-exp-orphelin', 'Fil sans ligne');
    vieillir('u1-exp-orphelin', 40, { ligne: false });
    assert.equal(purger(30), 1);
    assert.equal(lignes('agent_runs', 'u1-exp-orphelin'), 0);
    assert.equal(purger(30), 0);
  });
});
