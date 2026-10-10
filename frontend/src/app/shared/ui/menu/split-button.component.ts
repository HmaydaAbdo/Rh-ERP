import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '../button/button.directive';
import { MenuAction, MenuButtonComponent } from './menu-button.component';

/**
 * Action principale + menu d'actions secondaires (ex. « Importer » et, dans le menu, « Télécharger le modèle »).
 * Le bouton principal émet `clicked` ; le menu est un `stp-menu-button` dont `moreLabel` est le nom accessible.
 */
@Component({
  selector: 'stp-split-button',
  imports: [ButtonComponent, MenuButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stp-split-button' },
  template: `
    <button stp-button type="button" variant="secondary" class="stp-button--join-next" [icon]="icon()" [disabled]="disabled()" (click)="clicked.emit()">{{ label() }}</button>
    <stp-menu-button icon="chevron-down" joinPrevious variant="secondary" [items]="items()" [ariaLabel]="moreLabel()" [disabled]="disabled()" />
  `
})
export class SplitButtonComponent {
  readonly label = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly items = input.required<MenuAction[]>();
  readonly moreLabel = input('Autres actions');
  readonly disabled = input(false);
  readonly clicked = output<void>();
}
