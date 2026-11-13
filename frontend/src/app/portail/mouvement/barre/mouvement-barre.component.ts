import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MonthPickerComponent } from '../../../shared/ui/month-picker/month-picker.component';
import { EmployeeFiltres } from '../../employee/filtres/employee-filtres';
import { EmployeeFiltresComponent } from '../../employee/filtres/employee-filtres.component';
import { libellePeriode, periodePrecedente, periodeSuivante } from '../../paie/paie-format';

/**
 * Barre commune aux écrans de mouvements du mois (sorties, entrants) : le choix du mois (précédent, suivant, sélecteur),
 * le bouton d'export PDF, le filtre propre à l'écran (projeté dans la barre) et la barre de filtres des employés. La page garde
 * l'état (l'URL) : la barre affiche ce qu'on lui donne et émet chaque changement.
 */
@Component({
  selector: 'app-mouvement-barre',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, ButtonComponent, EmployeeFiltresComponent, MonthPickerComponent],
  templateUrl: './mouvement-barre.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MouvementBarreComponent {
  readonly periode = input.required<string>();
  readonly filtres = input.required<EmployeeFiltres>();
  /** Le bouton « Exporter en PDF » n'apparaît qu'avec le droit d'export. */
  readonly exportVisible = input(false);
  readonly exportEnCours = input(false);
  readonly periodeChange = output<string>();
  readonly filtresChange = output<EmployeeFiltres>();
  readonly exporter = output<void>();

  protected readonly panneauMoisOuvert = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
  ];
  protected readonly libelleMois = computed(() => libellePeriode(this.periode()));

  protected choisir(periode: string): void {
    this.panneauMoisOuvert.set(false);
    this.periodeChange.emit(periode);
  }

  protected moisPrecedent(): void {
    this.choisir(periodePrecedente(this.periode()));
  }

  protected moisSuivant(): void {
    this.choisir(periodeSuivante(this.periode()));
  }

  protected surToucheMois(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.panneauMoisOuvert.set(false);
    }
  }
}
