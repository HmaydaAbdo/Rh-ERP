import { critereEmployesDe } from '../perimetre/perimetre';
import { ModulePerimetre } from '../perimetre/perimetre-module';
import { lireFiltres, versCriteres, versParametres } from './filtres/employee-filtres';

/**
 * Ce que le module Employés apporte aux vues Cartes et Analytique partagées (voir `portail/perimetre/`). Il n'a pas de
 * référentiel propre : son périmètre est celui de sa barre (chantiers, équipes, fonctions, nom, CIN, statut). Le nom et le CIN
 * s'appliquent aussi aux bulletins ; le statut, propre à la fiche, ne s'applique qu'aux fiches.
 */
export const MODULE_EMPLOYE: ModulePerimetre = {
  cle: 'employee',
  libellePluriel: 'employés',
  libelleRacine: 'Tous les employés',
  dimension: null,
  ordre: ['CHANTIER', 'EQUIPE', 'FONCTION'],
  ordreAnalytique: ['EMPLOYEE', 'PAIE'],
  route: '/employees',
  permission: 'EMPLOYEE_READ',
  sansLienEmployes: true,
  parametresListe: (params) => versParametres(lireFiltres(params)),
  critereEmployes: (params, portee) => ({ ...versCriteres(lireFiltres(params)), ...critereEmployesDe(portee) }),
  criterePaie: (params, portee, periode) => {
    const filtres = lireFiltres(params);
    return {
      nomPrenom: filtres.nomPrenom.trim() || undefined,
      cin: filtres.cin.trim() || undefined,
      periode: periode ?? undefined,
      chantierIds: portee.chantierIds,
      equipeIds: portee.equipeIds,
      fonctionIds: portee.fonctionIds
    };
  },
  noteMouvements: (params) => {
    const filtres = lireFiltres(params);
    return filtres.statut !== null ? 'Le statut de la fiche ne s’applique pas aux mouvements historiques de la paie.' : null;
  }
};
