import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { FunctionFiltres } from './function-filtres';

const parametres = z.object({
  libelle: z
    .string()
    .max(100)
    .describe(
      'Libellé de la fonction à rechercher ; chaîne vide pour retirer le filtre.',
    ),
});

export type ArgumentsFiltresFonctions = z.infer<typeof parametres>;

/** Outil de la page des fonctions (KAN-270) : l'agent règle le filtre de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresFonctions(
  appliquer: (filtres: FunctionFiltres) => void,
): FrontendToolConfig<ArgumentsFiltresFonctions> {
  return {
    name: 'fonctions_regler_filtres',
    description:
      'Règle le filtre de la page « Fonctions » actuellement ouverte (libellé). À utiliser seulement si l’écran ouvert est la liste des fonctions. Ne change pas de page.',
    parameters: parametres,
    handler: async ({ libelle }) => {
      appliquer({ libelle });
      return 'Filtre appliqué à la page des fonctions.';
    },
  };
}
