import { A11yModule } from '@angular/cdk/a11y';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, model, output, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';

import { ButtonComponent } from '../button/button.directive';

let nextId = 0;

/**
 * Fenêtre de dialogue modale (`role="dialog"`, piège de focus CDK, Échap et bouton Fermer, focus rendu au déclencheur).
 * Ouverture pilotée par `[(open)]` ; le contenu se place entre les balises, les boutons de pied dans un élément portant `stpDialogFooter`.
 *
 *   <stp-dialog header="Résultat de l'import" width="520px" [(open)]="showResult"> … </stp-dialog>
 *
 * Le panneau est rendu dans la couche d'overlay du CDK (hors du flux, jamais rogné par un parent) ; la fermeture par clic
 * sur le fond n'est volontairement pas prévue : elle perdrait une saisie.
 */
@Component({
  selector: 'stp-dialog',
  imports: [A11yModule, ButtonComponent],
  templateUrl: './dialog.component.html',
  styleUrl: './dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogComponent {
  readonly open = model(false);
  readonly header = input.required<string>();
  readonly width = input('32rem');
  /** `false` : ni bouton Fermer ni Échap (ex. pendant une génération de fichier qui ne doit pas être interrompue). */
  readonly closable = input(true);
  /** `end` : tiroir collé au bord droit, sur toute la hauteur (ex. détail d'une entrée du journal). */
  readonly placement = input<'center' | 'end'>('center');
  /** Émis à chaque fermeture (bouton, Échap ou parent). */
  readonly closed = output<void>();

  protected readonly titleId = `stp-dialog-title-${nextId++}`;

  private readonly overlay = inject(Overlay);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly panel = viewChild.required<TemplateRef<unknown>>('panel');
  private overlayRef: OverlayRef | null = null;

  constructor() {
    effect(() => (this.open() ? this.attach() : this.detach()));
    inject(DestroyRef).onDestroy(() => this.overlayRef?.dispose());
  }

  close(): void {
    this.open.set(false);
  }

  private attach(): void {
    if (this.overlayRef?.hasAttached()) {
      return;
    }
    this.overlayRef ??= this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'stp-dialog-backdrop',
      panelClass: 'stp-dialog-pane',
      positionStrategy:
        this.placement() === 'end'
          ? this.overlay.position().global().right('0').top('0')
          : this.overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: this.overlay.scrollStrategies.block()
    });
    this.overlayRef.attach(new TemplatePortal(this.panel(), this.viewContainer));
    this.overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape' && this.closable()) {
        event.preventDefault();
        this.close();
      }
    });
  }

  private detach(): void {
    if (this.overlayRef?.hasAttached()) {
      this.overlayRef.detach();
      this.closed.emit();
    }
  }
}
