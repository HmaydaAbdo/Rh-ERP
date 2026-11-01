import { Injectable, signal } from '@angular/core';

/**
 * Ouverture de Staport Intelligence : un seul état, partagé par le panneau de l'assistant, son raccourci clavier et le mode de la
 * barre Staport (Application / Staport Intelligence). Le lanceur flottant de CopilotKit est masqué : la barre le remplace.
 */
@Injectable({ providedIn: 'root' })
export class AssistantEtatService {
  readonly ouvert = signal(false);
}
