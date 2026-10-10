import { Menu, MenuContent, MenuItem, MenuTrigger } from '@angular/aria/menu';
import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ButtonComponent, ButtonVariant } from '../button/button.directive';
import { IconComponent } from '../icon/icon.component';

/** Une action d'un menu : le libellé est le nom accessible, l'icône est décorative. */
export interface MenuAction {
  label: string;
  icon?: string;
  disabled?: boolean;
  command: () => void;
}

/**
 * Bouton qui ouvre un menu d'actions (`role="menu"`, navigation aux flèches, Échap, recherche à la frappe) — Angular Aria.
 * Sans `label`, c'est un bouton icône dont `ariaLabel` est le nom accessible.
 *
 *   <stp-menu-button label="Actions" icon="ellipsis" [items]="actions" />
 */
@Component({
  selector: 'stp-menu-button',
  imports: [Menu, MenuContent, MenuItem, MenuTrigger, ButtonComponent, IconComponent],
  templateUrl: './menu-button.component.html',
  styleUrl: './menu-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuButtonComponent {
  readonly items = input.required<MenuAction[]>();
  readonly label = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly variant = input<ButtonVariant>('secondary');
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Colle le bouton au précédent (bouton scindé) : pas d'arrondi ni de bordure du côté de la jonction. */
  readonly joinPrevious = input(false, { transform: booleanAttribute });

  protected select(action: MenuAction | undefined): void {
    if (action && !action.disabled) {
      action.command();
    }
  }
}
