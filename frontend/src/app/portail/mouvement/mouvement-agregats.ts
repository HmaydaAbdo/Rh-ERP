/**
 * Une ligne de mouvement (un entrant ou une sortie) ramenée à ce que les vues Cartes et Analytique regroupent : l'affectation
 * (chantier, équipe, fonction), la catégorie propre au domaine (type d'entrée ou motif de sortie) et le montant du bulletin.
 * Les agrégats sont calculés sur la liste du mois que l'API renvoie déjà : aucune route d'agrégat n'est nécessaire.
 */
export interface LigneMouvement {
  employeId: number;
  nomPrenom: string;
  /** Libellé de la catégorie : « Nouvelle embauche », « Retour », « STC »… */
  categorie: string;
  /** Valeur de la catégorie dans l'API et dans l'URL (`NOUVELLE_EMBAUCHE`, `STC`, `NON_PRECISE`…), pour filtrer la liste. */
  categorieCle: string;
  chantierId?: number | null;
  chantier?: string | null;
  equipeId?: number | null;
  equipe?: string | null;
  fonctionId?: number | null;
  fonction?: string | null;
  /** Montant du bulletin (réservé aux utilisateurs qui lisent la paie) ; `null` sinon. */
  montant?: number | null;
}

export type DimensionMouvement = 'chantier' | 'equipe' | 'fonction' | 'categorie';

export const LIBELLES_DIMENSION: Record<DimensionMouvement, string> = {
  chantier: 'Chantier',
  equipe: 'Équipe',
  fonction: 'Fonction',
  categorie: 'Catégorie'
};

export interface CompteCategorie {
  categorie: string;
  nombre: number;
}

export interface GroupeMouvement {
  cle: string;
  libelle: string;
  /** Ce qui sélectionne ce groupe dans la barre de filtres : identifiant d'affectation (`0` = sans affectation) ou valeur de catégorie. */
  filtre: { dimension: DimensionMouvement; valeur: number | string };
  nombre: number;
  /** Somme des montants connus ; `null` quand aucun montant n'est visible. */
  montant: number | null;
  parCategorie: CompteCategorie[];
  lignes: LigneMouvement[];
}

const SANS_AFFECTATION: Record<DimensionMouvement, string> = {
  chantier: 'Sans chantier',
  equipe: 'Sans équipe',
  fonction: 'Sans fonction',
  categorie: 'Non précisé'
};

function libelleDe(ligne: LigneMouvement, dimension: DimensionMouvement): string {
  const valeur = dimension === 'categorie' ? ligne.categorie : ligne[dimension];
  return valeur?.trim() ? valeur : SANS_AFFECTATION[dimension];
}

function valeurFiltre(ligne: LigneMouvement, dimension: DimensionMouvement): number | string {
  switch (dimension) {
    case 'chantier':
      return ligne.chantierId ?? 0;
    case 'equipe':
      return ligne.equipeId ?? 0;
    case 'fonction':
      return ligne.fonctionId ?? 0;
    default:
      return ligne.categorieCle;
  }
}

/** Compte les lignes par catégorie, la plus fréquente d'abord puis par ordre alphabétique. */
export function compterParCategorie(lignes: readonly LigneMouvement[]): CompteCategorie[] {
  const comptes = new Map<string, number>();
  for (const ligne of lignes) {
    comptes.set(ligne.categorie, (comptes.get(ligne.categorie) ?? 0) + 1);
  }
  return [...comptes]
    .map(([categorie, nombre]) => ({ categorie, nombre }))
    .sort((a, b) => b.nombre - a.nombre || a.categorie.localeCompare(b.categorie, 'fr'));
}

/** Somme des montants connus d'un ensemble de lignes ; `null` quand aucune ligne n'en porte (paie non lisible). */
export function sommeMontants(lignes: readonly LigneMouvement[]): number | null {
  const montants = lignes.map((ligne) => ligne.montant).filter((montant): montant is number => montant !== null && montant !== undefined);
  return montants.length > 0 ? montants.reduce((a, b) => a + b, 0) : null;
}

/** Regroupe les lignes selon une dimension ; les groupes les plus nombreux viennent d'abord, puis l'ordre alphabétique. */
export function grouperMouvements(lignes: readonly LigneMouvement[], dimension: DimensionMouvement): GroupeMouvement[] {
  const groupes = new Map<string, LigneMouvement[]>();
  for (const ligne of lignes) {
    const libelle = libelleDe(ligne, dimension);
    groupes.set(libelle, [...(groupes.get(libelle) ?? []), ligne]);
  }
  return [...groupes]
    .map(([libelle, membres]) => ({
      cle: `${dimension}:${libelle}`,
      libelle,
      filtre: { dimension, valeur: valeurFiltre(membres[0], dimension) },
      nombre: membres.length,
      montant: sommeMontants(membres),
      parCategorie: compterParCategorie(membres),
      lignes: membres
    }))
    .sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle, 'fr'));
}
