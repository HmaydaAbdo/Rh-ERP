import type { ChartOptions } from 'chart.js';

import { animationGraphique, grille, infobulle, jeton, police } from '../../../shared/ui/chart/chart-theme';
import { EmployeeTranche } from '../../employee/models/employee.model';
import { PaieTranche } from '../../paie/models/paie.model';
import { formaterMontant } from '../../paie/paie-format';

/** Hauteur d'un graphique en barres horizontales : une ligne lisible par catégorie, avec un minimum. */
export function hauteurPourLignes(lignes: number): number {
  return Math.max(10, lignes * 2.2);
}

const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/**
 * Libellé d'une tranche d'âge ou d'ancienneté, dans la notation retenue le 2026-10-19 : les âges en années pleines, borne haute
 * incluse (« 25-34 ans ») ; l'ancienneté de borne à borne (« 1-3 ans » : d'un an à moins de trois). Première et dernière
 * tranches en toutes lettres (« moins de 25 ans », « moins d'un an », « 55 ans et plus »).
 */
export function libelleTranche(tranche: EmployeeTranche, mesure: 'age' | 'anciennete'): string {
  if (tranche.max === null) {
    return `${tranche.min} ans et plus`;
  }
  if (tranche.min === 0) {
    return tranche.max === 1 ? 'moins d’un an' : `moins de ${tranche.max} ans`;
  }
  return `${tranche.min}-${mesure === 'age' ? tranche.max - 1 : tranche.max} ans`;
}

/** Libellé d'une tranche de total de paie : « 1 000 – 2 000 DH », la dernière étant ouverte (« 5 000 DH et plus »). */
export function libelleTrancheTotal(tranche: PaieTranche): string {
  return tranche.max === null ? `${FORMAT_ENTIER.format(tranche.min)} DH et plus` : `${FORMAT_ENTIER.format(tranche.min)} – ${FORMAT_ENTIER.format(tranche.max)} DH`;
}

/** Options communes des barres (verticales, ou horizontales avec `indexAxis: 'y'`), aux couleurs et à la police de l'interface. */
export function optionsBarres(choix: { indexAxis?: 'x' | 'y'; empile?: boolean; legende?: boolean; montants?: boolean }): ChartOptions<'bar'> {
  const texte = jeton('--color-text-muted');
  const formater = choix.montants ? (v: string | number) => `${formaterMontant(Number(v))}` : (v: string | number) => FORMAT_ENTIER.format(Number(v));
  const valeurs = { color: texte, font: police(), callback: formater };
  const categories = { color: texte, font: police(), autoSkip: false, maxRotation: 0 };
  const horizontal = choix.indexAxis === 'y';
  return {
    maintainAspectRatio: false,
    animation: animationGraphique(),
    indexAxis: choix.indexAxis ?? 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: !!choix.legende, position: 'bottom', labels: { color: jeton('--color-text'), font: police(), boxWidth: 12 } },
      tooltip: { ...infobulle() }
    },
    scales: {
      x: horizontal
        ? { stacked: !!choix.empile, beginAtZero: true, ticks: valeurs, grid: grille(), border: { display: false } }
        : { stacked: !!choix.empile, ticks: categories, grid: { display: false }, border: { display: false } },
      y: horizontal
        ? { stacked: !!choix.empile, ticks: categories, grid: { display: false }, border: { display: false } }
        : { stacked: !!choix.empile, beginAtZero: true, grace: '8%', ticks: { ...valeurs, precision: 0 }, grid: grille(), border: { display: false } }
    }
  };
}

