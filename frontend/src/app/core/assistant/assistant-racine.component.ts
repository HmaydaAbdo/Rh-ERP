import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, EnvironmentInjector, createEnvironmentInjector, inject } from '@angular/core';
import {
  COPILOT_KIT_CONFIG,
  CopilotKit,
  CopilotkitAgentFactory,
  CopilotkitThreadsFactory,
  type CopilotKitConfig
} from '@copilotkit/angular';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/services/auth.service';
import { AssistantComponent } from './assistant.component';
import { catalogueErp } from './catalogue/catalogue-erp';

/** Point d'entrée du runtime CopilotKit, relayé par nginx en production et par `proxy.conf.js` en développement. */
export const URL_RUNTIME = '/ia/copilotkit';

/**
 * Point d'entrée de l'assistant, chargé à la demande (`@defer` de la coque). CopilotKit y vit dans un injecteur
 * d'environnement enfant : sa configuration et ses services (fournis à la racine par la bibliothèque) sont créés ici,
 * pour que la bibliothèque ne pèse pas dans le paquet initial.
 */
@Component({
  selector: 'app-assistant',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-container *ngComponentOutlet="assistant; environmentInjector: injecteur" />`
})
export class AssistantRacineComponent {
  private readonly auth = inject(AuthService);

  protected readonly assistant = AssistantComponent;
  protected readonly injecteur = createEnvironmentInjector(
    [
      { provide: COPILOT_KIT_CONFIG, useValue: this.configuration() },
      CopilotKit,
      CopilotkitAgentFactory,
      CopilotkitThreadsFactory
    ],
    inject(EnvironmentInjector)
  );

  private configuration(): CopilotKitConfig {
    return {
      runtimeUrl: URL_RUNTIME,
      // Évalué à chaque requête (option documentée) : le jeton courant, rafraîchi d'abord s'il a expiré.
      headers: async () => ({ Authorization: `Bearer ${await jetonValide(this.auth)}` }),
      // Interface composée (T16) : surfaces A2UI rendues avec le catalogue de base officiel complété des composants de l'ERP
      // (tableau, indicateurs, graphique), aux couleurs Staport.
      // `includeSchema: false` : le schéma du catalogue et les consignes A2UI ne partent pas à chaque question (près de
      // 7 000 jetons par appel de modèle) ; le service IA les donne au seul sous-agent qui compose les surfaces.
      a2ui: { catalog: catalogueErp, includeSchema: false },
      // Pas de consultations d'outils en brut (nom technique, statut en anglais) : le raisonnement replié dit déjà ce que
      // fait l'agent (comportement par défaut de la bibliothèque).
      defaultToolRendering: false,
      // L'inspecteur de développement de la bibliothèque est un outil distant et promotionnel : jamais chargé.
      enableInspector: false
    };
  }
}

/** Le jeton d'accès courant ; s'il manque ou a expiré (champ `exp` du JWT), il est rafraîchi une fois avant l'envoi. */
export async function jetonValide(auth: Pick<AuthService, 'getAccessToken' | 'refreshOnce'>): Promise<string> {
  const jeton = auth.getAccessToken();
  if (jeton && !expire(jeton)) {
    return jeton;
  }
  await firstValueFrom(auth.refreshOnce());
  return auth.getAccessToken() ?? '';
}

function expire(jeton: string): boolean {
  try {
    const { exp } = JSON.parse(atob(jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return exp !== undefined && exp * 1000 <= Date.now() + 10_000;
  } catch {
    return false;
  }
}
