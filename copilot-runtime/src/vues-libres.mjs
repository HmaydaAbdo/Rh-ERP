// Audit des vues libres (KAN-283). Les vues libres sont toujours actives, sans interrupteur ni plafond (décision du propriétaire,
// 2026-11-16) : ce module ne décide plus de ce qui parvient au navigateur, il inscrit chaque ouverture au journal.
//
// Le moteur de rendu reste celui de CopilotKit (`openGenerativeUI`) : ce module ne l'imite pas. C'est un middleware d'agent
// officiel d'AG-UI (`agent.use`), placé en amont du middleware officiel des vues libres : il voit donc ses événements d'activité
// `open-generative-ui` (un identifiant par vue). Les événements d'une vue sont mis en mémoire jusqu'à sa fin ; la vue est alors
// inscrite au journal de l'API (fil et taille, jamais le contenu) AVANT de partir, et si l'inscription échoue elle n'est pas montrée
// (le prix : la vue apparaît d'un bloc, sans affichage progressif).
import { EventType } from '@ag-ui/core';
import { concatMap, mergeMap } from 'rxjs';

export const OUTIL_VUE_LIBRE = 'generateSandboxedUi';
export const ACTIVITE_VUE_LIBRE = 'open-generative-ui';
const OCTETS = new TextEncoder();

const estEvenementDeVue = (evenement) =>
  (evenement.type === EventType.ACTIVITY_SNAPSHOT || evenement.type === EventType.ACTIVITY_DELTA) && evenement.activityType === ACTIVITE_VUE_LIBRE;

/** La vue est complète quand le moteur officiel marque `generating` à faux. */
const estFinDeVue = (evenement) =>
  evenement.type === EventType.ACTIVITY_DELTA && evenement.patch?.some((operation) => operation.path === '/generating' && operation.value === false);

/** La clé d'une vue : l'identifiant de l'appel d'outil, commun à son activité (`<id>-activity`) et à ses événements d'outil. */
function cleDeVue(evenement, outils) {
  if (estEvenementDeVue(evenement)) {
    return String(evenement.messageId).replace(/-activity$/, '');
  }
  return evenement.toolCallId && outils.has(evenement.toolCallId) ? evenement.toolCallId : undefined;
}

/**
 * @param {{ urlApi: string, journal?: Pick<Console, 'error'>, inscrire?: (ouverture: { autorisation: string, fil: string, octets: number }) => Promise<void> }} options
 */
export function creerGouverneurVuesLibres({ urlApi, journal = console, inscrire }) {
  /** Inscription au journal d'audit de l'API, avec le jeton de l'utilisateur ; lève si elle échoue. */
  const inscrireOuverture =
    inscrire ??
    (async ({ autorisation, fil, octets }) => {
      const reponse = await fetch(`${urlApi}/parametres/vues-libres/ouvertures`, {
        method: 'POST',
        headers: { Authorization: autorisation, 'content-type': 'application/json' },
        body: JSON.stringify({ fil, octets }),
        signal: AbortSignal.timeout(5_000)
      });
      if (!reponse.ok) {
        throw new Error(`audit ${reponse.status}`);
      }
    });

  /** Le middleware de l'agent d'une requête : `autorisation` est celle que `onRequest` a vérifiée. */
  return ({ autorisation }) =>
    (input, next) => {
      // Tous les événements d'une vue (activité et appel d'outil, qui porte le même code) sont mis en mémoire jusqu'à sa fin,
      // puis admis ou refusés d'un bloc.
      const vues = new Map(); // clé de la vue -> { evenements, octets }
      const admises = new Set();
      const refusees = new Set();
      const outils = new Set(); // identifiants d'appels de l'outil
      return next.run(input).pipe(
        concatMap(async (evenement) => {
          if (evenement.type === EventType.TOOL_CALL_START && evenement.toolCallName === OUTIL_VUE_LIBRE) {
            outils.add(evenement.toolCallId);
          }
          const cle = cleDeVue(evenement, outils);
          if (!cle) {
            return [evenement];
          }
          if (refusees.has(cle)) {
            return [];
          }
          if (admises.has(cle)) {
            return [evenement];
          }
          let vue = vues.get(cle);
          if (!vue) {
            vue = { evenements: [], octets: 0 };
            vues.set(cle, vue);
          }
          if (estEvenementDeVue(evenement)) {
            vue.octets += OCTETS.encode(JSON.stringify(evenement)).length;
          }
          vue.evenements.push(evenement);
          if (!estFinDeVue(evenement)) {
            return [];
          }
          vues.delete(cle);
          admises.add(cle);
          try {
            await inscrireOuverture({ autorisation, fil: input.threadId, octets: vue.octets });
          } catch {
            admises.delete(cle);
            refusees.add(cle);
            journal.error('Vue libre refusée : inscription au journal d’audit impossible.');
            return [];
          }
          return vue.evenements;
        }),
        mergeMap((evenements) => evenements)
      );
    };
}
