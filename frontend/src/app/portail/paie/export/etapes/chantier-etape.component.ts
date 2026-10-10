import { ChangeDetectionStrategy, Component, inject } from '@angular/core';


import { PaieExportStore } from '../paie-export.store';

/** Étape « Chantier » (PDF seulement) : limite le rapport à un seul chantier, avec ou sans le chapitre « Vue d'ensemble » (retiré par défaut dès qu'un chantier est choisi, car il le répèterait). */
@Component({
  selector: 'app-paie-export-etape-chantier',
  imports: [],
  templateUrl: './chantier-etape.component.html',
  styleUrl: './chantier-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeChantierComponent {
  protected readonly store = inject(PaieExportStore);
}
