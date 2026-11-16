import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { AUCUN_FILTRE_EQUIPE, EquipeFiltres } from './equipe-filtres';

const parametres = z.object({
  code: z
    .string()
    .max(50)
    .optional()
    .describe('Code de l’équipe à rechercher.'),
  libelle: z
    .string()
    .max(100)
    .optional()
    .describe('Libellé de l’équipe à rechercher.'),
  reinitialiser: z
    .boolean()
    .optional()
    .describe(
      'Vrai pour effacer tous les filtres avant d’appliquer les autres.',
    ),
});

export type ArgumentsFiltresEquipes = z.infer<typeof parametres>;

export function fusionnerFiltresEquipe(
  courants: EquipeFiltres,
  demande: ArgumentsFiltresEquipes,
): EquipeFiltres {
  const base = demande.reinitialiser ? AUCUN_FILTRE_EQUIPE : courants;
  return {
    code: demande.code ?? base.code,
    libelle: demande.libelle ?? base.libelle,
  };
}

/** Outil de la page des équipes (KAN-270) : l'agent règle les filtres de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresEquipes(
  courants: () => EquipeFiltres,
  appliquer: (filtres: EquipeFiltres) => void,
): FrontendToolConfig<ArgumentsFiltresEquipes> {
  return {
    name: 'equipes_regler_filtres',
    description:
      'Règle les filtres de la page « Équipes » actuellement ouverte (code, libellé). À utiliser seulement si l’écran ouvert est la liste des équipes. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(fusionnerFiltresEquipe(courants(), demande));
      return 'Filtres appliqués à la page des équipes.';
    },
  };
}
