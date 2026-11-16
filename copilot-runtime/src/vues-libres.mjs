// Gouvernance des vues libres (KAN-281, KAN-282) : interrupteur d'arrêt à chaud et bornes, lus dans les paramètres de l'API
// à chaque question, donc modifiables depuis l'écran Paramètres sans redéploiement.
//
// Le moteur de rendu reste celui de CopilotKit (`openGenerativeUI`) : ce module ne l'imite pas, il décide seulement ce qui
// parvient au navigateur. C'est un middleware d'agent officiel d'AG-UI (`agent.use`), placé en amont du middleware officiel
// des vues libres : il voit donc ses événements d'activité `open-generative-ui` (un identifiant par vue) et :
//  - interrupteur éteint (ou politique illisible : on ferme) : l'outil `generateSandboxedUi` n'est pas donné à l'agent et
//    toute vue qui arriverait quand même est retirée du flux ;
//  - taille : les événements d'une vue sont mis en mémoire jusqu'à sa fin ; au-delà de la taille permise la vue est jetée
//    sans que le navigateur en ait reçu le moindre morceau (le prix : la vue apparaît d'un bloc, sans affichage progressif) ;
//  - nombre par réponse et fréquence par minute et par utilisateur : la vue en trop est retirée du flux ;
//  - audit (KAN-283) : chaque vue admise est inscrite au journal de l'API (fil et taille, jamais le contenu) AVANT de partir ;
//    si l'inscription échoue, la vue n'est pas montrée.
// La durée d'exécution se borne dans le navigateur (`frontend/src/app/core/assistant/vues-libres.ts`).
import { EventType } from '@ag-ui/core';
import { concatMap, defer, filter, mergeMap, tap } from 'rxjs';

export const OUTIL_VUE_LIBRE = 'generateSandboxedUi';
export const ACTIVITE_VUE_LIBRE = 'open-generative-ui';
const UNE_MINUTE = 60_000;
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
 * @param {{ urlApi: string, journal?: Pick<Console, 'error'>, maintenant?: () => number, inscrire?: (ouverture: { autorisation: string, fil: string, octets: number }) => Promise<void> }} options
 */
export function creerGouverneurVuesLibres({ urlApi, journal = console, maintenant = Date.now, inscrire }) {
  /** Ouvertures acceptées par utilisateur sur la dernière minute. */
  const ouvertures = new Map();

  async function lirePolitique(autorisation) {
    try {
      const reponse = await fetch(`${urlApi}/parametres/vues-libres`, { headers: { Authorization: autorisation }, signal: AbortSignal.timeout(5_000) });
      if (!reponse.ok) {
        return undefined;
      }
      const politique = await reponse.json();
      return politique.actives === true ? politique : undefined;
    } catch {
      return undefined;
    }
  }

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

  function frequenceDepassee(utilisateur, parMinute) {
    const depuis = maintenant() - UNE_MINUTE;
    const recentes = (ouvertures.get(utilisateur) ?? []).filter((instant) => instant > depuis);
    ouvertures.set(utilisateur, recentes);
    return recentes.length >= parMinute;
  }

  /** Le middleware de l'agent d'une requête : `autorisation` et `utilisateur` sont ceux que `onRequest` a vérifiés. */
  return ({ autorisation, utilisateur }) =>
    (input, next) =>
      defer(() => lirePolitique(autorisation)).pipe(
        mergeMap((politique) => {
          if (!politique) {
            // Éteint : ni l'outil, ni les vues.
            const sansOutil = { ...input, tools: (input.tools ?? []).filter((outil) => outil.name !== OUTIL_VUE_LIBRE) };
            const fermes = new Set();
            return next.run(sansOutil).pipe(
              tap((evenement) => evenement.toolCallName === OUTIL_VUE_LIBRE && fermes.add(evenement.toolCallId)),filter((evenement) => !estEvenementDeVue(evenement) && evenement.toolCallName !== OUTIL_VUE_LIBRE && !(evenement.toolCallId && fermes.has(evenement.toolCallId))));
          }
          // Allumé : tous les événements d'une vue (activité et appel d'outil, qui porte le même code) sont mis en mémoire
          // jusqu'à sa fin, puis admis ou refusés d'un bloc.
          const vues = new Map(); // clé de la vue -> { evenements, octets }
          const admises = new Set();
          const refusees = new Set();
          const outils = new Set(); // identifiants d'appels de l'outil
          let acceptees = 0;
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
                if (acceptees >= politique.parReponse || frequenceDepassee(utilisateur, politique.parMinute)) {
                  refusees.add(cle);
                  journal.error('Vue libre refusée : nombre par réponse ou fréquence par minute dépassés.');
                  return [];
                }
                acceptees += 1;
                ouvertures.set(utilisateur, [...(ouvertures.get(utilisateur) ?? []), maintenant()]);
                vue = { evenements: [], octets: 0 };
                vues.set(cle, vue);
              }
              if (estEvenementDeVue(evenement)) {
                vue.octets += OCTETS.encode(JSON.stringify(evenement)).length;
              }
              if (vue.octets > politique.tailleMaxOctets) {
                vues.delete(cle);
                refusees.add(cle);
                journal.error('Vue libre refusée : taille maximale dépassée.');
                return [];
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
        })
      );
}
