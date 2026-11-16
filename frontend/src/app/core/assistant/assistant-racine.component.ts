import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AssistantComponent } from './assistant.component';

/**
 * Point d'entrée de l'assistant, chargé à la demande (`@defer` de la coque). CopilotKit est fourni une seule fois à la racine
 * de l'application (`app.config.ts`, KAN-270) : le même service sert l'assistant et les outils que chaque page enregistre
 * côté navigateur (`registerFrontendTool`). Les services de la bibliothèque s'arrêtent avec l'application.
 */
@Component({
  selector: 'app-assistant',
  imports: [AssistantComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-assistant-interne />`
})
export class AssistantRacineComponent {}
