import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';

import { ThemeService } from '../../../core/theme/theme.service';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { animationGraphique, grille, infobulle, jeton, police } from '../../../shared/ui/chart/chart-theme';
import { couleurMesure } from '../analytique/paie-chart-theme';
import { PaieParcours, PaieParcoursEvenementType } from '../models/paie.model';
import { formaterMontant, libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';

type Evenement = PaieParcours['evenements'][number];

const ICONES: Record<PaieParcoursEvenementType, string> = {
  ENTREE: 'user-plus',
  CHANGEMENT_CHANTIER: 'building',
  CHANGEMENT_FONCTION: 'briefcase',
  CHANGEMENT_EQUIPE: 'users',
  CHANGEMENT_SALAIRE: 'wallet',
  DEPART: 'log-out',
  RETOUR: 'user-check'
};

const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/**
 * Parcours d'un employé tel que sa paie le raconte (voir `PaieParcoursService` côté serveur) : quelques chiffres, la
 * chronologie de ses changements (affectations, salaire, départs, retours), l'évolution de ce qu'il a perçu et ses bulletins.
 * Réservé à `PAIE_READ` : la fiche employé ne l'affiche qu'avec cette permission.
 */
@Component({
  selector: 'app-paie-parcours',
  imports: [DecimalPipe, RouterLink, ChartComponent, IconComponent],
  templateUrl: './paie-parcours.component.html',
  styleUrl: './paie-parcours.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieParcoursComponent {
  readonly employeId = input.required<number>();

  private readonly paieService = inject(PaieService);
  private readonly theme = inject(ThemeService);

  protected readonly parcours = signal<PaieParcours | null>(null);
  protected readonly libellePeriode = libellePeriode;
  protected readonly icones = ICONES;

  /** Les événements groupés par mois, du plus récent au plus ancien (le serveur les envoie déjà dans cet ordre). */
  protected readonly chronologie = computed(() => {
    const groupes: { periode: string; evenements: Evenement[] }[] = [];
    for (const evenement of this.parcours()?.evenements ?? []) {
      const dernier = groupes.at(-1);
      if (dernier?.periode === evenement.periode) {
        dernier.evenements.push(evenement);
      } else {
        groupes.push({ periode: evenement.periode, evenements: [evenement] });
      }
    }
    return groupes;
  });

  /** Ce que l'employé a perçu chaque mois (total du bulletin), du plus ancien au plus récent. */
  protected readonly graphique = computed<{ data: ChartData<'line'>; options: ChartOptions<'line'> }>(() => {
    this.theme.theme();
    const mois = [...(this.parcours()?.mois ?? [])].reverse();
    const couleur = couleurMesure('masse');
    const texte = jeton('--color-text-muted');
    return {
      data: {
        labels: mois.map((m) => libellePeriode(m.periode)),
        datasets: [
          {
            label: 'Total perçu',
            data: mois.map((m) => m.salaireTotal),
            borderColor: couleur,
            backgroundColor: couleur,
            borderWidth: 2,
            // Monotone : la courbe ne passe jamais par un montant que l'employé n'a pas perçu
            cubicInterpolationMode: 'monotone',
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBorderColor: jeton('--color-surface'),
            pointBorderWidth: 2
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        animation: animationGraphique(),
        layout: { padding: { left: 8, right: 8, top: 8, bottom: 0 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...infobulle(), callbacks: { label: (element) => `Total perçu : ${formaterMontant(Number(element.parsed.y))}` } }
        },
        scales: {
          x: { ticks: { color: texte, font: police(), autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
          y: { grace: '10%', ticks: { color: texte, font: police(), callback: (v) => FORMAT_ENTIER.format(Number(v)) }, grid: grille(), border: { display: false } }
        }
      }
    };
  });

  constructor() {
    effect(() => {
      const id = this.employeId();
      this.paieService.parcours(id).subscribe((parcours) => this.parcours.set(parcours));
    });
  }

  /** La phrase d'un événement : ce qui a changé, de quoi à quoi. */
  protected phrase(evenement: Evenement): string {
    const de = (valeur: string | null, vide: string) => valeur ?? vide;
    switch (evenement.type) {
      case 'ENTREE':
        return `Première paie — ${evenement.apres}`;
      case 'CHANGEMENT_CHANTIER':
        return `Chantier : ${evenement.avant} → ${evenement.apres}`;
      case 'CHANGEMENT_FONCTION':
        return `Fonction : ${evenement.avant} → ${evenement.apres}`;
      case 'CHANGEMENT_EQUIPE':
        return `Équipe : ${de(evenement.avant, 'sans équipe')} → ${de(evenement.apres, 'sans équipe')}`;
      case 'CHANGEMENT_SALAIRE':
        return `Salaire : ${formaterMontant(Number(evenement.avant))} → ${formaterMontant(Number(evenement.apres))}`;
      case 'DEPART':
        return `Départ de Staport — ${evenement.motif}`;
      case 'RETOUR':
        return 'Retour dans l’entreprise';
    }
  }
}
