import { ParamMap, Params } from '@angular/router';

import { EmployeeFiltres, lireFiltres, versCriteres, versParametres } from '../employee/filtres/employee-filtres';
import { EmployeeSearchCriteria } from '../employee/models/employee.model';

/**
 * Le mois et les filtres d'un écran de mouvements (sorties ou entrants), conservés dans l'URL comme ceux des vues des
 * employés : `?periode=2026-03&nom=ali&chantierIds=3&valeurs=STC,ABANDON`. `valeurs` porte le filtre propre à l'écran
 * (motifs pour les sorties, types pour les entrants). Le statut courant ne filtre rien ici : il est toujours vide.
 */
export interface MouvementFiltres {
  periode: string;
  employes: EmployeeFiltres;
  valeurs: string[];
}

/** Corps commun des requêtes de liste et de PDF : le mois, les filtres de l'écran et, sous sa clé, le filtre propre à l'écran. */
export type MouvementRequete = { periode: string } & EmployeeSearchCriteria & Partial<Record<'motifs' | 'types', string[]>>;

const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Les filtres d'une URL ; une période invalide ou absente retombe sur `periodeParDefaut`. */
export function lireMouvementFiltres(params: ParamMap, periodeParDefaut: string): MouvementFiltres {
  const periode = params.get('periode') ?? '';
  return {
    periode: PERIODE.test(periode) ? periode : periodeParDefaut,
    employes: { ...lireFiltres(params), statut: null },
    valeurs: (params.get('valeurs') ?? '')
      .split(',')
      .map((valeur) => valeur.trim())
      .filter((valeur) => valeur !== '')
  };
}

/** Les filtres sous forme de paramètres d'URL : `null` retire un paramètre vide de l'URL. */
export function versParametresMouvement(filtres: MouvementFiltres): Params {
  return {
    ...versParametres({ ...filtres.employes, statut: null }),
    periode: filtres.periode,
    valeurs: filtres.valeurs.length > 0 ? filtres.valeurs.join(',') : null
  };
}

/** Le corps envoyé à l'API, pour la liste comme pour le PDF : ce que l'écran montre est ce que le PDF contient. */
export function versRequete(filtres: MouvementFiltres, cle: 'motifs' | 'types'): MouvementRequete {
  return { periode: filtres.periode, ...versCriteres({ ...filtres.employes, statut: null }), ...(filtres.valeurs.length > 0 ? { [cle]: filtres.valeurs } : {}) };
}

/** Mois courant au format `aaaa-MM`, celui de l'API : le mois affiché par défaut. */
export function moisCourant(maintenant: Date = new Date()): string {
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
}
