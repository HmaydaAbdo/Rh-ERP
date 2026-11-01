import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

/**
 * Écran d'un assistant qui n'attend plus de saisie : « en cours » (icône qui tourne, barre indéterminée) ou « terminé »
 * (icône de coche). Le texte d'accompagnement (`<p>`) et les actions de fin sont projetés.
 *
 *   <stp-wizard-state etat="termine" titre="Fichier prêt"> <p>Paie_2026-08.xlsx</p> <button stp-button>…</button> </stp-wizard-state>
 */
@Component({
  selector: 'stp-wizard-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
  template: `
    @if (etat() === 'termine') {
      <stp-icon name="circle-check" class="stp-wizard-state__coche" size="3rem" />
    } @else {
      <stp-icon name="settings" class="stp-spin stp-wizard-state__rouage" size="2rem" />
    }
    <strong>{{ titre() }}</strong>
    <div class="stp-wizard-state__contenu"><ng-content /></div>
    @if (etat() === 'encours') {
      <span class="stp-wizard-state__barre"><span></span></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-xl) 0;
      text-align: center;
    }

    strong {
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
    }

    .stp-wizard-state__contenu {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-sm);
      margin: var(--space-xs) 0 var(--space-md);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    .stp-wizard-state__rouage {
      margin-bottom: var(--space-sm);
      color: var(--color-primary);
    }

    .stp-wizard-state__coche {
      margin-bottom: var(--space-sm);
      color: var(--color-success);
      animation: stp-wizard-confirme var(--duration-slow) var(--ease-out) backwards;
    }

    .stp-wizard-state__barre {
      width: 60%;
      height: 6px;
      overflow: hidden;
      border-radius: var(--radius-sm);
      background: var(--color-surface-sunken);
    }

    .stp-wizard-state__barre span {
      display: block;
      width: 30%;
      height: 100%;
      background: var(--color-primary);
      animation: stp-wizard-indetermine var(--duration-slowest) var(--ease-in-out) infinite;
    }

  `
})
export class WizardStateComponent {
  readonly etat = input<'encours' | 'termine'>('encours');
  readonly titre = input.required<string>();
}
