// Sécurité du runtime (KAN-79) : authentification de chaque requête et fils réservés à leur propriétaire.
// L'API et le service IA sont simulés ; le gestionnaire Express officiel et la table de propriété sont les vrais.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
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
// Réponse simulée de `/capacites` du service IA et dernier jeton reçu (capacités déclarées dans /info, KAN-270).
let piecesJointesIa = true;
let derniereAutorisationCapacites;
// Exécutions du service IA (un POST = un run de l'agent) et lenteur du flux simulé, pour la reprise d'un flux coupé (KAN-85).
let executionsIa = 0;
let lenteurIaMs = 0;
// Politique des vues libres que l'API simulée renvoie (KAN-281, KAN-282) : interrupteur et bornes lus dans Paramètres.
const POLITIQUE_DEPART = { actives: true, tailleMaxOctets: 204800, dureeMaxSecondes: 15, parReponse: 10, parMinute: 60 };
let politiqueVuesLibres = { ...POLITIQUE_DEPART };
// Journal d'audit des ouvertures (KAN-283) : ce que l'API simulée a reçu, et sa panne éventuelle.
const ouverturesAuditees = [];
let panneAudit = false;

before(async () => {
  api = createServer((requete, reponse) => {
    const utilisateur = UTILISATEURS[(requete.headers.authorization ?? '').replace('Bearer ', '')];
    if (requete.url === '/parametres/vues-libres/ouvertures' && requete.method === 'POST') {
      let corps = '';
      requete.on('data', (morceau) => (corps += morceau));
      requete.on('end', () => {
        if (utilisateur && !panneAudit) {
          ouverturesAuditees.push(JSON.parse(corps));
        }
        reponse.writeHead(!utilisateur ? 401 : panneAudit ? 500 : 204).end();
      });
      return;
    }
    if (requete.url === '/parametres/vues-libres') {
      return reponse.writeHead(utilisateur ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(utilisateur ? politiqueVuesLibres : {}));
    }
    reponse.writeHead(utilisateur ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(utilisateur ?? {}));
  });
  await new Promise((ok) => api.listen(0, '127.0.0.1', ok));
  // Service IA simulé : un run AG-UI valide qui répond `SECRET`, pour qu'un historique existe à protéger.
  agent = createServer((requete, reponse) => {
    if (requete.url === '/capacites') {
      derniereAutorisationCapacites = requete.headers.authorization;
      return reponse.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ piecesJointes: piecesJointesIa }));
    }
    if (requete.method === 'DELETE') {
      suppressionsIa.push({ url: requete.url, autorisation: requete.headers.authorization });
      return reponse.writeHead(panneIa ? 500 : 204).end();
    }
    let corps = '';
    requete.on('data', (morceau) => (corps += morceau));
    requete.on('end', () => {
      executionsIa += 1;
      const { threadId, runId } = JSON.parse(corps);
      const evenements = [
        { type: 'RUN_STARTED', threadId, runId },
        { type: 'TEXT_MESSAGE_START', messageId: `m-${runId}`, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: `m-${runId}`, delta: SECRET },
        { type: 'TEXT_MESSAGE_END', messageId: `m-${runId}` },
        { type: 'RUN_FINISHED', threadId, runId }
      ];
      const ecrire = (evenement) => reponse.write(`data: ${JSON.stringify(evenement)}

`);
      reponse.writeHead(200, { 'content-type': 'text/event-stream' });
      ecrire(evenements[0]);
      setTimeout(() => {
        evenements.slice(1).forEach(ecrire);
        reponse.end();
      }, lenteurIaMs);
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

describe('reconnexion du flux (KAN-85) : se rattacher ne relance jamais l’agent', () => {
  test('après un run terminé, se rattacher plusieurs fois rejoue la réponse sans nouvelle exécution', async () => {
    const fil = 'u1-rattache';
    await appeler('/agent/default/run', { jeton: 'jeton-1', corps: corpsRun(fil) });
    const avant = executionsIa;

    const premiere = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun(fil) });
    const seconde = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun(fil) });

    assert.ok(premiere.texte.includes(SECRET) && seconde.texte.includes(SECRET));
    assert.equal(executionsIa, avant); // aucun run relancé : le rattachement est une lecture
  });

  test('un flux coupé en cours de run : le run continue, se rattacher donne la réponse sans le relancer', async () => {
    const fil = 'u1-coupe';
    lenteurIaMs = 400;
    const avant = executionsIa;
    try {
      const controle = new AbortController();
      const reponse = await fetch(`${base}/agent/default/run`, {
        method: 'POST',
        headers: { authorization: 'Bearer jeton-1', 'content-type': 'application/json' },
        body: JSON.stringify(corpsRun(fil)),
        signal: controle.signal
      });
      await reponse.body.getReader().read(); // le début du flux est arrivé…
      controle.abort(); // … puis le réseau est coupé

      const rattache = await appeler('/agent/default/connect', { jeton: 'jeton-1', corps: corpsRun(fil) });

      assert.ok(rattache.texte.includes(SECRET), 'la réponse du run coupé est livrée au rattachement');
      assert.equal(executionsIa, avant + 1); // un seul run, jamais deux
    } finally {
      lenteurIaMs = 0;
    }
  });
});

