import { HttpAgent } from '@ag-ui/client';
import { firstValueFrom } from 'rxjs';

import type { AuthService } from '../auth/services/auth.service';

/** Point d'entrée AG-UI du service IA, relayé par nginx en production et par `proxy.conf.js` en développement. */
export const URL_AGENT_IA = '/ia/agui';
export const IDENTIFIANT_AGENT = 'default';

/**
 * L'agent AG-UI officiel de l'assistant. Seule l'option `fetch` documentée du client est utilisée : elle ajoute le
 * jeton de connexion courant à chaque requête et, sur un `401` (jeton expiré), le rafraîchit puis rejoue la requête une
 * seule fois, comme le fait l'intercepteur HTTP du reste de l'application.
 */
export function creerAgentIa(auth: Pick<AuthService, 'getAccessToken' | 'refreshOnce'>): HttpAgent {
  const avecJeton = (init: RequestInit): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${auth.getAccessToken() ?? ''}` }
  });
  return new HttpAgent({
    url: URL_AGENT_IA,
    fetch: async (url, init) => {
      const reponse = await fetch(url, avecJeton(init));
      if (reponse.status !== 401) {
        return reponse;
      }
      await firstValueFrom(auth.refreshOnce());
      return fetch(url, avecJeton(init));
    }
  });
}
