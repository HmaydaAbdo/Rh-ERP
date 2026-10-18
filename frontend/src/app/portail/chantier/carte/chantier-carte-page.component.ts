import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ChantierCarteComponent } from './chantier-carte.component';

/** Page « Carte des chantiers » : le titre et la carte à pleine hauteur. Accès réservé à `CARTE_READ` (voir `chantier.routes.ts`). */
@Component({
  selector: 'app-chantier-carte-page',
  imports: [ChantierCarteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chantier-carte-page.component.html',
  styleUrl: './chantier-carte-page.component.scss'
})
export class ChantierCartePageComponent {}
