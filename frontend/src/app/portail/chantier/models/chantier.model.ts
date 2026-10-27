export type NatureChantier = 'AO' | 'DEPOT' | 'EMULSION' | 'CONCASSAGE' | 'POSTE_ENROBE' | 'CENTRALE_A_BETON';

export const NATURE_CHANTIER_LIBELLES: Record<NatureChantier, string> = {
  AO: 'AO', DEPOT: 'Dépôt', EMULSION: 'Émulsion', CONCASSAGE: 'Concassage',
  POSTE_ENROBE: 'Poste d’enrobé', CENTRALE_A_BETON: 'Centrale à béton'
};

export const NATURE_CHANTIER_OPTIONS = (Object.entries(NATURE_CHANTIER_LIBELLES) as [NatureChantier, string][])
  .map(([value, label]) => ({ value, label }));

export function libelleNatureChantier(nature: NatureChantier | null): string {
  return nature ? NATURE_CHANTIER_LIBELLES[nature] : 'À qualifier';
}

export interface ChantierCarte {
  id: number;
  code: string;
  designation: string;
  nom: string | null;
  nature: NatureChantier;
  localisation: string;
  latitude: number;
  longitude: number;
}

export interface Chantier {
  id: number;
  code: string;
  designation: string;
  /** Optionnel, jamais exposé ni modifié par la synchronisation ERP (voir designation) — uniquement
   * saisi/modifié manuellement. Affiché par le rapport PDF/l'export Excel de la paie sous la forme
   * "CHANTIER : <nom> (<code>)" quand renseigné (le nom prime, code en repli sinon). */
  nom: string | null;
  sourceErp: boolean;
  actif: boolean;
  version: number;
  nature: NatureChantier | null;
  localisation: string | null;
  latitude: number | null;
  longitude: number | null;
  afficherSurCarte: boolean;
}

export interface ChantierCreateRequest {
  code: string;
  designation: string;
  nom?: string | null;
  nature: NatureChantier;
  localisation?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  afficherSurCarte: boolean;
}

export interface ChantierUpdateRequest extends ChantierCreateRequest {
  actif: boolean;
  version: number;
}

export interface ChantierSearchCriteria {
  code?: string;
  designation?: string;
  actif?: boolean;
}

export interface ChantierSyncResult {
  totalRecus: number;
  crees: number;
  dejaPresents: number;
  ignores: number;
}
