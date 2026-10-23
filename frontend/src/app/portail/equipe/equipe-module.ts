import { map } from 'rxjs';

import { critereEmployesDe, criterePaieDe } from '../perimetre/perimetre';
import { chargerToutLeReferentiel, ModulePerimetre } from '../perimetre/perimetre-module';
import { filtreEquipeActif, lireFiltresEquipe, versCriteresEquipe, versParametresEquipe } from './filtres/equipe-filtres';
import { EquipeService } from './services/equipe.service';

/** Ce que le module Équipes apporte aux vues Cartes et Analytique partagées (voir `portail/perimetre/`). */
export function moduleEquipe(equipeService: EquipeService): ModulePerimetre {
  return {
    cle: 'equipe',
    libellePluriel: 'équipes',
    libelleRacine: 'Toutes les équipes',
    dimension: 'EQUIPE',
    ordre: ['EQUIPE', 'CHANTIER', 'FONCTION'],
    route: '/equipes',
    permission: 'EQUIPE_READ',
    parametresListe: (params) => versParametresEquipe(lireFiltresEquipe(params)),
    critereEmployes: (_params, portee) => critereEmployesDe(portee),
    criterePaie: (_params, portee, periode) => criterePaieDe(portee, periode),
    catalogue: {
      filtreActif: (params) => filtreEquipeActif(lireFiltresEquipe(params)),
      charger: (params) => {
        const criteres = versCriteresEquipe(lireFiltresEquipe(params));
        return chargerToutLeReferentiel((page, taille) => equipeService.search(criteres, { page, size: taille, sort: 'code,asc' })).pipe(
          map((equipes) => equipes.map((equipe) => ({ id: equipe.id, code: equipe.code, libelle: equipe.libelle, detail: null, statut: null })))
        );
      },
      lien: (id) => ['/equipes', id]
    }
  };
}
