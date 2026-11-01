import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, viewChild } from '@angular/core';

import { IconComponent } from '../icon/icon.component';
import { DockComponent } from './dock.component';
import { DockEtatService } from './dock-etat.service';

/** La barre s'ouvre sous le bouton, alignée sur son bord de début (et passe au-dessus si la place manque). */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 }
];

/**
 * Bouton hamburger placé avant le titre de chaque page : il ouvre la navigation unifiée (la barre Staport) juste à côté de lui. À mettre en premier enfant de l'en-tête de la
 * page : il se place seul, dans la marge de début de l'en-tête, sans changer sa mise en page.
 *
 *   <div class="app-page__header"><stp-dock-declencheur /><h1>Titre</h1></div>
 */
@Component({
  selector: 'stp-dock-declencheur',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, DockComponent, IconComponent],
  templateUrl: './dock-declencheur.component.html',
  styleUrl: './dock-declencheur.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.stp-dock-declencheur--en-ligne]': 'enLigne()' }
})
export class DockDeclencheurComponent {
  protected readonly etat = inject(DockEtatService);
  protected readonly positions = POSITIONS;
  /** Dans une barre d'outils (la carte) : le bouton prend sa place dans le flux au lieu de se poser dans la marge de l'en-tête. */
  readonly enLigne = input(false);
  private readonly bouton = viewChild.required<ElementRef<HTMLButtonElement>>('bouton');

  protected surClicExterieur(evenement: MouseEvent): void {
    if (!this.bouton().nativeElement.contains(evenement.target as Node)) {
      this.etat.fermer();
    }
  }

  protected surTouche(evenement: KeyboardEvent): void {
    if (evenement.key === 'Escape') {
      evenement.stopPropagation();
      this.etat.fermer();
      this.bouton().nativeElement.focus();
    }
  }
}
