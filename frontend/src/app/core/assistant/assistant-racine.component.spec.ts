import { of } from 'rxjs';
import { vi } from 'vitest';

import type { LoginResponse } from '../auth/models/auth.model';
import { jetonValide } from './assistant-racine.component';

/** Un JWT non signé dont seul le champ `exp` compte ici. */
function jwt(expDansSecondes: number): string {
  const charge = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expDansSecondes }));
  return `e30.${charge.replace(/=+$/, '')}.signature`;
}

describe('jetonValide', () => {
  function auth(initial: string | null) {
    let jeton = initial;
    return {
      getAccessToken: vi.fn(() => jeton),
      refreshOnce: vi.fn(() => {
        jeton = 'rafraichi';
        return of({} as LoginResponse);
      })
    };
  }

  it('rend le jeton courant tant qu’il n’a pas expiré', async () => {
    const service = auth(jwt(600));

    expect(await jetonValide(service)).toBe(service.getAccessToken());
    expect(service.refreshOnce).not.toHaveBeenCalled();
  });

  it('rafraîchit une fois un jeton expiré ou absent avant l’envoi', async () => {
    const expire = auth(jwt(-5));
    const absent = auth(null);

    expect(await jetonValide(expire)).toBe('rafraichi');
    expect(await jetonValide(absent)).toBe('rafraichi');
    expect(expire.refreshOnce).toHaveBeenCalledTimes(1);
    expect(absent.refreshOnce).toHaveBeenCalledTimes(1);
  });
});
