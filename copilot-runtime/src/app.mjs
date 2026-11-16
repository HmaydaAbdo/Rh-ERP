// Application HTTP du runtime CopilotKit de l'assistant RH (site/docs/ia, T16 et KAN-79) : le gestionnaire Express
// officiel `createCopilotExpressHandler` relaie l'agent AG-UI du service IA et lui applique le middleware A2UI officiel,
// qui fait offrir l'outil `generate_a2ui` et transforme son flux en surfaces affichées par Angular.
//
// Sécurité par les crochets officiels du gestionnaire : `onRequest` authentifie chaque requête auprès de l'API
// (`/auth/me`, droit IA_UTILISER) et répond 401 ou 403 ; `onBeforeHandler` ne sert que les routes de l'assistant et
// réserve chaque fil à son propriétaire : `identifyUser` (officiel depuis le runtime 1.88) donne l'identité vérifiée, et
// le `SqliteAgentRunner` enregistre le propriétaire du fil à son premier run puis refuse (403) tout autre utilisateur.
import { HttpAgent } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import { map } from 'rxjs';
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { TranscriptionServiceOpenAI } from '@copilotkit/voice';
import { SqliteAgentRunner } from '@copilotkit/sqlite-runner';
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
import express from 'express';
import OpenAI from 'openai';
import { creerConversations } from './conversations.mjs';

/** Routes servies ; toutes les autres (fils, mémoires, inspecteur, débogage) répondent 404. `transcribe` (dictée, KAN-93) n'existe que si un service de transcription est configuré. */
const ROUTES_SERVIES = new Set(['info', 'agent/run', 'agent/suggest', 'agent/connect', 'agent/stop', 'transcribe']);
/** En-tête interne posé par `onRequest` (toute valeur reçue du réseau est écrasée) : l'identifiant vérifié. */
const ENTETE_UTILISATEUR = 'x-staport-utilisateur-verifie';

// Les skills épinglés par Deep Agents sont des messages utilisateur `<skill name=…>` ajoutés à l'état du fil : ils sont
// destinés au modèle, pas à l'utilisateur. `ag-ui-langgraph` ne transmet pas le marqueur `lc_source` qui les distingue
// (signalement amont à faire) ; en attendant, le middleware officiel d'AG-UI les retire de l'instantané des messages.
const estSkillEpingle = (message) => message.role === 'user' && typeof message.content === 'string' && message.content.startsWith('<skill name=');
const masquerSkills = (input, next) =>
  next.run(input).pipe(
    map((evenement) =>
      evenement.type === EventType.MESSAGES_SNAPSHOT
        ? { ...evenement, messages: evenement.messages.filter((message) => !estSkillEpingle(message)) }
        : evenement
    )
  );

/**
 * @param {{ urlAgent: string, urlApi: string, cheminBase?: string, journal?: Pick<Console, 'error'>, stt?: { url: string, modele: string, langue?: string } }} options
 * @returns {{ app: import('express').Express, purger?: (jours: number) => number, fermer: () => void }}
 */