describe('annulation d’un run (KAN-99) : l’arrêt est réservé au propriétaire du fil', () => {
  test('arrêter un run en cours le coupe avant sa réponse ; un autre utilisateur ne peut pas l’arrêter', async () => {
    const fil = 'u1-annule';
    lenteurIaMs = 1500;
    try {
      const run = fetch(`${base}/agent/default/run`, {
        method: 'POST',
        headers: { authorization: 'Bearer jeton-1', 'content-type': 'application/json' },
        body: JSON.stringify(corpsRun(fil)),
        signal: AbortSignal.timeout(10_000)
      }).then((reponse) => reponse.text()).catch(() => '');
      await new Promise((ok) => setTimeout(ok, 300));

      const intrus = await appeler(`/agent/default/stop/${fil}`, { jeton: 'jeton-2', corps: {} });
      // Comportement officiel : pour un fil qui n'est pas le sien, « aucun run actif » (sans révéler que le fil existe).
      assert.equal(JSON.parse(intrus.texte).stopped, false, 'un autre utilisateur ne peut pas arrêter le fil');
      const arret = await appeler(`/agent/default/stop/${fil}`, { jeton: 'jeton-1', corps: {} });
      assert.equal(JSON.parse(arret.texte).stopped, true);
      assert.ok(!(await run).includes(SECRET), 'la réponse n’arrive pas : le run a été coupé');
    } finally {
      lenteurIaMs = 0;
    }
  });
});

describe('capacités du service IA (KAN-93, KAN-270)', () => {
  test('sont déclarées dans /info (AG-UI) avec le jeton de l’utilisateur : pièces jointes ouvertes si le service les accepte', async () => {
    const reponse = await appeler('/info', { jeton: 'jeton-1' });

    assert.equal(reponse.status, 200);
    assert.deepEqual(JSON.parse(reponse.texte).agents.default.capabilities, { multimodal: { input: { image: true, pdf: true, file: true } } });
    assert.equal(derniereAutorisationCapacites, 'Bearer jeton-1');
  });

  test('restent vides quand le service IA les refuse ou tombe : les pièces jointes restent fermées', async () => {
    piecesJointesIa = false;
    try {
      assert.deepEqual(JSON.parse((await appeler('/info', { jeton: 'jeton-1' })).texte).agents.default.capabilities, {});
    } finally {
      piecesJointesIa = true;
    }
  });
});

