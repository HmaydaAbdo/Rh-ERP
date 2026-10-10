import { afterNextRender, ChangeDetectionStrategy, Component, effect, ElementRef, input, model, output, untracked, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

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
export class NumberInputComponent implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);
  readonly disabled = input(false);
  readonly touch = output<void>();
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  readonly minFractionDigits = input(0);
  readonly maxFractionDigits = input<number | null>(null);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  /** Pendant la saisie, le texte du champ est celui de l'utilisateur : une valeur qu'il vient lui-même de produire ne le réécrit pas. */
  private editing = false;

  constructor() {
    // La valeur initiale du formulaire s'affiche dès que le champ existe ; ensuite, toute valeur écrite hors saisie (chargement,
    // remise à zéro) se reformate.
    afterNextRender(() => this.render());
    effect(() => {
      this.value();
      untracked(() => {
        if (!this.editing) {
          this.render();
        }
      });
    });
  }

  /** Donne le focus au champ (premier champ invalide d'un formulaire refusé). */
  focus(options?: FocusOptions): void {
    this.field()?.nativeElement.focus(options);
  }

  protected onFocus(): void {
    this.editing = true;
    const value = this.value();
    this.field()!.nativeElement.value = value === null ? '' : String(value).replace('.', ',');
  }

  protected onInput(): void {
    this.value.set(this.parse(this.field()!.nativeElement.value));
  }

  protected onBlur(): void {
    this.editing = false;
    this.value.set(this.bound(this.value()));
    this.render();
    this.touch.emit();
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
      const value = this.value();
      field.value = value === null ? '' : formatter.format(value);
    }
  }
}