export function creerApp({ urlAgent, urlApi, cheminBase, journal = console, stt }) {
  const runner = cheminBase ? new SqliteAgentRunner({ dbPath: cheminBase }) : undefined;
  const runtime = new CopilotRuntime({
    // Un agent par requête (fabrique officielle) : le jeton de l'utilisateur lui est transmis par `forwardHeaders`
    // et le service IA le fait valider par l'API.
    agents: ({ request }) => ({
      default: new HttpAgent({
        url: urlAgent,
        // En-tête fixé par le serveur : il l'emporte sur tout en-tête transmis. Les suggestions n'ont pas de fil persistant.
        headers: { 'X-Staport-Stateless-Suggestion': new URL(request.url).pathname.endsWith('/suggest') ? 'true' : 'false' }
      }).use(masquerSkills)
    }),
    // L'utilisateur vérifié par `onRequest` : chaque fil appartient à celui dont la requête l'a créé.
    identifyUser: (request) => ({ id: request.headers.get(ENTETE_UTILISATEUR) ?? '' }),
    // Seul le jeton de l'utilisateur est transmis à l'agent (ni `x-*` du navigateur, ni l'en-tête interne).
    forwardHeaders: { allow: ['authorization'] },
    a2ui: { injectA2UITool: true },
    // Dictée (KAN-93) : le service de transcription officiel de CopilotKit (API compatible OpenAI) pointé sur un Whisper
    // local sur CPU ; sans `stt`, le runtime annonce la capacité désactivée et la discussion n'affiche pas le micro.
    ...(stt
      ? {
          transcriptionService: new TranscriptionServiceOpenAI({
            openai: new OpenAI({ baseURL: `${stt.url}/v1`, apiKey: 'service-local' }),
            model: stt.modele,
            ...(stt.langue ? { language: stt.langue } : {})
          })
        }
      : {}),
    // Historique des conversations : runner SQLite officiel de CopilotKit (reprise d'un fil après rechargement ou redémarrage).
    ...(runner ? { runner } : {})
  });

  const conversations = runner ? creerConversations(runner.db, { urlAgent, authentifier: (autorisation) => authentifier(autorisation, urlApi), journal }) : undefined;
  const app = express();
  app.get('/health', (_requete, reponse) => reponse.type('text/plain').send('ok'));
  // Liste, renommage et suppression des conversations (KAN-81) : routes propres à nous, avant le gestionnaire officiel.
  if (conversations) {
    app.use('/copilotkit/conversations', conversations.routeur);
  }
  // Capacités du service IA (KAN-93) : le navigateur n'atteint pas le service IA ; le runtime, déjà authentifié auprès de
  // l'API, relaie la réponse du service (pièces jointes ouvertes seulement si l'antivirus est joignable).
  app.get('/copilotkit/capacites', async (requete, reponse) => {
    try {
      const autorisation = requete.headers.authorization ?? '';
      await authentifier(autorisation, urlApi);
      const relais = await fetch(new URL('/capacites', urlAgent), { headers: { authorization: autorisation }, signal: AbortSignal.timeout(10_000) });
      reponse.status(relais.status).type('application/json').send(await relais.text());
    } catch (panne) {
      reponse.status(panne instanceof Response ? panne.status : 502).end();
    }
  });
  app.use(
    createCopilotExpressHandler({
      runtime,
      basePath: '/copilotkit',
      // Même origine (nginx relaie `/ia/copilotkit/`) : aucun en-tête CORS n'est nécessaire.
      cors: false,
      activateChannels: false,
      hooks: {
        onRequest: async ({ request }) => {
          const utilisateur = await authentifier(request.headers.get('authorization') ?? '', urlApi);
          await conversations?.noterRun(request, utilisateur);
          const entetes = new Headers(request.headers);
          entetes.set(ENTETE_UTILISATEUR, String(utilisateur));
          return new Request(request, { headers: entetes });
        },
        onBeforeHandler: ({ route }) => {
          if (!ROUTES_SERVIES.has(route.method)) {
            throw new Response(null, { status: 404 });
          }
        },
        onError: ({ error, route }) => {
          journal.error(`Erreur du runtime (${route?.method ?? 'avant routage'}) : ${error instanceof Error ? error.name : 'inconnue'}`);
        }
      }
    })
  );
  return { app, purger: conversations?.purger, fermer: () => runner?.db.close() };
}

/** L'identifiant de l'utilisateur, tel que l'API le lit dans son jeton ; 401 ou 403 sinon, sans détail. */
async function authentifier(autorisation, urlApi) {
  if (!autorisation.startsWith('Bearer ')) {
    throw new Response(null, { status: 401 });
  }
  const reponse = await fetch(`${urlApi}/auth/me`, { headers: { Authorization: autorisation } });
  if (!reponse.ok) {
    throw new Response(null, { status: reponse.status === 403 ? 403 : 401 });
  }
  const { id, permissionsEffectives } = await reponse.json();
  if (!Array.isArray(permissionsEffectives) || !permissionsEffectives.includes('IA_UTILISER')) {
    throw new Response(null, { status: 403 });
  }
  return id;
}
