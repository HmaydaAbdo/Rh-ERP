import { EmployeeRegroupement } from '../employee/models/employee.model';
import { PaieAnalytique } from '../paie/models/paie.model';
import { formaterVariation } from '../paie/paie-format';
import { ItemCatalogue } from './perimetre-module';
import { Dimension } from './perimetre';

export const LIBELLE_EQUIPE_ORPHELINE = 'Orphelins';

/** Les chiffres de Paie d'un groupe pour le mois affiché. */
export interface ChiffresPaie {
  effectif: number;
  masse: number;
  stc: number;
  stcMontant: number;
}

/** Une carte des vues Cartes : un groupe d'une dimension (un chantier, une équipe, une fonction) avec ses fiches et sa paie. */
export interface GroupeCarte {
  /** `0` = groupe « Orphelins ». */
  id: number;
  code: string | null;
  libelle: string;
  detail: string | null;
  statut: ItemCatalogue['statut'];
  /** Lien vers la fiche, pour un élément du référentiel du module. */
  lien: unknown[] | null;
  fiches: { effectif: number; actifs: number } | null;
  paie: ChiffresPaie | null;
  /** Chiffres du mois contigu pour le même groupe ; `null` = pas de comparaison (jamais comparé à un mois plus ancien). */
  precedent: ChiffresPaie | null;
}

/** Une ligne de répartition de la paie, quelle que soit la dimension. */
export interface LignePaie extends ChiffresPaie {
  id: number;
  code: string | null;
  libelle: string;
}

/** Les groupes de paie d'une dimension, normalisés (`id` nul = équipe orpheline = 0). */
export function lignesPaie(dimension: Dimension, analyse: PaieAnalytique | null): LignePaie[] {
  if (!analyse) {
    return [];
  }
  if (dimension === 'CHANTIER') {
    return analyse.parChantier.map((c) => ({ id: c.id, code: c.code, libelle: c.libelle ?? c.code, effectif: c.effectif, masse: c.masse, stc: c.stc, stcMontant: c.stcMontant }));
  }
  if (dimension === 'EQUIPE') {
    return analyse.parEquipe.map((e) => ({ id: e.id ?? 0, code: e.code ?? null, libelle: e.libelle ?? e.code ?? LIBELLE_EQUIPE_ORPHELINE, effectif: e.effectif, masse: e.masse, stc: e.stc, stcMontant: e.stcMontant }));
  }
  return analyse.parFonction.map((f) => ({ id: f.id, code: null, libelle: f.libelle, effectif: f.effectif, masse: f.masse, stc: f.stc, stcMontant: f.stcMontant }));
}

/** Les équipes sont nommées par leur libellé; les autres référentiels gardent le code. */
export function nomGroupe(dimension: Dimension, groupe: { id: number; code: string | null; libelle: string }): string {
  if (dimension === 'EQUIPE' && groupe.id === 0) {
    return LIBELLE_EQUIPE_ORPHELINE;
  }
  return dimension === 'EQUIPE' ? (groupe.libelle || groupe.code || '') : (groupe.code || groupe.libelle);
}

export interface SourcesGroupes {
  /** Le référentiel du module, quand le niveau est celui de sa dimension. */
  catalogue: ItemCatalogue[] | null;
  /** Vrai : chaque élément du référentiel est une carte, même sans fiche ni bulletin. Faux : il ne fait que décorer (statut, lien) les groupes qui existent. */
  exhaustif: boolean;
  /** Regroupement des fiches Employé (`null` = non disponible : droit absent). */
  fiches: EmployeeRegroupement[] | null;
  /** Lignes de paie du mois affiché (`null` = non disponible). */
  paie: LignePaie[] | null;
  /** Lignes de paie du mois contigu. */
  paiePrecedente: LignePaie[] | null;
  lien: ((id: number) => unknown[]) | null;
}

/**
 * Fusionne les trois sources en une carte par groupe. Avec un référentiel exhaustif, toute ligne du référentiel est une carte
 * (même sans fiche ni bulletin : les chiffres valent alors zéro, ils ne sont jamais inventés). Sinon, une carte existe pour
 * chaque groupe qui a au moins une fiche ou un bulletin, et le référentiel ne fait que la décorer. Les équipes sont triées par libellé.
 */
