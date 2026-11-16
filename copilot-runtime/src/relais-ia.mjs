// Routes du service IA que le navigateur lit directement : titres des outils (KAN-87), mémoire longue (KAN-84) et fichiers
// de l'espace de l'utilisateur (KAN-267). Le navigateur n'atteint jamais le service IA (réseau `assistant-net` : nginx et
// ce runtime seulement) : le runtime, qui joint le service IA par `runtime-net`, relaie ces routes avec le proxy
// officiel d'Express (`http-proxy-middleware`) après avoir authentifié la requête comme toutes les autres (`/auth/me`,
// droit IA_UTILISER). Le jeton de l'utilisateur est transmis tel quel : le service IA le fait revalider par l'API.
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

/** Préfixe sous lequel nginx publie ces routes (`/ia/outils` devient `/copilotkit/ia/outils`) ; le service IA ne le connaît pas. */
export const PREFIXE_RELAIS_IA = '/copilotkit/ia';
const CHEMINS = ['outils', 'memoire', 'fichiers'].map((route) => `${PREFIXE_RELAIS_IA}/${route}`);

/**
 * @param {{ urlAgent: string, authentifier: (autorisation: string) => Promise<string|number>, journal: Pick<Console,'error'> }} options
 */
export function creerRelaisIa({ urlAgent, authentifier, journal }) {
  const routeur = express.Router();
  routeur.use(CHEMINS, async (requete, reponse, suivant) => {
    try {
      await authentifier(requete.headers.authorization ?? '');
      suivant();
    } catch (refus) {
      reponse.sendStatus(refus instanceof Response ? refus.status : 401);
    }
  });
  routeur.use(
    createProxyMiddleware({
      target: new URL('./', urlAgent).origin,
      // `pathFilter` plutôt que le chemin de `app.use` : le proxy réécrit l'adresse complète (documentation officielle).
      pathFilter: CHEMINS,
      changeOrigin: true,
      pathRewrite: { [`^${PREFIXE_RELAIS_IA}`]: '' },
      on: {
        error: (erreur, _requete, reponse) => {
          journal.error(`Relais du service IA en échec : ${erreur instanceof Error ? erreur.name : 'inconnue'}`);
          if (typeof reponse?.writeHead === 'function' && !reponse.headersSent) {
            reponse.writeHead(502).end();
          }
        }
      }
    })
  );
  return routeur;
}
