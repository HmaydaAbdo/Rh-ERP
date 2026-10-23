import { ParamMap, Params } from '@angular/router';
import { EMPTY, expand, Observable, reduce } from 'rxjs';

import { Page } from '../../shared/models/page.model';
import { EmployeeSearchCriteria } from '../employee/models/employee.model';
import { PaieSearchCriteria } from '../paie/models/paie.model';
import { Dimension, Portee } from './perimetre';

/** Un élément du référentiel d'un module (un chantier, une équipe, une fonction), tel que les Cartes l'affichent. */
export interface ItemCatalogue {
  id: number;
  /** `null` pour un référentiel sans code (les fonctions n'ont qu'un libellé). */
  code: string | null;
  libelle: string;
  /** Texte secondaire (désignation d'un chantier dont le nom est affiché…). */
  detail: string | null;
  /** Statut métier affiché en pastille (ex. « En cours » / « Clôturé » pour un chantier). */
  statut: { libelle: string; severite: 'success' | 'neutral' } | null;
}

/** Le référentiel d'un module qui en a un : il alimente le premier niveau des Cartes et borne l'Analytique quand un filtre est actif. */
export interface CatalogueModule {
  /** Les filtres propres au module restreignent-ils le référentiel ? */
  filtreActif(params: ParamMap): boolean;
  /** Tous les éléments du référentiel qui satisfont les filtres propres au module. */
  charger(params: ParamMap): Observable<ItemCatalogue[]>;
  /** Lien vers la fiche d'un élément. */
  lien(id: number): unknown[];
}

/**
 * Ce qui distingue un module des autres dans les vues Cartes et Analytique partagées : son référentiel éventuel, les critères
 * d'API que ses filtres propres produisent et la façon de revenir à sa vue Tabulaire. Les composants partagés ne connaissent
 * aucun module : ils ne lisent que cette description.
 */
export interface ModulePerimetre {
  /** Sert de préfixe aux classes CSS et aux identifiants du module (`chantier`, `employee`…). */
  cle: string;
  /** Pluriel en minuscules, pour les phrases (« chantiers »). */
  libellePluriel: string;
  /** Début du fil d'étapes (« Tous les chantiers »). */
  libelleRacine: string;
  /** Dimension du référentiel du module ; `null` pour Employés et Paie, qui n'ont pas de référentiel propre. */
  dimension: Dimension | null;
  /** Hiérarchie de navigation des Cartes, propre au domaine et suivie automatiquement. */
  ordre: readonly Dimension[];
  /** Ordre des sources dans Analytique ; permet de faire commencer chaque domaine par sa question métier principale. */
  ordreAnalytique?: readonly ('EMPLOYEE' | 'PAIE')[];
  /** Titre de la section Employé, adapté au domaine sans spécialiser le composant partagé. */
  libelleSectionEmployes?: string;
  /** Titre du graphique Employé lorsque sa dimension correspond au référentiel du domaine. */
  libelleRepartitionPrincipale?: string;
  /** Route de la vue Tabulaire du module. */
  route: string;
  /** Permission qui ouvre le module. */
  permission: string;
  /** Les paramètres d'URL des filtres propres au module, pour revenir à sa vue Tabulaire (jamais les étapes du périmètre). */
  parametresListe(params: ParamMap): Params;
  /** Critères Employés : le périmètre, plus les filtres propres au module qui s'appliquent aux fiches (nom, CIN, statut…). */
  critereEmployes(params: ParamMap, portee: Portee): EmployeeSearchCriteria;
  /** Critères Paie : le périmètre et le mois (`null` = tous les mois), plus les filtres propres au module qui s'appliquent aux bulletins (nom, CIN…). */
  criterePaie(params: ParamMap, portee: Portee, periode: string | null): PaieSearchCriteria;
  catalogue?: CatalogueModule;
  /** Phrase affichée sous les mouvements de la paie quand des filtres propres au module ne s'y appliquent pas (nom, CIN, statut). */
  noteMouvements?(params: ParamMap): string | null;
  /** Vrai pour le module Employés : le lien « Voir les employés » serait redondant avec « Voir la liste ». */
  sansLienEmployes?: boolean;
  /** Vrai pour le module Paie : tant qu'aucun mois n'est choisi, le premier niveau des Cartes est la liste des mois (et le mois se choisit dans la barre du module). */
  niveauPeriode?: boolean;
}

/** Charge toutes les pages d'une recherche de référentiel (200 éléments par appel) et les concatène. */
export function chargerToutLeReferentiel<T>(chercher: (page: number, taille: number) => Observable<Page<T>>): Observable<T[]> {
  const taille = 200;
  return chercher(0, taille).pipe(
    expand((page) => (page.page.number + 1 < page.page.totalPages ? chercher(page.page.number + 1, taille) : EMPTY)),
    reduce((elements, page) => elements.concat(page.content), [] as T[])
  );
}
