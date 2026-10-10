import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromIso(iso: string): Date | null {
  const [year, month, day] = iso.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

/**
 * Date au jour près : le sélecteur natif du navigateur (`<input type="date">`, accessible et affiché en français), ce qui
 * évite un calendrier maison à maintenir. Valeur exposée : `Date | null` (minuit, heure locale).
 */
@Component({
  selector: 'stp-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputComponent), multi: true }],
  template: `
    <input
      class="stp-input"
      type="date"
      [id]="inputId()"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      [value]="text()"
      (input)="onInput($event)"
      (blur)="onTouched()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `
})
export class DateInputComponent implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);

  protected readonly text = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: Date | null) => void = () => {};
  protected onTouched: () => void = () => {};

  protected onInput(event: Event): void {
    const iso = (event.target as HTMLInputElement).value;
    this.text.set(iso);
    this.onChange(iso ? fromIso(iso) : null);
  }

  writeValue(value: Date | null): void {
    this.text.set(value ? toIso(value) : '');
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
