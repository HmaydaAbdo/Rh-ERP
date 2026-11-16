import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { MouvementFiltres } from '../../mouvement/mouvement-filtres';
import { formeFiltresMouvement, fusionnerFiltresMouvement } from '../../mouvement/mouvement-outil-assistant';

const parametres = z.object({
  ...formeFiltresMouvement,
  motifs: z.array(z.string().max(60)).max(20).optional().describe('Motifs de sortie (« STC », « Sortie », « NON_PRECISE »…) ; liste vide = tous.')
});

export type ArgumentsFiltresSorties = z.infer<typeof parametres>;

/** Les filtres résultants : ceux de la page, remplacés champ par champ par ce que l'agent précise. */
export function fusionnerFiltresSorties(courants: MouvementFiltres, demande: ArgumentsFiltresSorties): MouvementFiltres {
  return fusionnerFiltresMouvement(courants, demande, demande.motifs);
}

/** Outil de la page STC / Sortie (KAN-287) : l'agent règle le mois et les filtres de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresSorties(courants: () => MouvementFiltres, appliquer: (filtres: MouvementFiltres) => void): FrontendToolConfig<ArgumentsFiltresSorties> {
  return {
    name: 'sorties_regler_filtres',
    description:
      'Règle le mois et les filtres de la page « STC / Sortie » actuellement ouverte (mois, nom, CIN, fonctions, chantiers, équipes, motifs). ' +
      'À utiliser seulement si l’écran ouvert est celui des sorties. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(fusionnerFiltresSorties(courants(), demande));
      return 'Filtres appliqués à la page des sorties.';
    }
  };
}
