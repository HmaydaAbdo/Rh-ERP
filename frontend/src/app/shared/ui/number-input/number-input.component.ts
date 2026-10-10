import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Espaces (normaux, insécables, fines insécables) qu'un format français place entre les milliers. */
const SPACES = /[\s  ]/g;

/**
 * Saisie d'un nombre au format français (`1 234,50`) : `inputmode="decimal"` (clavier numérique sur mobile), le nombre est
 * mis en forme au départ du champ et repasse en saisie brute à l'arrivée. Valeur exposée : `number | null`, bornée par
 * `min` / `max`. Pour un montant, `minFractionDigits="2"`.
 */
@Component({
  selector: 'stp-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumberInputComponent), multi: true }],
  template: `
    <input
      #field
      class="stp-input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      [id]="inputId()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
      (focus)="onFocus()"
      (input)="onInput()"
      (blur)="onBlur()"
    />
  `,
  styles: `
    :host {
      display: block;
    }

    input {
      text-align: right;
    }
  `
})
export class NumberInputComponent implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly minFractionDigits = input(0);
  readonly maxFractionDigits = input<number | null>(null);

  protected readonly disabled = signal(false);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  private value: number | null = null;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // La valeur écrite avant la création du champ (valeur initiale du formulaire) s'affiche dès qu'il existe.
    afterNextRender(() => this.render());
  }

  protected onFocus(): void {
    this.field()!.nativeElement.value = this.value === null ? '' : String(this.value).replace('.', ',');
  }

  protected onInput(): void {
    this.value = this.parse(this.field()!.nativeElement.value);
    this.onChange(this.value);
  }

  protected onBlur(): void {
    const bounded = this.bound(this.value);
    if (bounded !== this.value) {
      this.value = bounded;
      this.onChange(bounded);
    }
    this.render();
    this.onTouched();
  }

  private parse(text: string): number | null {
    const cleaned = text.replace(SPACES, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private bound(value: number | null): number | null {
    if (value === null) {
      return null;
    }
    const min = this.min();
    const max = this.max();
    return Math.min(max ?? value, Math.max(min ?? value, value));
  }

  private render(): void {
    const max = this.maxFractionDigits();
    const formatter = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: this.minFractionDigits(),
      ...(max !== null ? { maximumFractionDigits: max } : {})
    });
    const field = this.field()?.nativeElement;
    if (field) {
      field.value = this.value === null ? '' : formatter.format(this.value);
    }
  }

  writeValue(value: number | null): void {
    this.value = value ?? null;
    this.render();
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
