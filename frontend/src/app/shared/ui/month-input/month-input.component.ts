import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { MonthPickerComponent } from '../../components/month-picker/month-picker.component';
import { IconComponent } from '../icon/icon.component';

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
];

function toPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Choix d'un mois (`mm/aaaa`) : un bouton qui ouvre le sélecteur de mois partagé (`MonthPickerComponent`) dans une fenêtre
 * flottante. Valeur exposée : `Date | null` (le premier jour du mois) — comme les formulaires de paie le manipulent.
 */
@Component({
  selector: 'stp-month-input',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, IconComponent, MonthPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MonthInputComponent), multi: true }],
  template: `
    <button
      type="button"
      class="stp-input stp-month__trigger"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      aria-haspopup="dialog"
      [id]="inputId()"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      (click)="open.set(!open())"
    >
      <span [class.stp-month__placeholder]="!label()">{{ label() || placeholder() }}</span>
      <stp-icon name="calendar" />
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="close()"
      (overlayKeydown)="onKeydown($event)"
      (detach)="open.set(false)"
    >
      <div class="stp-popover" role="dialog" aria-label="Choisir un mois">
        <app-month-picker [value]="period()" [disponibles]="null" (valueChange)="choose($event)" />
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }

    .stp-month__trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
      text-align: left;
      cursor: pointer;
    }

    .stp-month__placeholder {
      color: var(--color-text-muted);
    }
  `
})
export class MonthInputComponent implements ControlValueAccessor {
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly placeholder = input('Sélectionner un mois');

  protected readonly open = signal(false);
  protected readonly disabled = signal(false);
  protected readonly value = signal<Date | null>(null);
  protected readonly positions = POSITIONS;

  protected readonly period = computed(() => (this.value() ? toPeriod(this.value()!) : null));
  protected readonly label = computed(() => {
    const value = this.value();
    return value ? `${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}` : '';
  });

  private onChange: (value: Date | null) => void = () => {};
  private onTouched: () => void = () => {};

  protected choose(period: string): void {
    const [year, month] = period.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    this.value.set(date);
    this.onChange(date);
    this.close();
  }

  protected close(): void {
    this.open.set(false);
    this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  writeValue(value: Date | null): void {
    this.value.set(value ?? null);
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