describe('dictée (KAN-93) : transcription officielle vers un Whisper local compatible OpenAI', () => {
  let whisper;
  let appStt;
  let baseStt;
  const requetesWhisper = [];

  before(async () => {
    whisper = createServer((requete, reponse) => {
      requetesWhisper.push({ url: requete.url, type: requete.headers['content-type'] ?? '' });
      requete.resume();
      requete.on('end', () => reponse.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: 'bonjour la paie' })));
    });
    await new Promise((ok) => whisper.listen(0, '127.0.0.1', ok));
    const creation = creerApp({
      urlAgent: `http://127.0.0.1:${agent.address().port}/agui`,
      urlApi: `http://127.0.0.1:${api.address().port}`,
      journal: { error: () => {} },
      stt: { url: `http://127.0.0.1:${whisper.address().port}`, modele: 'Systran/faster-whisper-small', langue: 'fr' }
    });
    appStt = creation.app.listen(0, '127.0.0.1');
    await new Promise((ok) => appStt.once('listening', ok));
    baseStt = `http://127.0.0.1:${appStt.address().port}/copilotkit`;
  });

  after(() => {
    appStt.closeAllConnections();
    appStt.close();
    whisper.closeAllConnections();
    whisper.close();
  });

  const dicter = (jeton, adresse = baseStt) => {
    const formulaire = new FormData();
    formulaire.append('audio', new Blob([new Uint8Array(64)], { type: 'audio/webm' }), 'voix.webm');
    return fetch(`${adresse}/transcribe`, {
      method: 'POST',
      headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
      body: formulaire,
      signal: AbortSignal.timeout(10_000)
    });
  };

  test('la capacité est annoncée seulement quand un service de transcription est configuré', async () => {
    const avec = await (await fetch(`${baseStt}/info`, { headers: { authorization: 'Bearer jeton-1' } })).json();
    assert.equal(avec.audioFileTranscriptionEnabled, true);
    const sans = await (await fetch(`${base}/info`, { headers: { authorization: 'Bearer jeton-1' } })).json();
    assert.equal(sans.audioFileTranscriptionEnabled, false);
  });

  test("exige l'authentification et le droit IA_UTILISER avant toute transcription", async () => {
    assert.equal((await dicter(undefined)).status, 401);
    assert.equal((await dicter('jeton-sans-droit')).status, 403);
    assert.equal(requetesWhisper.length, 0);
  });

  test("transcrit l'audio d'un utilisateur autorisé par le Whisper local", async () => {
    const reponse = await dicter('jeton-1');
    assert.equal(reponse.status, 200);
    assert.equal((await reponse.json()).text, 'bonjour la paie');
    assert.equal(requetesWhisper.length, 1);
    assert.match(requetesWhisper[0].url, /\/v1\/audio\/transcriptions$/);
  });

  test('sans service de transcription configuré, la dictée est refusée', async () => {
    assert.ok((await dicter('jeton-1', base)).status >= 400);
  });
});

