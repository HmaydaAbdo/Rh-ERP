import { map } from 'rxjs';

import { critereEmployesDe, criterePaieDe } from '../perimetre/perimetre';
import { chargerToutLeReferentiel, ModulePerimetre } from '../perimetre/perimetre-module';
import { filtreFunctionActif, lireFiltresFunction, versCriteresFunction, versParametresFunction } from './filtres/function-filtres';
import { FunctionService } from './services/function.service';

/** Ce que le module Fonctions apporte aux vues Cartes et Analytique partagées (voir `portail/perimetre/`). */
export function moduleFunction(functionService: FunctionService): ModulePerimetre {
  return {
    cle: 'function',
    libellePluriel: 'fonctions',
    libelleRacine: 'Toutes les fonctions',
    dimension: 'FONCTION',
    ordre: ['FONCTION', 'CHANTIER', 'EQUIPE'],
    ordreAnalytique: ['EMPLOYEE', 'PAIE'],
    route: '/functions',
    permission: 'FUNCTION_READ',
    parametresListe: (params) => versParametresFunction(lireFiltresFunction(params)),
    critereEmployes: (_params, portee) => critereEmployesDe(portee),
    criterePaie: (_params, portee, periode) => criterePaieDe(portee, periode),
    catalogue: {
      filtreActif: (params) => filtreFunctionActif(lireFiltresFunction(params)),
      charger: (params) => {
        const criteres = versCriteresFunction(lireFiltresFunction(params));
        return chargerToutLeReferentiel((page, taille) => functionService.search(criteres, { page, size: taille, sort: 'libelle,asc' })).pipe(
          map((fonctions) => fonctions.map((fonction) => ({ id: fonction.id, code: null, libelle: fonction.libelle, detail: null, statut: null })))
        );
      },
      lien: (id) => ['/functions', id]
    }
  };
}
