import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';
import { finalize, Observable } from 'rxjs';
import { ButtonComponent } from '../../ui/button/button.directive';
import { PdfImpressionDocument, PdfImpressionService } from '../../services/pdf-impression.service';

@Component({
  selector: 'app-pdf-export-button',
  imports: [ButtonComponent],
  template: `
    <button
      stp-button
      variant="secondary"
      icon="download"
      type="button"
      [iconOnly]="iconOnly()"
      [loading]="chargement()"
      [disabled]="disabled() || (!chargement() && !chargerDocument() && document().lignes.length === 0)"
      [attr.aria-label]="iconOnly() ? (chargement() ? 'Préparation du PDF' : ariaLabel()) : null"
      [attr.title]="iconOnly() ? ariaLabel() : null"
      (click)="exporter()"
    >{{ iconOnly() ? '' : (chargement() ? 'Préparation…' : 'PDF') }}</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PdfExportButtonComponent {
  readonly document = input.required<PdfImpressionDocument>();
  readonly chargerDocument = input<(() => Observable<PdfImpressionDocument>) | null>(null);
  readonly iconOnly = input(false);
  readonly inclureGraphique = input(false);
  readonly disabled = input(false);
  readonly ariaLabel = input('Exporter les données de ce composant en PDF');
  readonly chargement = signal(false);
  private readonly impression = inject(PdfImpressionService);
  private readonly element = inject(ElementRef<HTMLElement>);

  exporter(): void {
    const fenetre = this.impression.ouvrir();
    if (!fenetre) {
      return;
    }
    const charger = this.chargerDocument();
    if (!charger) {
      this.impression.imprimer(fenetre, this.avecGraphique(this.document()));
      return;
    }
    this.chargement.set(true);
    charger().pipe(finalize(() => this.chargement.set(false))).subscribe({
      next: (document) => this.impression.imprimer(fenetre, this.avecGraphique(document)),
      error: () => fenetre.close()
    });
  }

  private avecGraphique(document: PdfImpressionDocument): PdfImpressionDocument {
    if (!this.inclureGraphique()) {
      return document;
    }
    const conteneur = this.element.nativeElement.closest('.perimetre-analytique__graphique')
      ?? this.element.nativeElement.closest('.perimetre-analytique__section');
    const canvas = conteneur?.querySelector('canvas');
    if (!canvas) {
      return document;
    }
    try {
      return { ...document, graphiqueDataUrl: canvas.toDataURL('image/png'), graphiqueAlt: this.ariaLabel() };
    } catch {
      return document;
    }
  }
}