describe('vues libres (KAN-95) : rendues par le middleware officiel, coupées par l’interrupteur', () => {
  const DOCUMENT = '<html><body><p>Vue de test</p></body></html>';
  let agentOutil;
  let serveurs = [];
  // Ce que l'agent simulé fait à chaque run : nombre d'appels de l'outil et octets de remplissage de leur HTML.
  let appels = 1;
  let rembourrage = 0;
  beforeEach(() => {
    appels = 1;
    rembourrage = 0;
    politiqueVuesLibres = { ...POLITIQUE_DEPART };
    panneAudit = false;
    ouverturesAuditees.length = 0;
  });

  const demarrer = async (vuesLibres) => {
    const app = creerApp({
      urlAgent: `http://127.0.0.1:${agentOutil.address().port}/agui`,
      urlApi: `http://127.0.0.1:${api.address().port}`,
      journal: { error: () => {} },
      vuesLibres
    });
    const http = app.app.listen(0, '127.0.0.1');
    await new Promise((ok) => http.once('listening', ok));
    serveurs.push({ http, fermer: app.fermer });
    return `http://127.0.0.1:${http.address().port}/copilotkit`;
  };

  before(async () => {
    // Service IA simulé : l'agent appelle l'outil `generateSandboxedUi` (outil frontal que le runtime lui fait parvenir).
    agentOutil = createServer((requete, reponse) => {
      let corps = '';
      requete.on('data', (morceau) => (corps += morceau));
      requete.on('end', () => {
        const { threadId, runId } = JSON.parse(corps);
        const arguments_ = JSON.stringify({ initialHeight: 120, placeholderMessages: ['Préparation…'], css: 'p{color:#222}', html: [DOCUMENT + '<!--' + 'x'.repeat(rembourrage) + '-->'], jsFunctions: '', jsExpressions: [] });
        const appelsOutil = Array.from({ length: appels }, (_, i) => [
          { type: 'TOOL_CALL_START', toolCallId: `t${i + 1}`, toolCallName: 'generateSandboxedUi', parentMessageId: 'm1' },
          { type: 'TOOL_CALL_ARGS', toolCallId: `t${i + 1}`, delta: arguments_ },
          { type: 'TOOL_CALL_END', toolCallId: `t${i + 1}` }
        ]).flat();
        const evenements = [{ type: 'RUN_STARTED', threadId, runId }, ...appelsOutil, { type: 'RUN_FINISHED', threadId, runId }];
        reponse.writeHead(200, { 'content-type': 'text/event-stream' });
        evenements.forEach((evenement) => reponse.write(`data: ${JSON.stringify(evenement)}\n\n`));
        reponse.end();
      });
    });
    await new Promise((ok) => agentOutil.listen(0, '127.0.0.1', ok));
  });

  after(() => {
    serveurs.forEach(({ http, fermer: arreter }) => {
      http.closeAllConnections();
      http.close();
      arreter();
    });
    agentOutil.closeAllConnections();
    agentOutil.close();
  });

  const lancer = async (racine) => {
    const reponse = await fetch(`${racine}/agent/default/run`, {
      method: 'POST',
      headers: { authorization: 'Bearer jeton-1', 'content-type': 'application/json' },
      body: JSON.stringify({ ...corpsRun(`vue-${randomUUID()}`), tools: [{ name: 'generateSandboxedUi', description: 'x', parameters: { type: 'object', properties: {} } }] }),
      signal: AbortSignal.timeout(10_000)
    });
    return reponse.text();
  };

  test('interrupteur éteint (VUES_LIBRES=false) : aucun événement de vue libre', async () => {
    const flux = await lancer(await demarrer(false));

    assert.ok(!flux.includes('open-generative-ui'));
  });

  test('activées : l\'appel de l\'outil devient une vue libre (activité officielle)', async () => {
    const flux = await lancer(await demarrer(true));

    assert.ok(flux.includes('open-generative-ui'), flux.slice(0, 800));
    assert.ok(flux.includes('Vue de test'));
  });

  const vues = (flux) => (flux.match(/open-generative-ui/g) ?? []).length;

  test('arrêt à chaud (KAN-281) : l\'interrupteur de Paramètres coupe les vues à la question suivante, sans redéploiement', async () => {
    const racine = await demarrer(true);
    assert.ok(vues(await lancer(racine)) > 0);

    politiqueVuesLibres.actives = false;
    const f = await lancer(racine);
    assert.equal(vues(f), 0);

    politiqueVuesLibres.actives = true;
    assert.ok(vues(await lancer(racine)) > 0);
  });

  test('une politique illisible ferme les vues (échec fermé)', async () => {
    const racine = await demarrer(true);
    politiqueVuesLibres = undefined;

    assert.equal(vues(await lancer(racine)), 0);
  });

  test('taille (KAN-282) : un code trop gros est refusé sans qu\'un seul morceau parte au navigateur', async () => {
    const racine = await demarrer(true);
    politiqueVuesLibres.tailleMaxOctets = 2_000;
    rembourrage = 5_000;
    const flux = await lancer(racine);

    assert.equal(vues(flux), 0);
    assert.ok(!flux.includes('Vue de test'), 'aucun morceau du code ne part');
    assert.ok(flux.includes('RUN_FINISHED'), flux.slice(-600));
  });

  test('nombre par réponse (KAN-282) : au-delà de la limite, les vues en trop sont retirées', async () => {
    const racine = await demarrer(true);
    politiqueVuesLibres.parReponse = 2;
    appels = 5;
    const flux = await lancer(racine);

    assert.ok(vues(flux) > 0);
    assert.ok(flux.includes('"messageId":"t2-activity"'), 'les deux premières vues passent');
    assert.ok(!flux.includes('"messageId":"t3-activity"'), 'la troisième vue est retirée');
  });

  test('audit (KAN-283) : chaque vue admise est inscrite avec son fil et sa taille, jamais son contenu', async () => {
    const flux = await lancer(await demarrer(true));

    assert.ok(vues(flux) > 0);
    assert.equal(ouverturesAuditees.length, 1);
    assert.match(ouverturesAuditees[0].fil, /^vue-/);
    assert.ok(ouverturesAuditees[0].octets > 0);
    assert.ok(!JSON.stringify(ouverturesAuditees[0]).includes('Vue de test'), 'le contenu n’est pas journalisé');
  });

  test('audit (KAN-283) : une vue refusée n’est pas inscrite, et si l’inscription échoue la vue n’est pas montrée', async () => {
    const racine = await demarrer(true);
    politiqueVuesLibres.tailleMaxOctets = 2_000;
    rembourrage = 5_000;
    await lancer(racine);
    assert.equal(ouverturesAuditees.length, 0);

    politiqueVuesLibres.tailleMaxOctets = 204800;
    rembourrage = 0;
    panneAudit = true;
    const flux = await lancer(racine);
    assert.equal(vues(flux), 0);
    assert.ok(!flux.includes('Vue de test'));
  });

  test('fréquence par minute (KAN-282) : la limite est par utilisateur', async () => {
    const racine = await demarrer(true);
    politiqueVuesLibres.parMinute = 1;

    assert.ok(vues(await lancer(racine)) > 0);
    assert.equal(vues(await lancer(racine)), 0, 'la deuxième vue de la minute est refusée');
  });
});
