import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { CopilotChat, CopilotKit, injectAgentStore, injectChatConfiguration, provideCopilotChatConfiguration, provideCopilotChatLabels } from '@copilotkit/angular';

import { MessageComponent } from '../../shared/ui/message/message.component';
import { FilAssistant } from './fil-assistant.service';


/**
 * Le contenu de l'assistant : la discussion de CopilotKit telle quelle (messages, raisonnement repliable, consultations,
 * surfaces A2UI, suggestions, pouces, copie, régénération, saisie), avec ses libellés en français, sur le fil de
 * l'utilisateur (repris après un rechargement).
 *
 * Le fil est donné à la configuration de la discussion (`setActiveThreadId`) et non à `[threadId]`, qui le déclare
 * toujours « explicite » : CopilotKit masque alors son écran d'accueil et rejoue l'historique (`connect`) même pour une
 * conversation neuve. Un fil neuf est donc déclaré non explicite (accueil visible, rien à rejouer) ; un fil déjà
 * commencé est explicite (historique repris). Le choix se fait à la sélection du fil, jamais en cours de conversation.
 */
@Component({
  selector: 'app-assistant-chat',
  host: { class: 'flex h-full min-h-0 flex-col' },
  imports: [CopilotChat, MessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideCopilotChatConfiguration(),
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
    <copilot-chat />
  `
})
export class AssistantChatComponent {
  protected readonly fil = inject(FilAssistant);
  private readonly store = injectAgentStore('default');
  private readonly copilotKit = inject(CopilotKit);
  private readonly configuration = injectChatConfiguration();
  protected readonly erreur = signal(false);

  constructor() {
    effect(() => {
      const fil = this.fil.fil();
      if (fil !== undefined) {
        const repris = untracked(() => this.fil.estUtilise());
        this.configuration.setActiveThreadId(fil, { explicit: repris });
      }
    });
    // L'agent du magasin est remplacé quand le runtime répond à `/info` (agent provisoire puis agent distant) : on suit
    // le magasin courant, sinon les runs de l'agent distant échapperaient à ces abonnements.
    effect((surNettoyage) => {
      const agent = this.store().agent;
      // Un run dont le flux se termine sans événement final (coupure du réseau ou d'un relais) continue côté serveur :
      // sa réponse est dans l'historique du fil. On se rattache alors au fil par `connectAgent`, comme à son ouverture.
      let termine = true;
      const abonnement = agent.subscribe({
        onRunStartedEvent: () => {
          termine = false;
          this.erreur.set(false);
          this.fil.marquerUtilise();
        },
        onRunFinishedEvent: () => {
          termine = true;
        },
        onRunErrorEvent: () => {
          termine = true;
          this.erreur.set(true);
        },
        onRunFailed: ({ error }) => {
          termine = true;
          if (error.name !== 'AbortError') {
            this.erreur.set(true);
          }
        },
        onRunFinalized: () => {
          if (!termine) {
            termine = true;
            void this.copilotKit.core.connectAgent({ agent }).catch(() => this.erreur.set(true));
          }
        }
      });
      surNettoyage(() => abonnement.unsubscribe());
    });
  }
}
