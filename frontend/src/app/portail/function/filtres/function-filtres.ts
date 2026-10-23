import { ParamMap, Params } from '@angular/router';

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
