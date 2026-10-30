// Runtime CopilotKit de l'assistant RH (docs/ia.md, T16) : l'architecture officielle de CopilotKit entre Angular et le
// service IA Python. Le runtime relaie l'agent AG-UI du service IA et lui applique le middleware A2UI officiel, qui fait
// offrir l'outil `generate_a2ui` et transforme son flux en surfaces affichées par Angular.
//
// Sécurité par les crochets officiels du runtime (`onBeforeHandler`, autorisation par route) : sans CopilotKit
// Intelligence, le runner en mémoire garde les fils de tous les utilisateurs et ses routes `/threads` les rendraient à
// quiconque. Chaque requête est donc authentifiée auprès de Spring (`/auth/me`, droit IA_UTILISER), seules les routes de
// l'assistant sont servies, et un fil n'est lu ou prolongé que par son propriétaire (identifiant `u<id>-…`).
import { HttpAgent } from '@ag-ui/client';
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { SqliteAgentRunner } from '@copilotkit/sqlite-runner';
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4100);
const urlAgent = obligatoire('IA_AGUI_URL');
const urlApi = obligatoire('ERP_API_URL').replace(/\/$/, '');
// Historique des conversations : runner SQLite officiel de CopilotKit (reprise d'un fil après rechargement ou redémarrage).
const cheminBase = process.env.THREADS_DB_PATH;

/** Routes servies ; toutes les autres (fils, mémoires, inspecteur, transcription, débogage) répondent 404. */
const ROUTES_SERVIES = new Set(['info', 'agent/run', 'agent/suggest', 'agent/connect', 'agent/stop']);

const runtime = new CopilotRuntime({
  // Un agent par requête (fabrique officielle) : il porte le jeton de l'utilisateur jusqu'au service IA, qui le fait
  // valider par Spring.
  agents: ({ request }) => ({
    default: new HttpAgent({
      url: urlAgent,
      // Le jeton de l'utilisateur suit la requête ; le contexte de trace (traceparent) est ajouté par l'instrumentation officielle.
      headers: {
        Authorization: request.headers.get('authorization') ?? '',
        // Le runtime fixe ce marqueur selon la route officielle. Les suggestions n'ont pas de fil persistant.
        'X-Staport-Stateless-Suggestion': new URL(request.url).pathname.endsWith('/suggest') ? 'true' : 'false'
      }
    })
  }),
  a2ui: { injectA2UITool: true },
  ...(cheminBase ? { runner: new SqliteAgentRunner({ dbPath: cheminBase }) } : {})
});

const ecouteur = createCopilotNodeListener({
  runtime,
  basePath: '/copilotkit',
  activateChannels: false,
  hooks: {
    onBeforeHandler: async ({ request, route }) => {
      if (!ROUTES_SERVIES.has(route.method)) {
        throw new Response(null, { status: 404 });
      }
      const utilisateur = await authentifier(request);
      if (route.method === 'info') {
        return;
      }
      if (route.method !== 'agent/suggest') {
        const fil = route.threadId ?? (await request.clone().json().catch(() => ({}))).threadId;
        if (typeof fil !== 'string' || !fil.startsWith(`u${utilisateur}-`)) {
          throw new Response(null, { status: 403 });
        }
      }
    }
  }
});

/** L'identifiant de l'utilisateur, tel que Spring le lit dans son jeton ; 401 ou 403 sinon, sans détail. */
async function authentifier(request) {
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

createServer((requete, reponse) => {
  if (requete.url === '/health') {
    reponse.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  ecouteur(requete, reponse);
}).listen(port, () => console.log(`Runtime CopilotKit à l'écoute sur le port ${port}`));

function obligatoire(nom) {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error(`${nom} est obligatoire`);
  }
  return valeur;
}