export function fusionnerGroupes(dimension: Dimension, sources: SourcesGroupes): GroupeCarte[] {
  const parId = new Map<number, GroupeCarte>();
  const carte = (id: number, code: string | null, libelle: string): GroupeCarte => {
    let groupe = parId.get(id);
    if (!groupe) {
      groupe = { id, code, libelle, detail: null, statut: null, lien: null, fiches: null, paie: null, precedent: null };
      parId.set(id, groupe);
    }
    return groupe;
  };

  const exhaustif = sources.exhaustif && sources.catalogue !== null;
  if (exhaustif) {
    for (const element of sources.catalogue!) {
      carte(element.id, element.code, element.libelle);
    }
  }
  for (const fiche of sources.fiches ?? []) {
    if (!exhaustif || parId.has(fiche.id)) {
      carte(fiche.id, fiche.code, fiche.libelle).fiches = { effectif: fiche.effectif, actifs: fiche.actifs };
    }
  }
  for (const ligne of sources.paie ?? []) {
    // « Orphelins » est un groupe Paie valide, même si le catalogue des équipes est exhaustif.
    if (!exhaustif || parId.has(ligne.id) || (dimension === 'EQUIPE' && ligne.id === 0)) {
      carte(ligne.id, ligne.code, ligne.libelle).paie = { effectif: ligne.effectif, masse: ligne.masse, stc: ligne.stc, stcMontant: ligne.stcMontant };
    }
  }
  for (const element of sources.catalogue ?? []) {
    const groupe = parId.get(element.id);
    if (groupe) {
      groupe.code = element.code;
      groupe.libelle = element.libelle;
      groupe.detail = element.detail;
      groupe.statut = element.statut;
      groupe.lien = sources.lien ? sources.lien(element.id) : null;
    }
  }
  const precedentes = new Map((sources.paiePrecedente ?? []).map((ligne) => [ligne.id, ligne]));
  for (const groupe of parId.values()) {
    if (sources.fiches !== null && groupe.fiches === null) groupe.fiches = { effectif: 0, actifs: 0 };
    if (sources.paie !== null && groupe.paie === null) groupe.paie = { effectif: 0, masse: 0, stc: 0, stcMontant: 0 };
    const precedent = sources.paiePrecedente !== null
      ? (precedentes.get(groupe.id) ?? { effectif: 0, masse: 0, stc: 0, stcMontant: 0 })
      : null;
    groupe.precedent = precedent ? { effectif: precedent.effectif, masse: precedent.masse, stc: precedent.stc, stcMontant: precedent.stcMontant } : null;
  }
  return [...parId.values()].sort((a, b) => nomGroupe(dimension, a).localeCompare(nomGroupe(dimension, b), 'fr', { numeric: true }));
}

/** Les quatre comparaisons d'une carte avec le mois contigu : en pourcentage pour les montants, en écart pour les personnes. */
export interface Variations {
  masse: string | null;
  effectif: string | null;
  stc: string | null;
  stcMontant: string | null;
}

const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

function ecartPersonnes(courant: number, precedent: number): string {
  const difference = courant - precedent;
  if (difference === 0) {
    return 'Stable';
  }
  const unite = Math.abs(difference) === 1 ? 'personne' : 'personnes';
  return `${difference > 0 ? '+' : '−'}${FORMAT_ENTIER.format(Math.abs(difference))} ${unite}`;
}

function pourcent(courant: number, precedent: number): string | null {
  if (courant === precedent) {
    return 'Stable';
  }
  return precedent > 0 ? formaterVariation(((courant - precedent) / precedent) * 100) : null;
}

/** Les variations d'une carte par rapport au mois contigu ; `null` sans comparaison possible (jamais un zéro ni une division par zéro). */
export function variations(groupe: GroupeCarte): Variations | null {
  const courant = groupe.paie;
  const precedent = groupe.precedent;
  if (!courant || !precedent) {
    return null;
  }
  return {
    masse: pourcent(courant.masse, precedent.masse),
    effectif: ecartPersonnes(courant.effectif, precedent.effectif),
    stc: ecartPersonnes(courant.stc, precedent.stc),
    stcMontant: pourcent(courant.stcMontant, precedent.stcMontant)
  };
}
