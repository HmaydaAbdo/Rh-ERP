import { FILTRES_ECRAN, LIBELLES_DOMAINES } from './ecran-assistant';

/** Nom de l'outil frontend que l'agent appelle pour proposer une vue filtrée (KAN-89). */
export const OUTIL_PROPOSER_VUE = 'proposer_vue';

export interface VueProposee {
  readonly domaine: string;
  readonly libelleDomaine: string;
  /** Adresse relative de l'écran, avec ses filtres. */
  readonly url: string;
  readonly filtres: readonly { cle: string; valeur: string }[];
}

/**
 * Valide la proposition de l'agent : seuls les domaines et filtres connus de l'application passent, les valeurs sont
 * bornées. Les paramètres venus du modèle ne sont jamais de confiance ; l'écran ouvert reste protégé par ses gardes
 * de route et le serveur recontrôle les droits à chaque lecture. Renvoie `null` si la proposition est refusée.
 */
export function validerVue(domaine: unknown, filtres: unknown): VueProposee | null {
  if (typeof domaine !== 'string' || !Object.hasOwn(LIBELLES_DOMAINES, domaine)) {
    return null;
  }
  const retenus: { cle: string; valeur: string }[] = [];
  if (filtres !== undefined && filtres !== null) {
    if (typeof filtres !== 'object' || Array.isArray(filtres)) {
      return null;
    }
    for (const [cle, valeur] of Object.entries(filtres as Record<string, unknown>)) {
      if (!FILTRES_ECRAN.has(cle) || (typeof valeur !== 'string' && typeof valeur !== 'number' && typeof valeur !== 'boolean')) {
        return null;
      }
      const texte = String(valeur);
      if (texte.length > 100) {
        return null;
      }
      retenus.push({ cle, valeur: texte });
    }
  }
  const requete = new URLSearchParams(retenus.map(({ cle, valeur }) => [cle, valeur])).toString();
  return {
    domaine,
    libelleDomaine: LIBELLES_DOMAINES[domaine],
    url: `/${domaine}${requete ? `?${requete}` : ''}`,
    filtres: retenus
  };
}
