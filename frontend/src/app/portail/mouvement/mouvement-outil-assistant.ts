import { z } from 'zod';

import { AUCUN_FILTRE } from '../employee/filtres/employee-filtres';
import { MouvementFiltres } from './mouvement-filtres';

const identifiants = z.array(z.number().int().nonnegative()).max(50);

/** Les filtres que la barre commune aux écrans de mouvements propose ; chaque domaine y ajoute le sien (types ou motifs). */
export const formeFiltresMouvement = {
  periode: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .describe('Mois affiché au format aaaa-MM, par exemple 2026-09.'),
  nom: z.string().max(100).optional().describe('Nom ou prénom à rechercher.'),
  cin: z.string().max(20).optional().describe('CIN à rechercher.'),
  fonctionIds: identifiants.optional().describe('Identifiants des fonctions.'),
  chantierIds: identifiants.optional().describe('Identifiants des chantiers ; 0 = sans affectation courante.'),
  equipeIds: identifiants.optional().describe('Identifiants des équipes ; 0 = sans affectation courante.'),
  reinitialiser: z.boolean().optional().describe('Vrai pour effacer les filtres (le mois reste celui de la page) avant d’appliquer les autres.')
};

export interface DemandeFiltresMouvement {
  periode?: string;
  nom?: string;
  cin?: string;
  fonctionIds?: number[];
  chantierIds?: number[];
  equipeIds?: number[];
  reinitialiser?: boolean;
}

/** Les filtres résultants : ceux de la page, remplacés champ par champ par ce que l'agent précise. `valeurs` est celui du domaine. */
export function fusionnerFiltresMouvement(courants: MouvementFiltres, demande: DemandeFiltresMouvement, valeurs: string[] | undefined): MouvementFiltres {
  const base = demande.reinitialiser ? { ...courants, employes: AUCUN_FILTRE, valeurs: [] } : courants;
  return {
    periode: demande.periode ?? base.periode,
    employes: {
      nomPrenom: demande.nom ?? base.employes.nomPrenom,
      cin: demande.cin ?? base.employes.cin,
      fonctionIds: demande.fonctionIds ?? base.employes.fonctionIds,
      chantierIds: demande.chantierIds ?? base.employes.chantierIds,
      equipeIds: demande.equipeIds ?? base.employes.equipeIds,
      statut: null
    },
    valeurs: valeurs ?? base.valeurs
  };
}
