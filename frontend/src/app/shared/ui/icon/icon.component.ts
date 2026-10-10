import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

import { provideStaportIcons } from './icons';

/**
 * Icône décorative (masquée aux technologies d'assistance) : le nom accessible est porté par le bouton ou le texte voisin.
 * `name` est le nom kebab-case d'une icône enregistrée dans `icons.ts`. La taille suit le texte (`1em`) sauf `size`.
 */
@Component({
  selector: 'stp-icon',
  imports: [LucideDynamicIcon],
  viewProviders: [provideStaportIcons()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stp-icon', 'aria-hidden': 'true' },
  template: `<svg [lucideIcon]="name()" [size]="size()" [strokeWidth]="1.75"></svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
    }
  `
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<number | string>('1.125em');
}
