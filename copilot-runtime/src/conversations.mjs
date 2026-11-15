// Liste des conversations de l'assistant (KAN-81). CopilotKit ne fournit la liste, le renommage et la suppression des
// fils qu'avec Intelligence (service hébergé) : le runtime libre garde donc, dans la base du `SqliteAgentRunner`, une
// table de présentation `assistant_conversations` (titre, dates) qui ne porte aucune autorité : la propriété et l'accès
// aux fils restent ceux du runner officiel (`identifyUser`).
import express from 'express';

const TITRE_MAX = 60;
const RE_RUN = /\/agent\/[^/]+\/run$/;

/** Le titre : le début de la première question de l'utilisateur, sur une ligne. */
export function titreDepuis(messages) {
  const premiere = Array.isArray(messages) ? messages.find((message) => message?.role === 'user') : undefined;
  const contenu = premiere?.content;
  const texte = typeof contenu === 'string' ? contenu : Array.isArray(contenu) ? contenu.map((p) => p?.text ?? '').join(' ') : '';
  const propre = texte.replace(/\s+/g, ' ').trim();
  return propre.length > TITRE_MAX ? `${propre.slice(0, TITRE_MAX - 1).trimEnd()}…` : propre || 'Nouvelle conversation';
}

/**
 * @param {import('better-sqlite3').Database} db base du runner
 * @param {{ urlAgent: string, authentifier: (autorisation: string) => Promise<string|number>, journal: Pick<Console,'error'> }} options
 */
export function creerConversations(db, { urlAgent, authentifier, journal }) {
  db.exec(`CREATE TABLE IF NOT EXISTS assistant_conversations (
    thread_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  const inserer = db.prepare(`INSERT INTO assistant_conversations (thread_id, owner_id, title, created_at, updated_at)
    VALUES (@thread_id, @owner_id, @title, @now, @now)
    ON CONFLICT(thread_id) DO UPDATE SET updated_at = excluded.updated_at WHERE owner_id = excluded.owner_id`);
  const lister = db.prepare('SELECT thread_id AS id, title, created_at AS createdAt, updated_at AS updatedAt FROM assistant_conversations WHERE owner_id = ? ORDER BY updated_at DESC');
  const renommer = db.prepare('UPDATE assistant_conversations SET title = ? WHERE thread_id = ? AND owner_id = ?');
  const supprimerLigne = db.transaction((threadId, proprietaire) => {
    const { changes } = db.prepare('DELETE FROM assistant_conversations WHERE thread_id = ? AND owner_id = ?').run(threadId, proprietaire);
    if (changes) {
      for (const table of ['agent_runs', 'run_state', 'thread_owners']) {
        db.prepare(`DELETE FROM ${table} WHERE thread_id = ?`).run(threadId);
      }
    }
    return changes > 0;
  });

  /** Mémorise la conversation d'un run (appelé après authentification) ; sans effet sur le fil d'un autre utilisateur. */
  async function noterRun(request, proprietaire) {
    if (request.method !== 'POST' || !RE_RUN.test(new URL(request.url).pathname)) {
      return;
    }
    try {
      const { threadId, messages } = await request.clone().json();
      if (typeof threadId === 'string' && threadId) {
        inserer.run({ thread_id: threadId, owner_id: String(proprietaire), title: titreDepuis(messages), now: Date.now() });
      }
    } catch {
      // Corps illisible : le runtime officiel répondra lui-même.
    }
  }

  const routeur = express.Router();
  routeur.use(async (requete, reponse, suivant) => {
    try {
      reponse.locals.proprietaire = String(await authentifier(requete.headers.authorization ?? ''));
      suivant();
    } catch (refus) {
      reponse.sendStatus(refus instanceof Response ? refus.status : 401);
    }
  });
  routeur.get('/', (_requete, reponse) => {
    reponse.json(lister.all(reponse.locals.proprietaire));
  });
  routeur.patch('/:id', express.json({ limit: '4kb' }), (requete, reponse) => {
    const titre = typeof requete.body?.title === 'string' ? requete.body.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!titre) {
      return reponse.sendStatus(422);
    }
    return reponse.sendStatus(renommer.run(titre, requete.params.id, reponse.locals.proprietaire).changes ? 204 : 404);
  });
  routeur.delete('/:id', async (requete, reponse) => {
    const { id } = requete.params;
    const proprietaire = reponse.locals.proprietaire;
    if (!lister.all(proprietaire).some((conversation) => conversation.id === id)) {
      return reponse.sendStatus(404);
    }
    // D'abord la mémoire de l'agent (elle seule retient le contenu) : en cas d'échec rien n'est supprimé, on peut réessayer.
    try {
      const distant = await fetch(new URL(`./conversations/${encodeURIComponent(id)}`, urlAgent), {
        method: 'DELETE',
        headers: { Authorization: requete.headers.authorization }
      });
      if (!distant.ok) {
        throw new Error(String(distant.status));
      }
    } catch (panne) {
      journal.error(`Suppression de la mémoire IA en échec : ${panne instanceof Error ? panne.message : 'inconnue'}`);
      return reponse.sendStatus(502);
    }
    supprimerLigne(id, proprietaire);
    return reponse.sendStatus(204);
  });

  return { noterRun, routeur };
}
