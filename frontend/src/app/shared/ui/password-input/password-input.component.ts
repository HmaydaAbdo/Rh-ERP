import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { IconComponent } from '../icon/icon.component';

/** Champ de mot de passe avec bouton « Afficher / Masquer » (l'état est annoncé : `aria-pressed`). */
@Component({
  selector: 'stp-password-input',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordInputComponent), multi: true }],
  template: `
    <div class="stp-password">
      <input
        class="stp-input"
        [type]="visible() ? 'text' : 'password'"
        [id]="inputId()"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-label]="ariaLabel()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="onInput($event)"
        (blur)="onTouched()"
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
export class PasswordInputComponent implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);

  protected readonly visible = signal(false);
  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.value.set(text);
    this.onChange(text);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
