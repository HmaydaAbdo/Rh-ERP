import { ChangeDetectionStrategy, Component, inject } from '@angular/core';


import { PaieExportStore } from '../paie-export.store';

/** Étape « Marché » (PDF seulement) : limite le rapport à un seul chantier, avec ou sans le chapitre « Vue d'ensemble » (retiré par défaut dès qu'un marché est choisi, car il le répèterait). */
@Component({
  selector: 'app-paie-export-etape-marche',
  imports: [],
  templateUrl: './marche-etape.component.html',
  styleUrl: './marche-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeMarcheComponent {
  protected readonly store = inject(PaieExportStore);
}
