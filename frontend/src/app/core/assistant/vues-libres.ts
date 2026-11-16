/**
 * Vues libres de l'assistant (KAN-95, décision du propriétaire du 2026-10-31, périmètre fixé le 2026-11-16).
 *
 * Le moteur est celui de CopilotKit (`openGenerativeUI`) : le code HTML, CSS et JavaScript écrit par l'agent s'exécute dans
 * une iframe isolée (`@jetbrains/websandbox`), sans accès à l'origine de l'application. Ce fichier ajoute deux garde-fous
 * qui ne sont pas dans la bibliothèque, par l'emplacement qu'elle prévoit (`OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER`) :
 *
 * 1. **Zéro porte** : la vue ne reçoit aucune fonction de l'hôte (`sandboxFunctions` vide, et l'interface passée au moteur
 *    est vide quoi que la configuration contienne). Elle affiche, elle ne demande rien à l'application.
 * 2. **Durée maximale (KAN-282)** : une vue dont le code ne rend pas la main dans le délai des Paramètres est retirée de
 *    l'écran (l'iframe est détruite). L'interrupteur d'arrêt à chaud et les autres bornes sont appliqués par le runtime.
 * 3. **Politique de contenu** : une balise `Content-Security-Policy` est posée avant tout le code généré. Aucune requête
 *    réseau (`connect-src 'none'`), aucune image ni police externe, aucune navigation de formulaire ; seules deux
 *    bibliothèques de graphiques, à version et chemin exacts, peuvent être chargées depuis un CDN. Le code généré ne peut ni
 *    retirer ni assouplir cette politique.
 */
import type { InjectionToken } from '@angular/core';
import type { OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER } from '@copilotkit/angular';

/** Le moteur d'iframe isolée de la bibliothèque (type non exporté : déduit de son point d'injection). */
type Chargeur = typeof OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER extends InjectionToken<infer T> ? T : never;
type WebsandboxConstructor = Awaited<ReturnType<Chargeur>>;

/** Bibliothèques admises dans une vue libre : adresse exacte, version épinglée. */
export const BIBLIOTHEQUES_ADMISES: readonly string[] = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js',
  'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'
];

/** Politique de contenu de l'iframe : tout est fermé, sauf le script en ligne (nécessaire au moteur) et les deux bibliothèques. */
export const POLITIQUE_CONTENU = [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${BIBLIOTHEQUES_ADMISES.join(' ')}`,
  "style-src 'unsafe-inline'",
  'img-src data:',
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "object-src 'none'"
].join('; ');

const BALISE_POLITIQUE = `<meta http-equiv="Content-Security-Policy" content="${POLITIQUE_CONTENU}">`;

/** Place la politique en tête du document, avant tout script ou ressource du code généré. */
export function avecPolitiqueDeContenu(html: string): string {
  const ouvertureHead = /<head(\s[^>]*)?>/i.exec(html);
  if (ouvertureHead) {
    const fin = ouvertureHead.index + ouvertureHead[0].length;
    return html.slice(0, fin) + BALISE_POLITIQUE + html.slice(fin);
  }
  return `<head>${BALISE_POLITIQUE}</head>${html}`;
}

/**
 * Chargeur du moteur, à fournir sous `OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER` : le moteur officiel, dont la création d'iframe
 * passe par la politique de contenu et ne reçoit aucune fonction de l'hôte.
 */
/** Durée de repli (secondes) si la politique est illisible : celle de départ des Paramètres. */
export const DUREE_MAX_PAR_DEFAUT_SECONDES = 15;

/** La vue ne peut ni garder la main au-delà de `dureeMs` ni survivre à ce délai : l'iframe est détruite et la demande rendue. */
export function avecDureeMaximale<T extends { run: (code: string) => Promise<unknown>; destroy: () => void }>(sandbox: T, dureeMs: number): T {
  let detruite = false;
  const retirer = (): void => {
    if (!detruite) {
      detruite = true;
      console.warn('[Vues libres] durée maximale dépassée : vue retirée.');
      sandbox.destroy();
    }
  };
  return new Proxy(sandbox, {
    get(cible, propriete, receveur) {
      if (propriete === 'run') {
        return (code: string): Promise<unknown> => {
          if (detruite) {
            return Promise.resolve(undefined);
          }
          let minuteur: ReturnType<typeof setTimeout> | undefined;
          const delai = new Promise<undefined>((resolve) => {
            minuteur = setTimeout(() => {
              retirer();
              resolve(undefined);
            }, dureeMs);
          });
          return Promise.race([cible.run(code), delai]).finally(() => clearTimeout(minuteur));
        };
      }
      if (propriete === 'destroy') {
        return (): void => {
          detruite = true;
          cible.destroy();
        };
      }
      return Reflect.get(cible, propriete, receveur) as unknown;
    }
  });
}

export function chargeurVuesLibres(
  dureeMaxSecondes: () => Promise<number> = () => Promise.resolve(DUREE_MAX_PAR_DEFAUT_SECONDES),
  charger: () => Promise<WebsandboxConstructor> = async () => {
    const module = (await import('@jetbrains/websandbox')) as { default: unknown };
    const exporte = module.default as { default?: WebsandboxConstructor };
    return (exporte.default ?? exporte) as WebsandboxConstructor;
  }
): () => Promise<WebsandboxConstructor> {
  return async () => {
    const moteur = await charger();
    const dureeMs = (await dureeMaxSecondes().catch(() => DUREE_MAX_PAR_DEFAUT_SECONDES)) * 1000;
    return new Proxy(moteur, {
      get(cible, propriete, receveur) {
        if (propriete === 'create') {
          return (_interface: unknown, options: { frameContent?: string }) =>
            avecDureeMaximale(
              cible.create({}, { ...options, frameContent: avecPolitiqueDeContenu(options.frameContent ?? '<head></head><body></body>') }),
              dureeMs
            );
        }
        return Reflect.get(cible, propriete, receveur) as unknown;
      }
    });
  };
}
