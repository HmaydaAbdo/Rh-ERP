import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { CopilotChat, CopilotKit, injectAgentStore, injectChatConfiguration, provideCopilotChatConfiguration, provideCopilotChatLabels } from '@copilotkit/angular';

import { MessageComponent } from '../../shared/ui/message/message.component';
import { AccordInterruptionComponent } from './accord-interruption.component';
import { CapacitesAssistant } from './capacites-assistant.service';
import { FilAssistant } from './fil-assistant.service';
import { ListeConversationsComponent } from './liste-conversations.component';
import { MemoireAssistantComponent } from './memoire-assistant.component';
import { RaisonnementAssistantComponent } from './raisonnement-assistant.component';

/** Code du `RUN_ERROR` du service IA pour une question refusée par le garde-fou : son message est destiné à l'utilisateur. */
const CODE_DEMANDE_BLOQUEE = 'DEMANDE_BLOQUEE';
const TEXTE_INDISPONIBLE = 'Je n’ai pas pu terminer cette demande. Le service est momentanément indisponible ; réessayez dans un instant.';

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
  host: { class: 'relative flex h-full min-h-0 flex-col' },
  imports: [CopilotChat, MessageComponent, AccordInterruptionComponent, ListeConversationsComponent, MemoireAssistantComponent],
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
    @if (erreur(); as texte) {
      <stp-message severity="error" class="erreur mx-4 my-3" [text]="texte" />
    }
    @if (capacites.erreurPiece(); as piece) {
      <stp-message severity="warn" class="piece mx-4 my-2" [text]="piece" />
    }
    <copilot-chat [reasoningMessageComponent]="raisonnement" [attachments]="capacites.pieces()" />
    @if (fil.listeOuverte()) {
      <app-liste-conversations />
    }
    @if (fil.memoireOuverte()) {
      <app-memoire-assistant />
    }
    <app-accord-interruption />
  `
})
export class AssistantChatComponent {
  protected readonly fil = inject(FilAssistant);
  /** Pièces jointes (KAN-93) : le bouton « Ajouter un fichier » n'apparaît que si le serveur les active. */
  protected readonly capacites = inject(CapacitesAssistant);
  /** Le message de raisonnement aux couleurs de Staport (emplacement officiel de la discussion, KAN-88). */
  protected readonly raisonnement = RaisonnementAssistantComponent;
  private readonly store = injectAgentStore('default');
  private readonly copilotKit = inject(CopilotKit);
  private readonly configuration = injectChatConfiguration();
  /** Le texte de l'erreur du dernier run, ou `null` : celui du service pour un refus du garde-fou, sinon la panne générique. */
  protected readonly erreur = signal<string | null>(null);

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
          this.erreur.set(null);
          this.fil.marquerUtilise();
        },
        onRunFinishedEvent: () => {
          termine = true;
          void this.fil.rafraichir();
        },
        onRunErrorEvent: ({ event }) => {
          termine = true;
          this.erreur.set(event.code === CODE_DEMANDE_BLOQUEE ? event.message : TEXTE_INDISPONIBLE);
        },
        onRunFailed: ({ error }) => {
          termine = true;
          if (error.name !== 'AbortError') {
            this.erreur.set(TEXTE_INDISPONIBLE);
          }
        },
        onRunFinalized: () => {
          if (!termine) {
            termine = true;
            void this.copilotKit.core.connectAgent({ agent }).catch(() => this.erreur.set(TEXTE_INDISPONIBLE));
          }
        }
      });
      surNettoyage(() => abonnement.unsubscribe());
    });
  }
}
