import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CopilotChat, provideCopilotChatLabels } from '@copilotkit/angular';

import { FilAssistant } from './fil-assistant.service';


/**
 * Le contenu de l'assistant : la discussion de CopilotKit telle quelle (messages, raisonnement repliable, consultations,
 * surfaces A2UI, suggestions, pouces, copie, régénération, saisie), avec ses libellés en français, sur le fil de
 * l'utilisateur (repris après un rechargement).
 */
@Component({
  selector: 'app-assistant-chat',
  imports: [CopilotChat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideCopilotChatLabels({
      chatInputPlaceholder: 'Posez votre question…',
      chatInputToolbarAddButtonLabel: 'Ajouter un fichier',
      chatInputToolbarToolsButtonLabel: 'Outils',
      chatInputToolbarStartTranscribeButtonLabel: 'Dicter',
      chatInputToolbarCancelTranscribeButtonLabel: 'Annuler',
      chatInputToolbarFinishTranscribeButtonLabel: 'Terminer',
      assistantMessageToolbarCopyMessageLabel: 'Copier',
      assistantMessageToolbarCopyCodeLabel: 'Copier',
      assistantMessageToolbarCopyCodeCopiedLabel: 'Copié',
      assistantMessageToolbarThumbsUpLabel: 'Réponse utile',
      assistantMessageToolbarThumbsDownLabel: 'Réponse à revoir',
      assistantMessageToolbarReadAloudLabel: 'Lire à voix haute',
      assistantMessageToolbarRegenerateLabel: 'Régénérer',
      userMessageToolbarCopyMessageLabel: 'Copier',
      userMessageToolbarEditMessageLabel: 'Modifier',
      // Pas d'avertissement permanent sous la saisie : la vérification des chiffres se voit dans la réponse.
      chatDisclaimerText: '',
      welcomeMessageText: 'Que voulez-vous savoir sur vos équipes, vos chantiers ou la paie ?'
    })
  ],
  template: `<copilot-chat [threadId]="fil.fil()" />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
  `
})
export class AssistantChatComponent {
  protected readonly fil = inject(FilAssistant);
}
