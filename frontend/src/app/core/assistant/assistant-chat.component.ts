import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CopilotChat, provideCopilotChatLabels } from '@copilotkit/angular';

import { IDENTIFIANT_AGENT } from './assistant-agent';
import { AssistantRaisonnementComponent } from './assistant-raisonnement.component';
import { AssistantVueOuverteComponent } from './assistant-vue-ouverte.component';

/**
 * Le contenu de l'assistant : la discussion de CopilotKit (messages, raisonnement repliable, plan, consultations,
 * suggestions, pouces, copie, régénération, saisie) avec, sous les messages, la vue ouverte et son retour.
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
  template: `<copilot-chat [agentId]="agent" [messageViewChildrenComponent]="vueOuverte" [reasoningMessageComponent]="raisonnement" />`,
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
  protected readonly agent = IDENTIFIANT_AGENT;
  protected readonly vueOuverte = AssistantVueOuverteComponent;
  protected readonly raisonnement = AssistantRaisonnementComponent;
}
