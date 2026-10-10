import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

import { IconComponent } from '../../ui/icon/icon.component';

const LIBELLES_COURTS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const NB_ANNEES_SANS_LIMITE = 10;

interface Tuile {
  numero: number;
  libelle: string;
  periode: string;
  disponible: boolean;
  selectionnee: boolean;
}

/**
 * Sélecteur de mois en un seul champ : flèches d'année et 12 tuiles. La valeur est une période au format
 * `aaaa-MM` (celui de l'API). `disponibles` limite les mois choisissables — les autres sont grisés et non
 * sélectionnables, et la navigation d'année reste entre la première et la dernière année qui en contiennent ;
 * `null` autorise tous les mois (ex. choisir la période d'un import).
 */
@Component({
  selector: 'app-month-picker',
  imports: [IconComponent],
  templateUrl: './month-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './month-picker.component.scss'
})
export class MonthPickerComponent {
  readonly value = input<string | null>(null);
  readonly disponibles = input<string[] | null>(null);
  readonly valueChange = output<string>();

  /** Le mois choisi s'affiche tout de suite, avant même que le parent ne répercute la valeur. */
  private readonly choisi = linkedSignal(() => this.value());
  /** L'année affichée suit la valeur ; sans valeur, elle garde celle que l'on parcourait. */
  readonly annee = linkedSignal<string | null, number>({
    source: () => this.value(),
    computation: (valeur, precedente) => (valeur ? Number(valeur.slice(0, 4)) : (precedente?.value ?? new Date().getFullYear()))
  });

  /** Première et dernière année navigables. */
  private readonly bornes = computed(() => {
    const periodes = this.disponibles();
    if (periodes && periodes.length > 0) {
      const annees = periodes.map((periode) => Number(periode.slice(0, 4)));
      return { min: Math.min(...annees), max: Math.max(...annees) };
    }
    const courante = new Date().getFullYear();
    return { min: courante - NB_ANNEES_SANS_LIMITE, max: courante + 1 };
  });

  readonly peutReculer = computed(() => this.annee() > this.bornes().min);
  readonly peutAvancer = computed(() => this.annee() < this.bornes().max);

  readonly tuiles = computed<Tuile[]>(() => {
    const annee = this.annee();
    const disponibles = this.disponibles();
    return LIBELLES_COURTS.map((libelle, index) => {
      const periode = `${annee}-${String(index + 1).padStart(2, '0')}`;
      return {
        numero: index + 1,
        libelle,
        periode,
        disponible: disponibles === null || disponibles.includes(periode),
        selectionnee: this.choisi() === periode
      };
    });
  });

  changerAnnee(delta: number): void {
    const cible = this.annee() + delta;
    if (cible >= this.bornes().min && cible <= this.bornes().max) {
      this.annee.set(cible);
    }
  }

  choisir(tuile: Tuile): void {
    if (tuile.disponible) {
      this.choisi.set(tuile.periode);
      this.valueChange.emit(tuile.periode);
    }
  }
}
