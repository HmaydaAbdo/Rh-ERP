import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CopilotChat, provideCopilotChatLabels } from '@copilotkit/angular';


/**
 * Le contenu de l'assistant : la discussion de CopilotKit telle quelle (messages, raisonnement repliable, consultations,
 * surfaces A2UI, suggestions, pouces, copie, régénération, saisie), avec ses libellés en français.
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
      chatDisclaimerText: 'L’assistant peut se tromper : les chiffres cités sont vérifiés, pas les interprétations.',
      welcomeMessageText: 'Que voulez-vous savoir sur vos équipes, vos chantiers ou la paie ?'
    })
  ],
  template: `<copilot-chat />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
  `
})
export class AssistantChatComponent {}
