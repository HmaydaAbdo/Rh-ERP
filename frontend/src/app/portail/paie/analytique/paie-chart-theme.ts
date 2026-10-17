import type { Plugin, TooltipOptions } from 'chart.js';

/**
 * Habillage commun des graphiques. Chart.js dessine dans un canvas et ne lit pas le CSS : on lit donc les Design Tokens
 * (`_tokens.scss`) au moment de construire les données — d'où l'obligation, pour un graphique, de dépendre du thème courant
 * (`ThemeService.theme()`) afin d'être reconstruit à la bascule clair / sombre. Valeur de repli neutre si un token manque.
 */
export function jeton(nom: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || 'gray';
}

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

/** Affiche la valeur au-dessus de chaque point d'une évolution, sans attendre le survol ou le focus. */
export function valeursSurPoints(formater: (valeur: number) => string = (valeur) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(valeur)): Plugin<'line'> {
  return {
    id: 'paie-valeurs-sur-points',
    afterDatasetsDraw(chart) {
      const contexte = chart.ctx;
      contexte.save();
      contexte.fillStyle = jeton('--color-text');
      contexte.font = `500 10px ${jeton('--font-sans')}`;
      contexte.textAlign = 'center';
      contexte.textBaseline = 'bottom';
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const elements = chart.getDatasetMeta(datasetIndex).data;
        (dataset.data as unknown as Array<number | null>).forEach((valeur, index) => {
          const element = elements[index] as unknown as { x: number; y: number } | undefined;
          if (element && typeof valeur === 'number' && Number.isFinite(valeur)) {
            contexte.fillText(formater(valeur), element.x, element.y - 8);
          }
        });
      });
      contexte.restore();
    }
  };
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

/** Police de l'interface (IBM Plex Sans), lue dans les jetons : le texte d'un graphique ressemble au reste de l'écran. */
export function police(taille = 12): { family: string; size: number } {
  return { family: jeton('--font-sans'), size: taille };
}

/** Un utilisateur qui demande moins de mouvement ne voit aucune animation de tracé. */
export function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Animation d'apparition d'un graphique : courte, sans rebond, supprimée si l'utilisateur demande moins de mouvement. */
export function animationGraphique(): false | { duration: number; easing: 'easeOutQuart' } {
  return mouvementReduit() ? false : { duration: 600, easing: 'easeOutQuart' };
}

/** Grille et axes en retrait : un filet discret, jamais de cadre ni de trait d'axe appuyé. */
export function grille(): { color: string; drawTicks: boolean } {
  return { color: jeton('--color-border'), drawTicks: false };
}

/** Infobulle aux couleurs de l'interface : fond de carte, filet, texte principal ; l'identité vient du carré de couleur, pas du texte. */
export function infobulle(): Partial<TooltipOptions<'bar' | 'line'>> {
  return {
    backgroundColor: jeton('--color-surface'),
    borderColor: jeton('--color-border-strong'),
    borderWidth: 1,
    titleColor: jeton('--color-text'),
    bodyColor: jeton('--color-text'),
    titleFont: { ...police(13), weight: 600 },
    bodyFont: police(12),
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4,
    usePointStyle: false
  };
}
