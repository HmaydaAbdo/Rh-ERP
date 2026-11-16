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
import { creerRelaisIa } from './relais-ia.mjs';
import { creerGouverneurVuesLibres } from './vues-libres.mjs';

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
 * Agent AG-UI du service IA qui déclare ses capacités (KAN-270) : le runtime les publie dans `/info` (`getCapabilities`, point
 * d'extension officiel du client AG-UI) et le navigateur les lit avec `injectCapabilities`. Les pièces jointes (images, PDF,
 * fichiers) ne sont annoncées que si le service IA les accepte pour cet utilisateur (antivirus joignable, `IA_PIECES_JOINTES`) ;
 * une panne du service laisse la déclaration vide, donc les pièces jointes fermées.
 */
class AgentServiceIa extends HttpAgent {
  #urlCapacites;
  #autorisation;

  constructor(config, { urlAgent, autorisation }) {
    super(config);
    this.#urlCapacites = new URL('/capacites', urlAgent);
    this.#autorisation = autorisation;
  }

  async getCapabilities() {
    try {
      const reponse = await fetch(this.#urlCapacites, { headers: { authorization: this.#autorisation }, signal: AbortSignal.timeout(10_000) });
      const { piecesJointes } = reponse.ok ? await reponse.json() : {};
      return piecesJointes === true ? { multimodal: { input: { image: true, pdf: true, file: true } } } : {};
    } catch {
      return {};
    }
  }
}

/**
 * @param {{ urlAgent: string, urlApi: string, cheminBase?: string, journal?: Pick<Console, 'error'>, stt?: { url: string, modele: string, langue?: string } }} options
 * @returns {{ app: import('express').Express, purger?: (jours: number) => number, fermer: () => void }}
 */
export function creerApp({ urlAgent, urlApi, cheminBase, journal = console, stt }) {
  const gouverneur = creerGouverneurVuesLibres({ urlApi, journal });
  const runner = cheminBase ? new SqliteAgentRunner({ dbPath: cheminBase }) : undefined;
  const runtime = new CopilotRuntime({
    // Un agent par requête (fabrique officielle) : le jeton de l'utilisateur lui est transmis par `forwardHeaders`
    // et le service IA le fait valider par l'API.
    agents: ({ request }) => ({
      default: new AgentServiceIa(
        {
          url: urlAgent,
          // En-tête fixé par le serveur : il l'emporte sur tout en-tête transmis. Les suggestions n'ont pas de fil persistant.
          headers: { 'X-Staport-Stateless-Suggestion': new URL(request.url).pathname.endsWith('/suggest') ? 'true' : 'false' }
        },
        { urlAgent, autorisation: request.headers.get('authorization') ?? '' }
      )
        .use(masquerSkills)
        .use(gouverneur({ autorisation: request.headers.get('authorization') ?? '' }))
    }),
    // L'utilisateur vérifié par `onRequest` : chaque fil appartient à celui dont la requête l'a créé.
    identifyUser: (request) => ({ id: request.headers.get(ENTETE_UTILISATEUR) ?? '' }),
    // Seul le jeton de l'utilisateur est transmis à l'agent (ni `x-*` du navigateur, ni l'en-tête interne).
    forwardHeaders: { allow: ['authorization'] },
    a2ui: { injectA2UITool: true },
    // Vues libres (KAN-95) : le middleware officiel transforme l'outil `generateSandboxedUi` de l'agent en vue affichée dans une
    // iframe isolée. Toujours actif (décision du propriétaire, 2026-11-16) ; le navigateur n'accorde à la vue aucune fonction de l'hôte.
    openGenerativeUI: { agents: ['default'] },
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
  // Titres des outils, mémoire longue et fichiers (KAN-87, KAN-84, KAN-267) : routes du service IA relayées au navigateur.
  app.use(creerRelaisIa({ urlAgent, authentifier: (autorisation) => authentifier(autorisation, urlApi), journal }));
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
