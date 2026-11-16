import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { AUCUN_FILTRE_CHANTIER, ChantierFiltres } from './chantier-filtres';

const parametres = z.object({
  code: z
    .string()
    .max(50)
    .optional()
    .describe('Code du chantier à rechercher.'),
  designation: z
    .string()
    .max(100)
    .optional()
    .describe('Désignation du chantier à rechercher.'),
  actif: z
    .boolean()
    .nullable()
    .optional()
    .describe(
      'Vrai : chantiers actifs ; faux : inactifs ; null retire le filtre.',
    ),
  reinitialiser: z
    .boolean()
    .optional()
    .describe(
      'Vrai pour effacer tous les filtres avant d’appliquer les autres.',
    ),
});

export type ArgumentsFiltresChantiers = z.infer<typeof parametres>;

export function fusionnerFiltresChantier(
  courants: ChantierFiltres,
  demande: ArgumentsFiltresChantiers,
): ChantierFiltres {
  const base = demande.reinitialiser ? AUCUN_FILTRE_CHANTIER : courants;
  return {
    code: demande.code ?? base.code,
    designation: demande.designation ?? base.designation,
    actif: demande.actif === undefined ? base.actif : demande.actif,
  };
}

/** Outil de la page des chantiers (KAN-270) : l'agent règle les filtres de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresChantiers(
  courants: () => ChantierFiltres,
  appliquer: (filtres: ChantierFiltres) => void,
): FrontendToolConfig<ArgumentsFiltresChantiers> {
  return {
    name: 'chantiers_regler_filtres',
    description:
      'Règle les filtres de la page « Chantiers » actuellement ouverte (code, désignation, actif). À utiliser seulement si l’écran ouvert est la liste des chantiers. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(fusionnerFiltresChantier(courants(), demande));
      return 'Filtres appliqués à la page des chantiers.';
    },
  };
}
