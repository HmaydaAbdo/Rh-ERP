import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { AUCUN_FILTRE, PaieFiltres } from './paie-filtres';

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
  fonctionIds: identifiants.optional().describe('Identifiants des fonctions.'),
  equipeIds: identifiants
    .optional()
    .describe('Identifiants des équipes ; 0 = sans équipe.'),
  reinitialiser: z
    .boolean()
    .optional()
    .describe(
      'Vrai pour effacer tous les filtres avant d’appliquer les autres.',
    ),
});

export type ArgumentsFiltresPaie = z.infer<typeof parametres>;

/** Les filtres résultants ; `moisRequis` (vue analytique) empêche de retirer le mois. */
export function fusionnerFiltresPaie(
  courants: PaieFiltres,
  demande: ArgumentsFiltresPaie,
  moisRequis: boolean,
): PaieFiltres {
  const base = demande.reinitialiser
    ? { ...AUCUN_FILTRE, periode: moisRequis ? courants.periode : null }
    : courants;
  const periode =
    demande.periode === undefined ? base.periode : demande.periode;
  return {
    periode: periode === null && moisRequis ? base.periode : periode,
    nomPrenom: demande.nom ?? base.nomPrenom,
    cin: demande.cin ?? base.cin,
    chantierIds: demande.chantierIds ?? base.chantierIds,
    fonctionIds: demande.fonctionIds ?? base.fonctionIds,
    equipeIds: demande.equipeIds ?? base.equipeIds,
  };
}

/** Outil de la page de paie (KAN-270) : l'agent règle les filtres de la page ouverte, comme la barre ; ni navigation, ni lecture, ni écriture. */
export function outilFiltresPaie(
  courants: () => PaieFiltres,
  moisRequis: () => boolean,
  appliquer: (filtres: PaieFiltres) => void,
): FrontendToolConfig<ArgumentsFiltresPaie> {
  return {
    name: 'paie_regler_filtres',
    description:
      'Règle les filtres de la page « Paie » actuellement ouverte (mois, nom, CIN, chantiers, fonctions, équipes). À utiliser seulement si l’écran ouvert est la paie. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(fusionnerFiltresPaie(courants(), demande, moisRequis()));
      return 'Filtres appliqués à la page de paie.';
    },
  };
}
