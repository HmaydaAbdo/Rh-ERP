import { ChangeDetectionStrategy, Component, inject } from '@angular/core';


import { PaieExportStore } from '../paie-export.store';

/** Étape « Marchés » (PDF seulement) : limite le rapport à plusieurs marchés possibles, avec ou sans le chapitre « Vue d'ensemble ». */
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
