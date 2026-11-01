import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CopilotChat, injectAgentStore, provideCopilotChatLabels } from '@copilotkit/angular';

import { MessageComponent } from '../../shared/ui/message/message.component';
import { FilAssistant } from './fil-assistant.service';


/**
 * Le contenu de l'assistant : la discussion de CopilotKit telle quelle (messages, raisonnement repliable, consultations,
 * surfaces A2UI, suggestions, pouces, copie, régénération, saisie), avec ses libellés en français, sur le fil de
 * l'utilisateur (repris après un rechargement).
 */
@Component({
  selector: 'app-assistant-chat',
  host: { class: 'flex h-full min-h-0 flex-col' },
  imports: [CopilotChat, MessageComponent],
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
      welcomeMessageText: 'Bonjour, je suis Staport Intelligence, votre assistant numérique. Je peux vous aider avec les informations et services accessibles à votre compte.'
    })
  ],
  template: `
    @if (erreur()) {
      <stp-message severity="error" class="erreur mx-4 my-3" text="Je n’ai pas pu terminer cette demande. Le service est momentanément indisponible ; réessayez dans un instant." />
    }
    <copilot-chat [threadId]="fil.fil()" />
  `
})
export class AssistantChatComponent {
  protected readonly fil = inject(FilAssistant);
  private readonly store = injectAgentStore('default');
  private readonly destroyRef = inject(DestroyRef);
  protected readonly erreur = signal(false);

  constructor() {
    const abonnement = this.store().agent.subscribe({
      onRunStartedEvent: () => this.erreur.set(false),
      onRunErrorEvent: () => this.erreur.set(true),
      onRunFailed: ({ error }) => {
        if (error.name !== 'AbortError') {
          this.erreur.set(true);
        }
      }
    });
    this.destroyRef.onDestroy(() => abonnement.unsubscribe());
  }
}