/** Options communes des évolutions mensuelles : une seule mesure, un seul axe. */
export function optionsLigne(montants: boolean): ChartOptions<'line'> {
  const texte = jeton('--color-text-muted');
  return {
    maintainAspectRatio: false,
    animation: animationGraphique(),
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { ...infobulle() } },
    scales: {
      x: { ticks: { color: texte, font: police(), autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
      y: {
        grace: '10%',
        ticks: { color: texte, font: police(), precision: 0, callback: (v) => (montants ? formaterMontant(Number(v)) : FORMAT_ENTIER.format(Number(v))) },
        grid: grille(),
        border: { display: false }
      }
    }
  };
}

/** Unité d'une mesure d'effectif ou de masse : un graphique groupé donne un axe à chaque unité (deux au plus). */
export type UniteMesure = 'personnes' | 'dh';

export function uniteDeMesure(mesure: string): UniteMesure {
  return mesure === 'masse' || mesure === 'stcMontant' ? 'dh' : 'personnes';
}

/** Unités présentes dans une sélection de mesures, dans l'ordre de la sélection : la première porte l'axe principal. */
export function unitesDesMesures(mesures: readonly string[]): UniteMesure[] {
  return Array.from(new Set(mesures.map(uniteDeMesure)));
}

/** Identifiant d'axe d'une mesure : `base` pour l'unité principale, `base1` pour la seconde. */
export function axeDeMesure(base: 'x' | 'y', mesure: string, unites: readonly UniteMesure[]): string {
  return unites.indexOf(uniteDeMesure(mesure)) <= 0 ? base : `${base}1`;
}

function axeValeurs(unite: UniteMesure, choix: { principal: boolean; deuxUnites: boolean; position: 'left' | 'right' | 'top' | 'bottom' }) {
  const valeurs = (v: string | number) => (unite === 'dh' ? formaterMontant(Number(v)) : FORMAT_ENTIER.format(Number(v)));
  return {
    type: 'linear' as const,
    position: choix.position,
    beginAtZero: true,
    grace: '8%',
    ticks: { color: jeton('--color-text-muted'), font: police(), precision: 0, callback: valeurs },
    grid: choix.principal ? grille() : { display: false },
    border: { display: false },
    title: choix.deuxUnites
      ? { display: true, text: unite === 'dh' ? 'Montants (DH)' : 'Personnes', color: jeton('--color-text-muted'), font: police() }
      : { display: false }
  };
}

/**
 * Barres horizontales groupées : plusieurs indicateurs côte à côte dans un même graphique, un axe de valeurs par unité
 * (décision du 2026-11-01). Les groupes sont sur l'axe `y`, la première unité sur `x` en bas, la seconde sur `x1` en haut.
 */
export function optionsBarresGroupees(unites: readonly UniteMesure[]): ChartOptions<'bar'> {
  const deuxUnites = unites.length > 1;
  const categories = { color: jeton('--color-text-muted'), font: police(), autoSkip: false, maxRotation: 0 };
  const scales: Record<string, unknown> = {
    y: { ticks: categories, grid: { display: false }, border: { display: false } },
    x: axeValeurs(unites[0] ?? 'personnes', { principal: true, deuxUnites, position: 'bottom' })
  };
  if (deuxUnites) {
    scales['x1'] = axeValeurs(unites[1], { principal: false, deuxUnites, position: 'top' });
  }
  return {
    maintainAspectRatio: false,
    animation: animationGraphique(),
    indexAxis: 'y',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: jeton('--color-text'), font: police(), boxWidth: 12 } },
      tooltip: { ...infobulle() }
    },
    scales: scales as ChartOptions<'bar'>['scales']
  };
}

/** Évolutions mensuelles groupées : une courbe par indicateur, un axe `y` par unité, la seconde à droite. */
export function optionsLigneGroupee(unites: readonly UniteMesure[]): ChartOptions<'line'> {
  const deuxUnites = unites.length > 1;
  const scales: Record<string, unknown> = {
    x: { ticks: { color: jeton('--color-text-muted'), font: police(), autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
    y: axeValeurs(unites[0] ?? 'personnes', { principal: true, deuxUnites, position: 'left' })
  };
  if (deuxUnites) {
    scales['y1'] = axeValeurs(unites[1], { principal: false, deuxUnites, position: 'right' });
  }
  return {
    maintainAspectRatio: false,
    animation: animationGraphique(),
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: jeton('--color-text'), font: police(), boxWidth: 12 } },
      tooltip: { ...infobulle() }
    },
    scales: scales as ChartOptions<'line'>['scales']
  };
}
