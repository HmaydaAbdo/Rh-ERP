import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, booleanAttribute, computed, inject, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'danger-text';

/**
 * Bouton Staport : un vrai `<button>` ou `<a>` natif (le clavier et le focus sont ceux du navigateur) habillé par les jetons.
 *
 *   <button stp-button variant="secondary" icon="upload">Importer</button>
 *   <button stp-button variant="text" icon="trash-2" aria-label="Supprimer la fonction X"></button>   (icône seule)
 *
 * `loading` remplace l'icône par un indicateur et désactive le clic — y compris les `(click)` du parent, interceptés avant eux —
 * sans retirer le bouton du parcours clavier (`aria-disabled`) ; la classe `stp-button--icon-only` est posée quand il n'y a pas de libellé.
 */
@Component({
  selector: 'button[stp-button], a[stp-button]',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    '[attr.aria-disabled]': 'loading() ? "true" : null'
  },
  template: `
    @if (loading()) {
      <stp-icon name="loader-circle" class="stp-spin" />
    } @else if (icon()) {
      <stp-icon [name]="icon()!" />
    }
    <ng-content />
  `
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly icon = input<string | null>(null);
  readonly loading = input(false, { transform: booleanAttribute });
  /** Bouton sans libellé : seul `aria-label` le nomme. */
  readonly iconOnly = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() => {
    const base = `stp-button stp-button--${this.variant()}`;
    return this.iconOnly() ? `${base} stp-button--icon-only` : base;
  });

  constructor() {
    // En phase de capture : le clic est arrêté avant les écouteurs `(click)` posés par le parent sur le même élément.
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const arreter = (event: Event): void => {
      if (this.loading()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    element.addEventListener('click', arreter, { capture: true });
    inject(DestroyRef).onDestroy(() => element.removeEventListener('click', arreter, { capture: true }));
  }
}
