import { ParamMap, Params } from '@angular/router';

import { PaieSearchCriteria } from '../models/paie.model';

/**
 * Filtres de la barre commune aux trois vues de la paie. Ils vivent dans l'URL (`?periode=2026-08&nom=ali&cin=ab1
 * &chantierIds=3,4&fonctionIds=7&equipeIds=2`) : tout lien et retour navigateur les conserve, et chaque vue les lit sans
 * passer par un état partagé. Changer de vue par le sélecteur les réinitialise.
 */
export interface PaieFiltres {
  periode: string | null;
  nomPrenom: string;
  cin: string;
  chantierIds: number[];
  fonctionIds: number[];
  equipeIds: number[];
}

export const AUCUN_FILTRE: PaieFiltres = { periode: null, nomPrenom: '', cin: '', chantierIds: [], fonctionIds: [], equipeIds: [] };

const FORMAT_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Les filtres d'une URL ; une valeur invalide (mois mal formé, identifiant non entier ou négatif) est ignorée. */
export function lireFiltres(params: ParamMap): PaieFiltres {
  const periode = params.get('periode') ?? '';
  const ids = (cle: string): number[] =>
    (params.get(cle) ?? '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
  return {
    periode: FORMAT_PERIODE.test(periode) ? periode : null,
    nomPrenom: params.get('nom') ?? '',
    cin: params.get('cin') ?? '',
    chantierIds: ids('chantierIds'),
    fonctionIds: ids('fonctionIds'),
    equipeIds: ids('equipeIds')
  };
}

/** Les filtres sous forme de paramètres d'URL : `null` retire un paramètre vide de l'URL. */
export function versParametres(filtres: PaieFiltres): Params {
  const liste = (ids: number[]): string | null => (ids.length > 0 ? ids.join(',') : null);
  return {
    periode: filtres.periode,
    nom: filtres.nomPrenom.trim() || null,
    cin: filtres.cin.trim() || null,
    chantierIds: liste(filtres.chantierIds),
    fonctionIds: liste(filtres.fonctionIds),
    equipeIds: liste(filtres.equipeIds)
  };
}

/** Les filtres sous forme de critères d'API (`undefined` = pas de filtre sur cette dimension). `avecPeriode: false` pour
 * les écrans qui listent justement les mois. */
export function versCriteres(filtres: PaieFiltres, avecPeriode = true): PaieSearchCriteria {
  const ids = (valeurs: number[]): number[] | undefined => (valeurs.length > 0 ? valeurs : undefined);
  return {
    nomPrenom: filtres.nomPrenom.trim() || undefined,
    cin: filtres.cin.trim() || undefined,
    periode: avecPeriode ? (filtres.periode ?? undefined) : undefined,
    chantierIds: ids(filtres.chantierIds),
    fonctionIds: ids(filtres.fonctionIds),
    equipeIds: ids(filtres.equipeIds)
  };
}
