import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

const identifiants = z.array(z.number().int().nonnegative()).max(50);

const parametres = z.object({
  periode: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable()
    .optional()
    .describe('Mois au format AAAA-MM ; null retire le filtre.'),
  nom: z.string().max(100).optional().describe('Nom ou prénom à rechercher.'),
  cin: z.string().max(20).optional().describe('CIN à rechercher.'),
  chantierIds: identifiants.optional().describe('Identifiants des chantiers.'),
  equipeIds: identifiants
    .optional()
    .describe('Identifiants des équipes ; 0 = sans équipe.'),
  fonctionIds: identifiants.optional().describe('Identifiants des fonctions.'),
  reinitialiser: z
    .boolean()
    .optional()
    .describe(
      'Vrai pour effacer tous les filtres avant d’appliquer les autres.',
    ),
});

export type ArgumentsFiltresHeuresSupp = z.infer<typeof parametres>;

const TOUS_VIDES = {
  periode: null,
  nom: null,
  cin: null,
  chantierIds: null,
  equipeIds: null,
  fonctionIds: null,
};

/** Les paramètres d'URL à fusionner : seuls ceux que l'agent précise (tous, vidés d'abord, s'il demande de réinitialiser). */
export function parametresUrlHeuresSupp(
  demande: ArgumentsFiltresHeuresSupp,
): Record<string, string | null> {
  const liste = (ids: number[]): string | null =>
    ids.length > 0 ? ids.join(',') : null;
  return {
    ...(demande.reinitialiser ? TOUS_VIDES : {}),
    ...(demande.periode !== undefined ? { periode: demande.periode } : {}),
    ...(demande.nom !== undefined ? { nom: demande.nom.trim() || null } : {}),
    ...(demande.cin !== undefined ? { cin: demande.cin.trim() || null } : {}),
    ...(demande.chantierIds !== undefined
      ? { chantierIds: liste(demande.chantierIds) }
      : {}),
    ...(demande.equipeIds !== undefined
      ? { equipeIds: liste(demande.equipeIds) }
      : {}),
    ...(demande.fonctionIds !== undefined
      ? { fonctionIds: liste(demande.fonctionIds) }
      : {}),
    page: null,
  };
}

/** Outil de la page des heures supplémentaires (KAN-270) : l'agent règle les filtres de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresHeuresSupp(
  appliquer: (parametresUrl: Record<string, string | null>) => void,
): FrontendToolConfig<ArgumentsFiltresHeuresSupp> {
  return {
    name: 'heures_supp_regler_filtres',
    description:
      'Règle les filtres de la page « Heures supplémentaires » actuellement ouverte (mois, nom, CIN, chantiers, équipes, fonctions). ' +
      'À utiliser seulement si l’écran ouvert est la liste des heures supplémentaires. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(parametresUrlHeuresSupp(demande));
      return 'Filtres appliqués à la page des heures supplémentaires.';
    },
  };
}
