import { ParamMap } from '@angular/router';

import { ModulePerimetre } from '../perimetre/perimetre-module';
import { Portee } from '../perimetre/perimetre';
export function moduleHeuresSupp(): ModulePerimetre {
  return {
    cle: 'heures-supp',
    libellePluriel: 'heures supplémentaires',
    libelleRacine: 'Toutes les heures supplémentaires',
    dimension: null,
    ordre: ['CHANTIER', 'EQUIPE', 'FONCTION'],
    ordreAnalytique: ['HEURES_SUP'],
    sourcesAnalytique: ['HEURES_SUP'],
    sansEffectifFichesDansCartes: true,
    cartesHeuresSuppSeules: true,
    route: '/heures-supp',
    permission: 'HEURES_SUP_READ',
    introAnalytique: 'Montants, heures et forfaits consolidés sur le mois sélectionné.',
    parametresListe: (params: ParamMap) => ({ periode: params.get('periode'), chantierIds: params.get('chantierIds'), equipeIds: params.get('equipeIds'), fonctionIds: params.get('fonctionIds'), cin: params.get('cin'), nom: params.get('nom') }),
    critereEmployes: () => ({}),
    criterePaie: () => ({}),
    critereHeuresSupp: (params: ParamMap, portee: Portee, periode: string | null) => ({
      periode: periode ?? undefined,
      chantierIds: portee.chantierIds,
      equipeIds: portee.equipeIds,
      fonctionIds: portee.fonctionIds,
      cin: params.get('cin') ?? undefined,
      nomPrenom: params.get('nom') ?? undefined
    }),
    periodeHeuresSuppRecenteFixe: false
  };
}
