import type { FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

import { AUCUN_FILTRE, EmployeeFiltres } from './employee-filtres';

const identifiants = z.array(z.number().int().nonnegative()).max(50);

/** Ce que l'agent peut demander à la page des employés : les mêmes filtres que la barre, rien d'autre. */
const parametres = z.object({
  nom: z.string().max(100).optional().describe('Nom ou prénom à rechercher.'),
  cin: z.string().max(20).optional().describe('CIN à rechercher.'),
  fonctionIds: identifiants.optional().describe('Identifiants des fonctions.'),
  chantierIds: identifiants
    .optional()
    .describe('Identifiants des chantiers ; 0 = sans affectation courante.'),
  equipeIds: identifiants
    .optional()
    .describe('Identifiants des équipes ; 0 = sans affectation courante.'),
  statut: z
    .enum(['ACTIF', 'INACTIF'])
    .nullable()
    .optional()
    .describe('Statut ; null retire le filtre.'),
  reinitialiser: z
    .boolean()
    .optional()
    .describe(
      'Vrai pour effacer tous les filtres avant d’appliquer les autres.',
    ),
});

export type ArgumentsFiltresEmployes = z.infer<typeof parametres>;

/** Les filtres résultants : ceux de la page, remplacés champ par champ par ce que l'agent précise. */
export function fusionnerFiltres(
  courants: EmployeeFiltres,
  demande: ArgumentsFiltresEmployes,
): EmployeeFiltres {
  const base = demande.reinitialiser ? AUCUN_FILTRE : courants;
  return {
    nomPrenom: demande.nom ?? base.nomPrenom,
    cin: demande.cin ?? base.cin,
    fonctionIds: demande.fonctionIds ?? base.fonctionIds,
    chantierIds: demande.chantierIds ?? base.chantierIds,
    equipeIds: demande.equipeIds ?? base.equipeIds,
    statut: demande.statut === undefined ? base.statut : demande.statut,
  };
}

/**
 * Outil de la page des employés, enregistré côté navigateur (KAN-270, `registerFrontendTool`) : l'agent règle les filtres de la
 * page ouverte, comme l'utilisateur le ferait avec la barre. Il ne change pas de page, ne lit aucune donnée et n'écrit rien :
 * c'est l'état de la vue, visible et réversible par l'utilisateur ; les droits restent ceux de l'écran et du serveur.
 */
export function outilFiltresEmployes(
  courants: () => EmployeeFiltres,
  appliquer: (filtres: EmployeeFiltres) => void,
): FrontendToolConfig<ArgumentsFiltresEmployes> {
  return {
    name: 'employes_regler_filtres',
    description:
      'Règle les filtres de la page « Employés » actuellement ouverte (nom, CIN, fonctions, chantiers, équipes, statut). ' +
      'À utiliser seulement si l’écran ouvert est la liste des employés. Ne change pas de page.',
    parameters: parametres,
    handler: async (demande) => {
      appliquer(fusionnerFiltres(courants(), demande));
      return 'Filtres appliqués à la page des employés.';
    },
  };
}
