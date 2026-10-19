import { jeton } from '../../../shared/ui/chart/chart-theme';

// Mesures des graphiques de la paie ; l'habillage commun (jetons, police, grille…) est dans shared/ui/chart/chart-theme.ts.

/** Ce que mesure un graphique : la couleur suit la mesure (jamais son rang), identique dans tous les graphiques.
 * Le domaine s'en tient aux cinq premiers jetons `--chart-1` à `--chart-5` pour garder une palette professionnelle. */
export type MesureGraphique = 'masse' | 'effectif';

/** Mesures disponibles dans l'évolution : les montants et les effectifs restent sur un seul axe à la fois. */
export type MesureEvolution = MesureGraphique | 'stc' | 'stcMontant';

/** Couleur d'une mesure : la masse salariale est toujours bleue, les bulletins toujours orange (jetons `--chart-1` et `--chart-2`). */
export function couleurMesure(mesure: MesureGraphique): string {
  return jeton(mesure === 'masse' ? '--chart-1' : '--chart-2');
}

/** Couleurs stables des quatre séries de l'évolution, sans multiplier les palettes. */
export function couleurEvolution(mesure: MesureEvolution): string {
  switch (mesure) {
    case 'masse': return jeton('--chart-1');
    case 'effectif': return jeton('--chart-2');
    case 'stc': return jeton('--chart-3');
    case 'stcMontant': return jeton('--chart-4');
  }
}

/** Libellé d'une mesure, tel qu'il apparaît dans les infobulles, les titres et les tableaux de données. */
export function libelleMesure(mesure: MesureGraphique): string {
  return mesure === 'masse' ? 'Masse (DH)' : 'Bulletins';
}

/** Libellés explicites de l'évolution, avec l'unité portée par chaque série. */
export function libelleEvolutionMesure(mesure: MesureEvolution): string {
  switch (mesure) {
    case 'masse': return 'Masse (DH)';
    case 'effectif': return 'Effectif (personnes)';
    case 'stc': return 'STC (personnes)';
    case 'stcMontant': return 'STC (DH)';
  }
}
