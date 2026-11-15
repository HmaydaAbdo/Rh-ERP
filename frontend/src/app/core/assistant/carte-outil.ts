/**
 * Données de présentation d'une consultation d'outil dans la discussion (KAN-87). Aucune logique métier : le nom
 * technique d'un outil n'est jamais affiché (seul son titre français, lu depuis le serveur), et seuls des critères
 * non personnels sont montrés (jamais un nom, un CIN ni un texte de recherche).
 */

/** Outils internes de l'agent ou de l'interface : leur appel n'est pas une consultation et ne s'affiche pas en carte. */
export const OUTILS_SANS_CARTE: ReadonlySet<string> = new Set([
  'poser_question',
  'generate_a2ui',
  'render_a2ui',
  'write_todos',
  'read_file',
  'write_file',
  'edit_file',
  'copilotkitSuggest'
]);

export type EtatConsultation = 'en-cours' | 'terminee' | 'refusee' | 'echec';

/** Libellés français des critères montrés dans le repli ; tout autre argument est écarté (donnée personnelle possible). */
const CRITERES: Readonly<Record<string, string>> = {
  periode: 'Période',
  periodeReference: 'Période de référence',
  depuis: 'Depuis',
  jusqua: 'Jusqu’à',
  chantierIds: 'Chantiers',
  chantierId: 'Chantier',
  equipeIds: 'Équipes',
  fonctionIds: 'Fonctions',
  dimension: 'Détail par',
  statut: 'Statut'
};
const LISTES: ReadonlySet<string> = new Set(['chantierIds', 'equipeIds', 'fonctionIds']);

export interface Critere {
  libelle: string;
  valeur: string;
}

/** L'état de la consultation d'après l'appel (statut CopilotKit) et le texte du résultat. */
export function etatConsultation(
  statut: 'in-progress' | 'executing' | 'complete',
  resultat: string | undefined
): EtatConsultation {
  if (statut !== 'complete') {
    return 'en-cours';
  }
  const texte = (resultat ?? '').trimStart().toLowerCase();
  if (texte.startsWith('access denied') || texte.startsWith('accès refusé') || texte.startsWith('acces refuse')) {
    return 'refusee';
  }
  return texte.startsWith('error') || texte.startsWith('erreur') || texte.startsWith('l’outil') || texte.startsWith("l'outil")
    ? 'echec'
    : 'terminee';
}

/** Les critères d'appel montrables, en français ; une liste d'identifiants devient un nombre (« 3 sélectionnés »). */
export function criteresMontres(args: Record<string, unknown> | undefined): Critere[] {
  const criteres: Critere[] = [];
  for (const [cle, valeur] of Object.entries(args ?? {})) {
    const libelle = CRITERES[cle];
    if (!libelle || valeur === null || valeur === undefined || valeur === '') {
      continue;
    }
    if (LISTES.has(cle)) {
      const nombre = Array.isArray(valeur) ? valeur.length : String(valeur).split(',').filter(Boolean).length;
      if (nombre > 0) {
        criteres.push({ libelle, valeur: nombre === 1 ? '1 sélectionné' : `${nombre} sélectionnés` });
      }
    } else if (typeof valeur === 'string' || typeof valeur === 'number') {
      criteres.push({ libelle, valeur: String(valeur) });
    }
  }
  return criteres;
}
