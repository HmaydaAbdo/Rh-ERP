import { map } from 'rxjs';

import { critereEmployesDe, criterePaieDe } from '../perimetre/perimetre';
import { chargerToutLeReferentiel, ModulePerimetre } from '../perimetre/perimetre-module';
import { filtreChantierActif, lireFiltresChantier, versCriteresChantier, versParametresChantier } from './filtres/chantier-filtres';
import { libelleStatutChantier } from './models/chantier-statut';
import { ChantierService } from './services/chantier.service';

/** Ce que le module Chantiers apporte aux vues Cartes et Analytique partagées (voir `portail/perimetre/`). */
export function moduleChantier(chantierService: ChantierService): ModulePerimetre {
  return {
    cle: 'chantier',
    libellePluriel: 'chantiers',
    libelleRacine: 'Tous les chantiers',
    dimension: 'CHANTIER',
    ordre: ['CHANTIER', 'EQUIPE', 'FONCTION'],
    ordreAnalytique: ['EMPLOYEE', 'PAIE'],
    route: '/chantiers',
    permission: 'CHANTIER_READ',
    parametresListe: (params) => versParametresChantier(lireFiltresChantier(params)),
    critereEmployes: (_params, portee) => critereEmployesDe(portee),
    criterePaie: (_params, portee, periode) => criterePaieDe(portee, periode),
    catalogue: {
      filtreActif: (params) => filtreChantierActif(lireFiltresChantier(params)),
      charger: (params) => {
        const criteres = versCriteresChantier(lireFiltresChantier(params));
        return chargerToutLeReferentiel((page, taille) => chantierService.search(criteres, { page, size: taille, sort: 'code,asc' })).pipe(
          map((chantiers) =>
            chantiers.map((chantier) => ({
              id: chantier.id,
              code: chantier.code,
              libelle: chantier.nom || chantier.designation,
              detail: chantier.nom ? chantier.designation : null,
              statut: { libelle: libelleStatutChantier(chantier.actif), severite: chantier.actif ? ('success' as const) : ('neutral' as const) }
            }))
          )
        );
      },
      lien: (id) => ['/chantiers', id]
    }
  };
}
