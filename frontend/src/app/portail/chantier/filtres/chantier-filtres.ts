import { ParamMap, Params } from '@angular/router';

import { ChantierSearchCriteria } from '../models/chantier.model';

/**
 * Filtres de la barre commune aux trois vues des chantiers. Ils vivent dans l'URL (`?code=C1&designation=route&actif=false`) :
 * tout lien et retour navigateur les conservent, et chaque vue les lit sans passer par un état partagé. `actif` suit l'API
 * (`true` = « En cours », `false` = « Clôturé »).
 */
export interface ChantierFiltres {
  code: string;
  designation: string;
  actif: boolean | null;
}

export const AUCUN_FILTRE_CHANTIER: ChantierFiltres = { code: '', designation: '', actif: null };

export function memesFiltresChantier(a: ChantierFiltres, b: ChantierFiltres): boolean {
  return a.code === b.code && a.designation === b.designation && a.actif === b.actif;
}

/** Les filtres d'une URL ; un statut qui n'est ni `true` ni `false` est ignoré. */
export function lireFiltresChantier(params: ParamMap): ChantierFiltres {
  const actif = params.get('actif');
  return {
    code: params.get('code') ?? '',
    designation: params.get('designation') ?? '',
    actif: actif === 'true' ? true : actif === 'false' ? false : null
  };
}

/** Les filtres sous forme de paramètres d'URL : `null` retire un paramètre vide de l'URL. */
export function versParametresChantier(filtres: ChantierFiltres): Params {
  return {
    code: filtres.code.trim() || null,
    designation: filtres.designation.trim() || null,
    actif: filtres.actif === null ? null : String(filtres.actif)
  };
}

/** Les filtres sous forme de critères d'API (`undefined` = pas de filtre sur cette dimension). */
export function versCriteresChantier(filtres: ChantierFiltres): ChantierSearchCriteria {
  return {
    code: filtres.code.trim() || undefined,
    designation: filtres.designation.trim() || undefined,
    actif: filtres.actif ?? undefined
  };
}

/** Vrai si au moins un filtre restreint le catalogue. */
export function filtreChantierActif(filtres: ChantierFiltres): boolean {
  return filtres.code.trim() !== '' || filtres.designation.trim() !== '' || filtres.actif !== null;
}
