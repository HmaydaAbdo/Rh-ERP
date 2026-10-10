import { ChangeDetectionStrategy, Component, computed, ElementRef, input, model, output, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

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
  template: `
    <input
      #field
      class="stp-input"
      type="date"
      [attr.id]="inputId()"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      [value]="text()"
      (input)="onInput($event)"
      (blur)="touch.emit()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `
})
export class DateInputComponent implements FormValueControl<Date | null> {
  readonly value = model<Date | null>(null);
  readonly disabled = input(false);
  readonly touch = output<void>();
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);

  protected readonly text = computed(() => {
    const value = this.value();
    return value ? toIso(value) : '';
  });
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  /** Donne le focus au champ (premier champ invalide d'un formulaire refusé). */
  focus(options?: FocusOptions): void {
    this.field()?.nativeElement.focus(options);
  }

  protected onInput(event: Event): void {
    const iso = (event.target as HTMLInputElement).value;
    this.value.set(iso ? fromIso(iso) : null);
  }
}
