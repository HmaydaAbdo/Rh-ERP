import { ParamMap, Params } from '@angular/router';

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
