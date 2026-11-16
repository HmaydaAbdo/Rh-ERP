import {
  type CopilotKitConfig,
  anyActivityContentSchema,
} from '@copilotkit/angular';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../auth/services/auth.service';
import { catalogueErp } from './catalogue/catalogue-erp';
import { SurfaceA2uiFrancaisComponent } from './surface-a2ui-francais.component';

/**
 * Configuration de CopilotKit, fournie une seule fois à la racine de l'application (`provideCopilotKit`, KAN-270) : les pages
 * peuvent ainsi enregistrer leurs outils côté navigateur avec `registerFrontendTool`, et l'assistant partage le même service.
 */
export function configurationAssistant(
  auth: Pick<AuthService, 'getAccessToken' | 'refreshOnce'>,
  document: Document,
): CopilotKitConfig {
  return {
    // CopilotKit utilise fetch : résoudre explicitement la base Angular pour les déploiements sous un sous-chemin.
    runtimeUrl: new URL('ia/copilotkit', document.baseURI).href,
    // Évalué à chaque requête (option documentée) : le jeton courant, rafraîchi d'abord s'il a expiré.
    headers: async () => ({
      Authorization: `Bearer ${await jetonValide(auth)}`,
    }),
    // Suggestions générées par l'agent connecté, à partir du contexte et des capacités autorisées pour ce compte.
    suggestionsConfig: [
      {
        instructions:
          'Propose des questions courtes et utiles que cette personne peut poser à Staport Intelligence. Base-les sur la demande ou les capacités disponibles pour son compte. Ne révèle aucune donnée personnelle et ne suppose jamais une permission absente.',
        minSuggestions: 1,
        maxSuggestions: 3,
        available: 'before-first-message',
        providerAgentId: 'default',
        consumerAgentId: 'default',
      },
    ],
    // Interface composée (T16) : surfaces A2UI rendues avec le catalogue de base officiel complété des composants de l'ERP
    // (tableau, indicateurs, graphique), aux couleurs Staport.
    // `includeSchema: false` : le schéma du catalogue et les consignes A2UI ne partent pas à chaque question (près de
    // 7 000 jetons par appel de modèle) ; le service IA les donne au seul sous-agent qui compose les surfaces.
    // Reprise (KAN-96) : le serveur valide chaque surface contre le catalogue fermé et la fait refaire au plus trois fois ;
    // la reprise n'est montrée qu'après 2 s ou 2 essais, et les diagnostics techniques restent cachés à l'utilisateur.
    a2ui: {
      catalog: catalogueErp,
      includeSchema: false,
      recovery: {
        showAfterMs: 2000,
        showAfterAttempts: 2,
        debugExposure: 'hidden',
      },
    },
    // Vues libres (KAN-95) : pas d'`openGenerativeUI` ici, donc ni outil ni rendu tant que le runtime ne les annonce pas
    // (VUES_LIBRES, activé par défaut ; `false` l'éteint) ; le moteur n'a de toute façon aucune fonction de l'hôte (vues-libres.ts).
    // Rendu des surfaces A2UI en français (messages de construction, de reprise et d'échec) : point d'extension officiel,
    // le composant de la bibliothèque est réutilisé pour la surface elle-même (surface-a2ui-francais.component.ts).
    renderActivityMessages: [
      {
        activityType: 'a2ui-surface',
        content: anyActivityContentSchema,
        component: SurfaceA2uiFrancaisComponent,
      },
    ],
    // Pas de consultations d'outils en brut (nom technique, statut en anglais) : le raisonnement replié dit déjà ce que
    // fait l'agent (comportement par défaut de la bibliothèque).
    defaultToolRendering: false,
    // L'inspecteur de développement de la bibliothèque est un outil distant et promotionnel : jamais chargé.
    enableInspector: false,
  };
}

/** Le jeton d'accès courant ; s'il manque ou a expiré (champ `exp` du JWT), il est rafraîchi une fois avant l'envoi. */
export async function jetonValide(
  auth: Pick<AuthService, 'getAccessToken' | 'refreshOnce'>,
): Promise<string> {
  const jeton = auth.getAccessToken();
  if (jeton && !expire(jeton)) {
    return jeton;
  }
  await firstValueFrom(auth.refreshOnce());
  return auth.getAccessToken() ?? '';
}

function expire(jeton: string): boolean {
  try {
    const { exp } = JSON.parse(
      atob(jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return exp !== undefined && exp * 1000 <= Date.now() + 10_000;
  } catch {
    return false;
  }
}
