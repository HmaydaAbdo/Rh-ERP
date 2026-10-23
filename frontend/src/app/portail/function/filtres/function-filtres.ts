import { ParamMap, Params } from '@angular/router';

import { FunctionSearchCriteria } from '../models/function.model';

export interface FunctionFiltres {
  libelle: string;
}

export const AUCUN_FILTRE_FUNCTION: FunctionFiltres = { libelle: '' };

export function memesFiltresFunction(a: FunctionFiltres, b: FunctionFiltres): boolean {
  return a.libelle === b.libelle;
}

export function lireFiltresFunction(params: ParamMap): FunctionFiltres {
  return { libelle: params.get('libelle') ?? '' };
}

export function versParametresFunction(filtres: FunctionFiltres): Params {
  return { libelle: filtres.libelle.trim() || null };
}

/** Les filtres sous forme de critères d'API (`undefined` = pas de filtre). */
export function versCriteresFunction(filtres: FunctionFiltres): FunctionSearchCriteria {
  return { libelle: filtres.libelle.trim() || undefined };
}

/** Vrai si un filtre restreint le référentiel. */
export function filtreFunctionActif(filtres: FunctionFiltres): boolean {
  return filtres.libelle.trim() !== '';
}
