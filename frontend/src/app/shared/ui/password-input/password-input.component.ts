import { ChangeDetectionStrategy, Component, ElementRef, input, model, output, signal, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

import { IconComponent } from '../icon/icon.component';

/** Champ de mot de passe avec bouton « Afficher / Masquer » (l'état est annoncé : `aria-pressed`). */
@Component({
  selector: 'stp-password-input',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stp-password">
      <input
        #field
        class="stp-input"
        [type]="visible() ? 'text' : 'password'"
        [attr.id]="inputId()"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-label]="ariaLabel()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="onInput($event)"
        (blur)="touch.emit()"
      />
      <button
        type="button"
        class="stp-password__toggle"
        [attr.aria-label]="visible() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
        [attr.aria-pressed]="visible()"
        [disabled]="disabled()"
        (click)="visible.set(!visible())"
      >
        <stp-icon [name]="visible() ? 'eye-off' : 'eye'" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .stp-password {
      position: relative;
      display: flex;
      align-items: center;
    }

    input {
      padding-inline-end: calc(var(--control-height) + var(--space-xs));
    }

    .stp-password__toggle {
      position: absolute;
      inset-inline-end: var(--space-xs);
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;

      &:hover:not(:disabled) {
        background: var(--neutral-100);
        color: var(--color-text);
      }
    }
  `
})
export class PasswordInputComponent implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false);
  readonly touch = output<void>();
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);

  protected readonly visible = signal(false);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  /** Donne le focus au champ (premier champ invalide d'un formulaire refusé). */
  focus(options?: FocusOptions): void {
    this.field()?.nativeElement.focus(options);
  }

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
