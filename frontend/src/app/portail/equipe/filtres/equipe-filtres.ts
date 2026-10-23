import { ParamMap, Params } from '@angular/router';

import { EquipeSearchCriteria } from '../models/equipe.model';

export interface EquipeFiltres {
  code: string;
  libelle: string;
}

export const AUCUN_FILTRE_EQUIPE: EquipeFiltres = { code: '', libelle: '' };

export function memesFiltresEquipe(a: EquipeFiltres, b: EquipeFiltres): boolean {
  return a.code === b.code && a.libelle === b.libelle;
}

export function lireFiltresEquipe(params: ParamMap): EquipeFiltres {
  return { code: params.get('code') ?? '', libelle: params.get('libelle') ?? '' };
}

export function versParametresEquipe(filtres: EquipeFiltres): Params {
  return { code: filtres.code.trim() || null, libelle: filtres.libelle.trim() || null };
}

/** Les filtres sous forme de critères d'API (`undefined` = pas de filtre sur cette dimension). */
export function versCriteresEquipe(filtres: EquipeFiltres): EquipeSearchCriteria {
  return { code: filtres.code.trim() || undefined, libelle: filtres.libelle.trim() || undefined };
}

/** Vrai si au moins un filtre restreint le référentiel. */
export function filtreEquipeActif(filtres: EquipeFiltres): boolean {
  return filtres.code.trim() !== '' || filtres.libelle.trim() !== '';
}
