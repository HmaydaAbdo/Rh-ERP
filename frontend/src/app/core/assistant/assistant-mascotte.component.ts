import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Humeur } from './assistant.service';

/**
 * Mascotte casquée de l'assistant : état logique de `com.staport.mascot.state.v1` (réfléchit, cherche, trouve, s'excuse),
 * jamais piloté par le modèle. Décorative : l'état est aussi dit en texte par le panneau. Le personnage Rive arrive avec J4.
 */
@Component({
  selector: 'app-assistant-mascotte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class]': "'mascotte mascotte--' + humeur()" },
  template: `
    <span class="mascotte__tete">
      <span class="mascotte__casque"></span>
      <span class="mascotte__oeil mascotte__oeil--g"></span>
      <span class="mascotte__oeil mascotte__oeil--d"></span>
      <span class="mascotte__bouche"></span>
    </span>
  `,
  styleUrl: './assistant-mascotte.component.scss'
})
export class AssistantMascotteComponent {
  readonly humeur = input.required<Humeur>();
}
