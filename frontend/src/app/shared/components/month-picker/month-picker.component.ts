
import { Component, EventEmitter, Input, Output, computed, signal, ChangeDetectionStrategy } from '@angular/core';

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
    imports: [],
    templateUrl: './month-picker.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './month-picker.component.scss'
})
export class MonthPickerComponent {
  private readonly valeurSignal = signal<string | null>(null);
  private readonly disponiblesSignal = signal<string[] | null>(null);
  readonly annee = signal(new Date().getFullYear());

  @Input() set value(valeur: string | null) {
    this.valeurSignal.set(valeur);
    if (valeur) {
      this.annee.set(Number(valeur.slice(0, 4)));
    }
  }

  @Input() set disponibles(periodes: string[] | null) {
    this.disponiblesSignal.set(periodes);
  }

  @Output() readonly valueChange = new EventEmitter<string>();

  /** Première et dernière année navigables. */
  private readonly bornes = computed(() => {
    const periodes = this.disponiblesSignal();
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
    const disponibles = this.disponiblesSignal();
    return LIBELLES_COURTS.map((libelle, index) => {
      const periode = `${annee}-${String(index + 1).padStart(2, '0')}`;
      return {
        numero: index + 1,
        libelle,
        periode,
        disponible: disponibles === null || disponibles.includes(periode),
        selectionnee: this.valeurSignal() === periode
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
      this.valeurSignal.set(tuile.periode);
      this.valueChange.emit(tuile.periode);
    }
  }
}
