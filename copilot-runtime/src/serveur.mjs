// Runtime CopilotKit de l'assistant RH (docs/ia.md, T16) : l'architecture officielle de CopilotKit entre Angular et le
// service IA Python. Aucune logique à nous : le runtime relaie l'agent AG-UI du service IA et lui applique le middleware
// A2UI officiel, qui fait offrir l'outil `generate_a2ui` et transforme son flux en surfaces affichées par Angular.
import { HttpAgent } from '@ag-ui/client';
import { CopilotRuntime } from '@copilotkit/runtime/v2';
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 4100);
const urlAgent = obligatoire('IA_AGUI_URL');

const runtime = new CopilotRuntime({
  // Un agent par requête (fabrique officielle) : il porte le jeton de l'utilisateur jusqu'au service IA, qui le fait
  // valider par Spring. Le runtime ne décide d'aucun droit.
  agents: ({ request }) => ({
    default: new HttpAgent({
      url: urlAgent,
      // Le jeton de l'utilisateur suit la requête ; le contexte de trace (traceparent) est ajouté par l'instrumentation officielle.
      headers: { Authorization: request.headers.get('authorization') ?? '' }
    })
  }),
  a2ui: { injectA2UITool: true }
});

const ecouteur = createCopilotNodeListener({
  runtime,
  basePath: '/copilotkit',
  activateChannels: false,
  hooks: {
    // Sans jeton, la requête s'arrête ici (le service IA refuserait de toute façon).
    onRequest: ({ request }) => {
      if (!request.headers.get('authorization')?.startsWith('Bearer ')) {
        throw new Response(null, { status: 401 });
      }
    }
  }
});

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
