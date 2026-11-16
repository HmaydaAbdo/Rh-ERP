import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { MouvementFiltres } from '../../mouvement/mouvement-filtres';
import { formeFiltresMouvement, fusionnerFiltresMouvement } from '../../mouvement/mouvement-outil-assistant';

const parametres = z.object({
  ...formeFiltresMouvement,
  types: z.array(z.enum(['NOUVELLE_EMBAUCHE', 'RETOUR'])).max(2).optional().describe('Types d’entrée ; liste vide = tous.')
});

export type ArgumentsFiltresEntrants = z.infer<typeof parametres>;

/** Les filtres résultants : ceux de la page, remplacés champ par champ par ce que l'agent précise. */
export function fusionnerFiltresEntrants(courants: MouvementFiltres, demande: ArgumentsFiltresEntrants): MouvementFiltres {
  return fusionnerFiltresMouvement(courants, demande, demande.types);
}

/** Outil de la page des entrants (KAN-287) : l'agent règle le mois et les filtres de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresEntrants(courants: () => MouvementFiltres, appliquer: (filtres: MouvementFiltres) => void): FrontendToolConfig<ArgumentsFiltresEntrants> {
  return {
    name: 'entrants_regler_filtres',
    description:
      'Règle le mois et les filtres de la page « Entrants » actuellement ouverte (mois, nom, CIN, fonctions, chantiers, équipes, types d’entrée). ' +
      'À utiliser seulement si l’écran ouvert est celui des entrants. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(fusionnerFiltresEntrants(courants(), demande));
      return 'Filtres appliqués à la page des entrants.';
    }
  };
}
