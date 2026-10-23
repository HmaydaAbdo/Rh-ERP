import { cleIds, DIMENSIONS } from '../perimetre/perimetre';
import { ModulePerimetre } from '../perimetre/perimetre-module';
import { lireFiltres, versCriteres, versParametres } from './filtres/paie-filtres';

/**
 * Ce que le module Paie apporte aux vues Cartes et Analytique partagées (voir `portail/perimetre/`). Il n'a pas de référentiel
 * propre : son périmètre est celui de sa barre (mois, chantiers, équipes, fonctions, nom, CIN). Tant qu'aucun mois n'est
 * choisi, le premier niveau des Cartes est la liste des mois ; le mois se choisit alors dans la barre ou en ouvrant une carte.
 */
export const MODULE_PAIE: ModulePerimetre = {
  cle: 'paie',
  libellePluriel: 'bulletins',
  libelleRacine: 'Toute la paie',
  dimension: null,
  ordre: ['CHANTIER', 'EQUIPE', 'FONCTION'],
  ordreAnalytique: ['PAIE', 'EMPLOYEE'],
  route: '/paie',
  permission: 'PAIE_READ',
  niveauPeriode: true,
  parametresListe: (params) => versParametres(lireFiltres(params)),
  critereEmployes: (params, portee) => {
    const filtres = lireFiltres(params);
    return {
      nomPrenom: filtres.nomPrenom.trim() || undefined,
      cin: filtres.cin.trim() || undefined,
      chantierIds: portee.chantierIds,
      equipeIds: portee.equipeIds,
      fonctionIds: portee.fonctionIds
    };
  },
  criterePaie: (params, portee, periode) => {
    const criteres = versCriteres(lireFiltres(params), false);
    const ids = Object.fromEntries(DIMENSIONS.map((dimension) => [cleIds(dimension), portee[cleIds(dimension)]]));
    return { ...criteres, ...ids, periode: periode ?? undefined };
  }
};
