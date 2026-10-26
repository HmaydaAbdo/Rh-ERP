import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, EnvironmentInjector, createEnvironmentInjector, inject } from '@angular/core';
import { COPILOT_KIT_CONFIG, CopilotKit, CopilotkitAgentFactory, CopilotkitThreadsFactory } from '@copilotkit/angular';

import { AssistantComponent } from './assistant.component';

/**
 * Point d'entrée de l'assistant, chargé à la demande (`@defer` de la coque). CopilotKit y vit dans un injecteur
 * d'environnement enfant : sa configuration et ses services (fournis à la racine par la bibliothèque, qui lit alors une
 * configuration absente) sont créés ici, pour que ni elle ni le client AG-UI ne pèsent dans le paquet initial.
 */
@Component({
  selector: 'app-assistant',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-container *ngComponentOutlet="assistant; environmentInjector: injecteur" />`
})
export class AssistantRacineComponent {
  protected readonly assistant = AssistantComponent;
  protected readonly injecteur = createEnvironmentInjector(
    [
      // L'inspecteur de développement de la bibliothèque est un outil distant et promotionnel : jamais chargé.
      { provide: COPILOT_KIT_CONFIG, useValue: { enableInspector: false } },
      CopilotKit,
      CopilotkitAgentFactory,
      CopilotkitThreadsFactory
    ],
    inject(EnvironmentInjector)
  );
}
