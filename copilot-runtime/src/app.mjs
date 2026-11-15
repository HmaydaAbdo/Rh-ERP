// Application HTTP du runtime CopilotKit de l'assistant RH (site/docs/ia, T16 et KAN-79) : le gestionnaire Express
// officiel `createCopilotExpressHandler` relaie l'agent AG-UI du service IA et lui applique le middleware A2UI officiel,
// qui fait offrir l'outil `generate_a2ui` et transforme son flux en surfaces affichées par Angular.
//
// Sécurité par les crochets officiels du gestionnaire : `onRequest` authentifie chaque requête auprès de l'API
// (`/auth/me`, droit IA_UTILISER) et répond 401 ou 403 ; `onBeforeHandler` ne sert que les routes de l'assistant et
// réserve chaque fil à son propriétaire (table `thread_owners`, voir proprietaires.mjs). Sans CopilotKit Intelligence,
// le runner SQLite garde les fils de tous les utilisateurs et rien d'autre ne les sépare.
import { HttpAgent } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import { map } from 'rxjs';
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { SqliteAgentRunner } from '@copilotkit/sqlite-runner';
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express';
import express from 'express';
import { ouvrirProprietaires } from './proprietaires.mjs';

/** Routes servies ; toutes les autres (fils, mémoires, inspecteur, transcription, débogage) répondent 404. */
const ROUTES_SERVIES = new Set(['info', 'agent/run', 'agent/suggest', 'agent/connect', 'agent/stop']);
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
 * @param {{ urlAgent: string, urlApi: string, cheminBase?: string, journal?: Pick<Console, 'error'> }} options
 * @returns {{ app: import('express').Express, fermer: () => void }}
 */
export function creerApp({ urlAgent, urlApi, cheminBase, journal = console }) {
  const proprietaires = ouvrirProprietaires(cheminBase);

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
    // Seul le jeton de l'utilisateur est transmis à l'agent (ni `x-*` du navigateur, ni l'en-tête interne).
    forwardHeaders: { allow: ['authorization'] },
    a2ui: { injectA2UITool: true },
    // Historique des conversations : runner SQLite officiel de CopilotKit (reprise d'un fil après rechargement ou redémarrage).
    ...(cheminBase ? { runner: new SqliteAgentRunner({ dbPath: cheminBase }) } : {})
  });

  const app = express();
  app.get('/health', (_requete, reponse) => reponse.type('text/plain').send('ok'));
  app.use(
    createCopilotExpressHandler({
      runtime,
      basePath: '/copilotkit',
      // Même origine (nginx relaie `/ia/copilotkit/`) : aucun en-tête CORS n'est nécessaire.
      cors: false,
      activateChannels: false,
      hooks: {
        onRequest: async ({ request }) => {
          const utilisateur = await authentifier(request, urlApi);
          const entetes = new Headers(request.headers);
          entetes.set(ENTETE_UTILISATEUR, String(utilisateur));
          return new Request(request, { headers: entetes });
        },
        onBeforeHandler: async ({ request, route }) => {
          if (!ROUTES_SERVIES.has(route.method)) {
            throw new Response(null, { status: 404 });
          }
          if (route.method === 'info' || route.method === 'agent/suggest') {
            return;
          }
          const utilisateur = request.headers.get(ENTETE_UTILISATEUR);
          const fil = route.threadId ?? (await request.clone().json().catch(() => ({}))).threadId;
          if (!utilisateur || typeof fil !== 'string' || !fil.startsWith(`u${utilisateur}-`)) {
            throw new Response(null, { status: 403 });
          }
          // Une conversation naît à son premier `run` ; `connect` et `stop` ne reprennent qu'un fil déjà possédé.
          const autorise = route.method === 'agent/run' ? proprietaires.reserver(fil, utilisateur) : proprietaires.possede(fil, utilisateur);
          if (!autorise) {
            throw new Response(null, { status: 403 });
          }
        },
        onError: ({ error, route }) => {
          journal.error(`Erreur du runtime (${route?.method ?? 'avant routage'}) : ${error instanceof Error ? error.name : 'inconnue'}`);
        }
      }
    })
  );
  return { app, fermer: () => proprietaires.fermer() };
}

/** L'identifiant de l'utilisateur, tel que l'API le lit dans son jeton ; 401 ou 403 sinon, sans détail. */
async function authentifier(request, urlApi) {
  const autorisation = request.headers.get('authorization') ?? '';
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
