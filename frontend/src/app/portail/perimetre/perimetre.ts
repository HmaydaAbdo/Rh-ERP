import { ParamMap, Params } from '@angular/router';

import { EmployeeSearchCriteria } from '../employee/models/employee.model';
import { PaieSearchCriteria } from '../paie/models/paie.model';

/**
 * Socle commun des vues **Cartes** et **Analytique** de tous les modules (Employés, Paie, Équipes, Fonctions, Chantiers).
 *
 * Le *périmètre* est ce que l'on regarde : des chantiers, des équipes, des fonctions (`chantierIds`, `equipeIds`, `fonctionIds`
 * dans l'URL, `0` = sans équipe) et un mois de paie (`periode`). La progression des Cartes suit l'ordre défini par chaque
 * domaine. Les filtres propres à un module (code, nom, statut…) s'ajoutent aux paramètres du périmètre sans jamais les
 * remplacer. Tout vit dans l'URL : lien direct, retour navigateur et passage d'une vue à l'autre restituent donc le même affichage.
 * Voir `conventions/frontend.md`, section « Cartes par niveaux et Analytique graphique ».
 */

export type Dimension = 'CHANTIER' | 'EQUIPE' | 'FONCTION';

/** Niveau des Cartes : un regroupement par dimension, les fiches des employés, ou les mois de paie (module Paie seulement). */
export type Niveau = Dimension | 'EMPLOYES' | 'PERIODE';

export const DIMENSIONS: readonly Dimension[] = ['CHANTIER', 'EQUIPE', 'FONCTION'];

export const LIBELLES_DIMENSIONS: Record<Dimension, string> = { CHANTIER: 'Chantier', EQUIPE: 'Équipe', FONCTION: 'Fonction' };
export const LIBELLES_PLURIELS: Record<Dimension, string> = { CHANTIER: 'chantiers', EQUIPE: 'équipes', FONCTION: 'fonctions' };

const FORMAT_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CleIds = 'chantierIds' | 'equipeIds' | 'fonctionIds';

/** Le paramètre d'URL (et le critère d'API) qui porte les identifiants d'une dimension. */
export function cleIds(dimension: Dimension): CleIds {
  return dimension === 'CHANTIER' ? 'chantierIds' : dimension === 'EQUIPE' ? 'equipeIds' : 'fonctionIds';
}

/** Identifiants retenus par dimension ; `undefined` = pas de restriction sur cette dimension. */
export interface Portee {
  chantierIds?: number[];
  equipeIds?: number[];
  fonctionIds?: number[];
}

export interface Perimetre {
  chantierIds: number[];
  equipeIds: number[];
  fonctionIds: number[];
  periode: string | null;
}

/** Le périmètre d'une URL ; une valeur invalide (identifiant non entier, négatif, mois mal formé) est ignorée. */
export function lirePerimetre(params: ParamMap): Perimetre {
  const ids = (cle: CleIds): number[] =>
    (params.get(cle) ?? '')
      .split(',')
      .map((valeur) => valeur.trim())
      .filter((valeur) => valeur !== '')
      .map(Number)
      .filter((id) => Number.isInteger(id) && (cle === 'equipeIds' ? id >= 0 : id > 0));
  const periode = params.get('periode') ?? '';
  return { chantierIds: ids('chantierIds'), equipeIds: ids('equipeIds'), fonctionIds: ids('fonctionIds'), periode: FORMAT_PERIODE.test(periode) ? periode : null };
}

/** Les identifiants d'une dimension dans le périmètre. */
export function idsDe(perimetre: Perimetre, dimension: Dimension): number[] {
  return perimetre[cleIds(dimension)];
}

/** Une dimension est « choisie » quand le périmètre porte exactement une valeur : c'est une étape du fil. */
export function etapeChoisie(perimetre: Perimetre, dimension: Dimension): number | null {
  const ids = idsDe(perimetre, dimension);
  return ids.length === 1 ? ids[0] : null;
}

/** Les mêmes identifiants sous forme de paramètres d'URL (`null` retire un paramètre vide). */
export function versParametresPerimetre(perimetre: Perimetre): Params {
  const liste = (ids: number[]): string | null => (ids.length > 0 ? ids.join(',') : null);
  return { chantierIds: liste(perimetre.chantierIds), equipeIds: liste(perimetre.equipeIds), fonctionIds: liste(perimetre.fonctionIds), periode: perimetre.periode };
}

/** La portée d'API d'un périmètre : une dimension sans identifiant n'est pas restreinte. */
export function porteeDe(perimetre: Perimetre): Portee {
  const ids = (valeurs: number[]): number[] | undefined => (valeurs.length > 0 ? valeurs : undefined);
  return { chantierIds: ids(perimetre.chantierIds), equipeIds: ids(perimetre.equipeIds), fonctionIds: ids(perimetre.fonctionIds) };
}

/** Une restriction vide (liste de longueur zéro) ne doit jamais partir à l'API : elle y serait lue comme « aucun filtre ». */
export function porteeVide(portee: Portee): boolean {
  return [portee.chantierIds, portee.equipeIds, portee.fonctionIds].some((ids) => ids !== undefined && ids.length === 0);
}

/**
 * Niveau affiché : pour Paie, la liste des mois tant qu'aucun mois n'est choisi ; sinon le premier niveau restant
 * dans la hiérarchie du domaine, puis les fiches Employé si leur lecture est autorisée.
 */
export function niveauAffiche(perimetre: Perimetre, ordre: readonly Dimension[], avecNiveauMois: boolean, fichesPossibles: boolean): Niveau {
  if (avecNiveauMois && perimetre.periode === null) {
    return 'PERIODE';
  }
  return ordre.find((dimension) => etapeChoisie(perimetre, dimension) === null) ?? (fichesPossibles ? 'EMPLOYES' : ordre[ordre.length - 1]);
}

/** Les critères Employés réduits au périmètre (module sans filtre propre). */
export function critereEmployesDe(portee: Portee): EmployeeSearchCriteria {
  return { chantierIds: portee.chantierIds, equipeIds: portee.equipeIds, fonctionIds: portee.fonctionIds };
}

/** Les critères Paie réduits au périmètre et au mois (module sans filtre propre) ; sans mois, tous les mois. */
export function criterePaieDe(portee: Portee, periode: string | null): PaieSearchCriteria {
  return { periode: periode ?? undefined, chantierIds: portee.chantierIds, equipeIds: portee.equipeIds, fonctionIds: portee.fonctionIds };
}
