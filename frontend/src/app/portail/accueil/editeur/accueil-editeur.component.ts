import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { Accueil, IndicateurDisponible } from '../services/accueil.service';

/**
 * Choix et ordre des indicateurs d'un accueil : la liste des indicateurs affichés (à monter, descendre, retirer) puis ceux que les
 * permissions autorisent encore à ajouter. Sert l'utilisateur pour lui-même et l'administrateur pour un autre utilisateur : le
 * parent décide de l'enregistrement, ce composant ne fait que composer la liste.
 */
@Component({
  selector: 'app-accueil-editeur',
  imports: [ButtonComponent],
  templateUrl: './accueil-editeur.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccueilEditeurComponent {
  readonly accueil = input.required<Accueil>();
  readonly enregistrement = input(false);
  readonly enregistrer = output<string[]>();
  readonly reinitialiser = output<void>();

  /** Le choix en cours de composition ; `null` tant que l'utilisateur n'a rien changé (on affiche alors celui du serveur). */
  private readonly brouillon = signal<string[] | null>(null);

  protected readonly choisis = computed<string[]>(() => this.brouillon() ?? this.accueil().indicateurs);
  protected readonly modifie = computed(() => this.brouillon() !== null);

  protected readonly affiches = computed<IndicateurDisponible[]>(() => {
    const parCode = new Map(this.accueil().disponibles.map((indicateur) => [indicateur.code, indicateur]));
    return this.choisis().flatMap((code) => parCode.get(code) ?? []);
  });
  protected readonly ajoutables = computed<IndicateurDisponible[]>(() =>
    this.accueil().disponibles.filter((indicateur) => !this.choisis().includes(indicateur.code))
  );

  protected ajouter(code: string): void {
    this.brouillon.set([...this.choisis(), code]);
  }

  protected retirer(code: string): void {
    this.brouillon.set(this.choisis().filter((choisi) => choisi !== code));
  }

  protected deplacer(code: string, decalage: -1 | 1): void {
    const liste = [...this.choisis()];
    const position = liste.indexOf(code);
    const cible = position + decalage;
    if (position < 0 || cible < 0 || cible >= liste.length) {
      return;
    }
    [liste[position], liste[cible]] = [liste[cible], liste[position]];
    this.brouillon.set(liste);
  }

  protected valider(): void {
    this.enregistrer.emit(this.choisis());
  }
}
