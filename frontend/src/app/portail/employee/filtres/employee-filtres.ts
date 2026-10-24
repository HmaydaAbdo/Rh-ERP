import { ParamMap, Params } from '@angular/router';

import { EmployeeSearchCriteria, EmployeeStatut } from '../models/employee.model';

/**
 * Filtres de la barre commune aux vues des employés. Ils vivent dans l'URL (`?nom=ali&cin=ab1&fonctionIds=7&chantierIds=3,4
 * &equipeIds=2&statut=ACTIF`) : tout lien et retour navigateur les conserve, et chaque vue les lit sans passer par un état partagé.
 */
export interface EmployeeFiltres {
  nomPrenom: string;
  cin: string;
  fonctionIds: number[];
  chantierIds: number[];
  /** `0` = sans affectation courante (chantier ou équipe). */
  equipeIds: number[];
  statut: EmployeeStatut | null;
}

export const AUCUN_FILTRE: EmployeeFiltres = { nomPrenom: '', cin: '', fonctionIds: [], chantierIds: [], equipeIds: [], statut: null };

const STATUTS: readonly EmployeeStatut[] = ['ACTIF', 'INACTIF'];

/** Deux jeux de filtres de même contenu (les tableaux sont comparés par valeur, pas par référence). */
export function memesFiltres(a: EmployeeFiltres, b: EmployeeFiltres): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Les filtres d'une URL ; une valeur invalide (identifiant non entier ou négatif, statut inconnu) est ignorée. */
export function lireFiltres(params: ParamMap): EmployeeFiltres {
  const ids = (cle: string): number[] =>
    (params.get(cle) ?? '')
      .split(',')
      .map((valeur) => valeur.trim())
      .filter((valeur) => valeur !== '')
      .map(Number)
      .filter((id) => Number.isInteger(id) && (cle === 'equipeIds' || cle === 'chantierIds' ? id >= 0 : id > 0));
  const statut = params.get('statut');
  return {
    nomPrenom: params.get('nom') ?? '',
    cin: params.get('cin') ?? '',
    fonctionIds: ids('fonctionIds'),
    chantierIds: ids('chantierIds'),
    equipeIds: ids('equipeIds'),
    statut: STATUTS.find((s) => s === statut) ?? null
  };
}

/** Les filtres sous forme de paramètres d'URL : `null` retire un paramètre vide de l'URL. */
export function versParametres(filtres: EmployeeFiltres): Params {
  const liste = (ids: number[]): string | null => (ids.length > 0 ? ids.join(',') : null);
  return {
    nom: filtres.nomPrenom.trim() || null,
    cin: filtres.cin.trim() || null,
    fonctionIds: liste(filtres.fonctionIds),
    chantierIds: liste(filtres.chantierIds),
    equipeIds: liste(filtres.equipeIds),
    statut: filtres.statut
  };
}

/** Les filtres sous forme de critères d'API (`undefined` = pas de filtre sur cette dimension). */
export function versCriteres(filtres: EmployeeFiltres): EmployeeSearchCriteria {
  const ids = (valeurs: number[]): number[] | undefined => (valeurs.length > 0 ? valeurs : undefined);
  return {
    nomPrenom: filtres.nomPrenom.trim() || undefined,
    cin: filtres.cin.trim() || undefined,
    fonctionIds: ids(filtres.fonctionIds),
    chantierIds: ids(filtres.chantierIds),
    equipeIds: ids(filtres.equipeIds),
    statut: filtres.statut ?? undefined
  };
}
