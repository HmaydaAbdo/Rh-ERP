import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, EnvironmentInjector, createEnvironmentInjector, inject } from '@angular/core';
import {
  COPILOT_KIT_CONFIG,
  anyActivityContentSchema,
  CopilotKit,
  CopilotkitAgentFactory,
  CopilotkitThreadsFactory,
  OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER,
  type CopilotKitConfig
} from '@copilotkit/angular';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/services/auth.service';
import { AssistantComponent } from './assistant.component';
import { FilAssistant } from './fil-assistant.service';
import { catalogueErp } from './catalogue/catalogue-erp';
import { SurfaceA2uiFrancaisComponent } from './surface-a2ui-francais.component';
import { chargeurVuesLibres } from './vues-libres';

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
  private readonly document = inject(DOCUMENT);

  protected readonly assistant = AssistantComponent;
  protected readonly injecteur = createEnvironmentInjector(
    [
      { provide: COPILOT_KIT_CONFIG, useValue: this.configuration() },
      // Vues libres (KAN-95) : moteur officiel, sans fonction de l'hôte, sous politique de contenu stricte (vues-libres.ts).
      { provide: OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER, useValue: chargeurVuesLibres() },
      CopilotKit,
      CopilotkitAgentFactory,
      CopilotkitThreadsFactory,
      FilAssistant
    ],
    inject(EnvironmentInjector)
  );

  private configuration(): CopilotKitConfig {
    return {
      // CopilotKit utilise fetch : résoudre explicitement la base Angular pour les déploiements sous un sous-chemin.
      runtimeUrl: new URL('ia/copilotkit', this.document.baseURI).href,
      // Évalué à chaque requête (option documentée) : le jeton courant, rafraîchi d'abord s'il a expiré.
      headers: async () => ({ Authorization: `Bearer ${await jetonValide(this.auth)}` }),
      // Suggestions générées par l'agent connecté, à partir du contexte et des capacités autorisées pour ce compte.
      suggestionsConfig: [{
        instructions: 'Propose des questions courtes et utiles que cette personne peut poser à Staport Intelligence. Base-les sur la demande ou les capacités disponibles pour son compte. Ne révèle aucune donnée personnelle et ne suppose jamais une permission absente.',
        minSuggestions: 1,
        maxSuggestions: 3,
        available: 'before-first-message',
        providerAgentId: 'default',
        consumerAgentId: 'default'
      }],
      // Interface composée (T16) : surfaces A2UI rendues avec le catalogue de base officiel complété des composants de l'ERP
      // (tableau, indicateurs, graphique), aux couleurs Staport.
      // `includeSchema: false` : le schéma du catalogue et les consignes A2UI ne partent pas à chaque question (près de
      // 7 000 jetons par appel de modèle) ; le service IA les donne au seul sous-agent qui compose les surfaces.
      // Reprise (KAN-96) : le serveur valide chaque surface contre le catalogue fermé et la fait refaire au plus trois fois ;
      // la reprise n'est montrée qu'après 2 s ou 2 essais, et les diagnostics techniques restent cachés à l'utilisateur.
      a2ui: {
        catalog: catalogueErp,
        includeSchema: false,
        recovery: { showAfterMs: 2000, showAfterAttempts: 2, debugExposure: 'hidden' }
      },
      // Vues libres (KAN-95) : pas d'`openGenerativeUI` ici, donc ni outil ni rendu tant que le runtime ne les annonce pas
      // (VUES_LIBRES, coupé par défaut) ; le moteur n'a de toute façon aucune fonction de l'hôte (vues-libres.ts).
      // Rendu des surfaces A2UI en français (messages de construction, de reprise et d'échec) : point d'extension officiel,
      // le composant de la bibliothèque est réutilisé pour la surface elle-même (surface-a2ui-francais.component.ts).
      renderActivityMessages: [{ activityType: 'a2ui-surface', content: anyActivityContentSchema, component: SurfaceA2uiFrancaisComponent }],
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
