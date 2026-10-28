import { Page, Request, Route } from '@playwright/test';

/** Chemins proxifiés vers le backend (voir `proxy.conf.js`) : un appel XHR/fetch vers l'un d'eux est une requête d'API. */
const API_PREFIXES = ['/employees', '/functions', '/chantiers', '/equipes', '/paie', '/heures-supp', '/parametres', '/auth', '/users', '/roles', '/permissions', '/logs', '/audit'];

export interface MockUser {
  username: string;
  permissions: string[];
}

export interface PageReponse<T> {
  content: T[];
  page: { size: number; number: number; totalElements: number; totalPages: number };
}

/** Une page de résultats Spring (`Page<T>`), comme l'API la renvoie. */
export function page<T>(content: T[], size = 10, number = 0): PageReponse<T> {
  return { content, page: { size, number, totalElements: content.length, totalPages: Math.max(1, Math.ceil(content.length / size)) } };
}

/** Gestionnaire d'une route simulée : retourne le JSON de la réponse (rien : 204), ou appelle `route` lui-même et retourne `null`. */
export type Handler = (request: Request, route: Route) => unknown;

export interface Mock {
  /** Appels reçus, dans l'ordre : « METHODE /chemin ». */
  calls: string[];
  /** Corps JSON des requêtes d'écriture reçues, par « METHODE /chemin » (texte brut pour un envoi multipart). */
  bodies: Record<string, unknown[]>;
}

export function utilisateur({ username, permissions }: MockUser) {
  return {
    id: 1,
    username,
    email: `${username}@staport.example`,
    actif: true,
    employee: null,
    roles: [{ id: 1, nom: 'Test' }],
    permissionsRefusees: [],
    permissionsEffectives: permissions
  };
}

function correspond(pattern: string, method: string, path: string): boolean {
  const [m, p] = pattern.split(' ');
  return m === method && new RegExp(`^${p.replace(/\*/g, '[^/]+')}$`).test(path);
}

/**
 * Simule l'API : la session (`auth/refresh`) est restaurée si `user` est fourni, sinon refusée (401) ; chaque entrée de `routes`
 * (« METHODE /chemin », `*` pour un segment) répond avec le JSON de son gestionnaire. Une route d'API non programmée répond 404 :
 * le test qui en dépend échoue de façon visible.
 */
export async function mockApi(cible: Page, user: MockUser | null, routes: Record<string, Handler> = {}): Promise<Mock> {
  const mock: Mock = { calls: [], bodies: {} };
  const session = user ? { accessToken: 'jeton-test', utilisateur: utilisateur(user) } : null;

  await cible.route(
    (url) => API_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)),
    async (route) => {
      const request = route.request();
      if (!['xhr', 'fetch'].includes(request.resourceType())) {
        return route.fallback();
      }
      const path = new URL(request.url()).pathname;
      const key = `${request.method()} ${path}`;
      mock.calls.push(key);
      if (request.postData()) {
        // Un envoi de fichier (multipart) est gardé brut : ses parties JSON s'y lisent en texte.
        const multipart = (request.headers()['content-type'] ?? '').includes('multipart/form-data');
        (mock.bodies[key] ??= []).push(multipart ? request.postData() : request.postDataJSON());
      }

      if (key === 'POST /auth/refresh') {
        return session ? route.fulfill({ json: session }) : route.fulfill({ status: 401, json: { message: 'Session expirée' } });
      }
      const pattern = Object.keys(routes).find((candidate) => correspond(candidate, request.method(), path));
      if (!pattern) {
        return route.fulfill({ status: 404, json: { message: `Non simulé : ${key}` } });
      }
      const corps = routes[pattern](request, route);
      if (corps === null) {
        return;
      }
      return corps === undefined ? route.fulfill({ status: 204 }) : route.fulfill({ json: corps });
    }
  );
  return mock;
}
