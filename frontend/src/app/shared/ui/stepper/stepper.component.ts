import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export interface StepperEtape {
  readonly id: string;
  readonly libelle: string;
}

/**
 * Bandeau d'étapes d'un assistant : pastille numérotée (une coche quand l'étape est faite), libellé et trait de progression.
 * Les étapes déjà faites sont cliquables pour y revenir ; sur téléphone seule l'étape en cours garde son libellé.
 *
 *   <stp-stepper ariaLabel="Étapes de l'export" [etapes]="etapes" [courante]="etape" [indexCourant]="i" [termine]="fini" (choisir)="allerA($event)" />
 */
@Component({
  selector: 'stp-stepper',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="stp-stepper" [attr.aria-label]="ariaLabel()">
      @for (etape of etapes(); track etape.id; let i = $index) {
        @let faite = i < indexCourant() || termine();
        <button
          type="button"
          class="stp-stepper__etape"
          [class.stp-stepper__etape--active]="etape.id === courante() && !termine()"
          [class.stp-stepper__etape--faite]="faite"
          [attr.aria-current]="etape.id === courante() ? 'step' : null"
          (click)="choisir.emit(etape.id)"
        >
          <span class="stp-stepper__pastille">
            @if (faite) {
              <stp-icon name="check" />
            } @else {
              {{ i + 1 }}
            }
          </span>
          <span class="stp-stepper__libelle">{{ etape.libelle }}</span>
        </button>
        @if (i < etapes().length - 1) {
          <span class="stp-stepper__trait" [class.stp-stepper__trait--plein]="faite"><span></span></span>
        }
      }
    </nav>
  `,
  styles: `
    @use 'breakpoints' as bp;

    :host {
      display: block;
    }

    .stp-stepper {
      display: flex;
      align-items: center;
      padding: var(--space-sm) 0 var(--space-md);
    }

    .stp-stepper__etape {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0;
      border: none;
      background: none;
      color: var(--color-text-muted);
      font: inherit;
      font-size: var(--text-sm);
      white-space: nowrap;
      cursor: default;
      transition: color var(--duration-base);
    }

    .stp-stepper__etape--active {
      color: var(--color-text);
      font-weight: var(--weight-semibold);
    }

    .stp-stepper__etape--faite {
      cursor: pointer;
    }

    .stp-stepper__etape--faite:hover .stp-stepper__libelle {
      text-decoration: underline;
    }

    .stp-stepper__etape:focus-visible {
      outline: var(--focus-width) solid var(--color-focus);
      outline-offset: var(--focus-offset);
      border-radius: var(--radius-sm);
    }

    // Téléphone : seule l'étape en cours garde son libellé, les autres se réduisent à leur pastille
    @include bp.phone {
      .stp-stepper__etape:not(.stp-stepper__etape--active) .stp-stepper__libelle {
        display: none;
      }
    }

    .stp-stepper__pastille {
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 1px solid var(--color-border-strong);
      border-radius: 50%;
      font-size: var(--text-xs);
      font-variant-numeric: tabular-nums;
      transition: background-color var(--duration-base), color var(--duration-base), border-color var(--duration-base);
    }

    .stp-stepper__etape--active .stp-stepper__pastille {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-primary-contrast);
    }

    .stp-stepper__etape--faite .stp-stepper__pastille {
      border-color: var(--color-success);
      background: var(--color-success-bg);
      color: var(--color-success);
    }

    .stp-stepper__trait {
      position: relative;
      flex: 1;
      min-width: 0.75rem;
      height: 2px;
      margin: 0 var(--space-sm);
      overflow: hidden;
      background: var(--color-border);
    }

    // Le remplissage grandit par transform (jamais par width) : aucune mise en page recalculée
    .stp-stepper__trait span {
      position: absolute;
      inset: 0;
      background: var(--color-primary);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform var(--duration-slow) var(--ease-out);
    }

    .stp-stepper__trait--plein span {
      transform: none;
    }
  `
})
export class StepperComponent {
  readonly etapes = input.required<readonly StepperEtape[]>();
  readonly courante = input.required<string>();
  readonly indexCourant = input.required<number>();
  readonly termine = input(false);
  readonly ariaLabel = input('Étapes');

  readonly choisir = output<string>();
}
