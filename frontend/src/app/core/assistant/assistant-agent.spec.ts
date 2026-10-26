import { of } from 'rxjs';
import { vi } from 'vitest';

import { creerAgentIa, URL_AGENT_IA } from './assistant-agent';

// Le client AG-UI réel tire un UUID avec le module `crypto` de Node, absent du navigateur de test : on capte sa configuration.
vi.mock('@ag-ui/client', () => ({
  HttpAgent: class {
    constructor(readonly config: { url: string; fetch: typeof fetch }) {}
    get url() {
      return this.config.url;
    }
    get fetch() {
      return this.config.fetch;
    }
  }
}));

describe('creerAgentIa', () => {
  afterEach(() => vi.unstubAllGlobals());

  function appeler(statuts: number[], jeton: string | null = 'jeton-1') {
    const fetchMock = vi.fn(async () => new Response('{}', { status: statuts.shift() ?? 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = {
      getAccessToken: vi.fn(() => jeton),
      refreshOnce: vi.fn(() => {
        jeton = 'jeton-2';
        return of(true);
      })
    };
    // L'option `fetch` documentée du client AG-UI : on l'appelle comme le fait `HttpAgent` pour chaque requête.
    const agent = creerAgentIa(auth as never) as unknown as { fetch: typeof fetch; url: string };
    return { agent, auth, fetchMock };
  }

  it('cible le point d’entrée AG-UI du service IA', () => {
    expect(appeler([]).agent.url).toBe(URL_AGENT_IA);
  });

  it('ajoute le jeton courant en en-tête Bearer', async () => {
    const { agent, fetchMock } = appeler([200]);

    await agent.fetch('/ia/agui', { method: 'POST', headers: { Accept: 'text/event-stream' } });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Accept: 'text/event-stream', Authorization: 'Bearer jeton-1' });
  });

  it('rafraîchit le jeton puis rejoue la requête une seule fois sur un 401', async () => {
    const { agent, auth, fetchMock } = appeler([401, 200]);

    const reponse = await agent.fetch('/ia/agui', { method: 'POST' });

    expect(reponse.status).toBe(200);
    expect(auth.refreshOnce).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, rejouee] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(rejouee.headers).toMatchObject({ Authorization: 'Bearer jeton-2' });
  });

  it('ne rejoue pas plus d’une fois : un second 401 est rendu tel quel', async () => {
    const { agent, fetchMock } = appeler([401, 401]);

    const reponse = await agent.fetch('/ia/agui', { method: 'POST' });

    expect(reponse.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
