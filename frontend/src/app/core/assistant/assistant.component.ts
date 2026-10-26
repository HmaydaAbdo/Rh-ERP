import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { CopilotKit, CopilotSidebar, connectAgentContext, injectAgentStore } from '@copilotkit/angular';
import { filter, map } from 'rxjs';

import { ThemeService } from '../theme/theme.service';
import { AuthService } from '../auth/services/auth.service';
import { IDENTIFIANT_AGENT } from './assistant-agent';
import { brancherAssistant } from './assistant.providers';
import { AssistantChatComponent } from './assistant-chat.component';
import { contexteEcran, suggestionsPour } from './ecran-assistant';
import { OuvertureVueService } from './ouverture-vue.service';

/**
 * Assistant RH : la barre latérale de CopilotKit, ancrée à droite, ouverte par `Ctrl K` (ou `⌘ K`) ou par son lanceur.
 * Elle porte aussi trois liens entre l'écran et l'agent : l'écran ouvert (domaine et filtres) part avec chaque question,
 * les questions proposées s'adaptent à cet écran, et la vue de la réponse vérifiée s'ouvre toute seule.
 */
@Component({
  selector: 'app-assistant-interne',
  imports: [CopilotSidebar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `dark` : le mode sombre de la bibliothèque suit le thème de l'application (qui porte `data-theme`, pas cette classe).
  host: { '(document:keydown)': 'raccourci($event)', '[class.dark]': "theme.theme() === 'dark'" },
  template: `
    <copilot-sidebar
      [(open)]="ouvert"
      mode="docked"
      position="right"
      title="Assistant RH"
      [chatComponent]="chat"
    />
  `
})
export class AssistantComponent {
  private readonly router = inject(Router);
  private readonly copilot = inject(CopilotKit);
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly ouvertureVue = inject(OuvertureVueService);
  private readonly agent = injectAgentStore(IDENTIFIANT_AGENT);

  protected readonly chat = AssistantChatComponent;
  readonly ouvert = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url }
  );

  constructor() {
    brancherAssistant(this.copilot, this.auth);

    // L'écran ouvert accompagne chaque question : indice de confiance limitée, revérifié par le serveur.
    connectAgentContext(() => ({
      description: 'Écran ouvert par l’utilisateur dans ERP-RH : son domaine et ses filtres (JSON).',
      value: JSON.stringify(contexteEcran(this.url()))
    }));

    // Questions proposées à l'ouverture d'une discussion vide, adaptées au domaine de l'écran.
    effect((nettoyer) => {
      const identifiant = this.copilot.core.addSuggestionsConfig({
        suggestions: [...suggestionsPour(this.url())],
        available: 'before-first-message'
      });
      nettoyer(() => this.copilot.core.removeSuggestionsConfig(identifiant));
    });

    // La vue de la réponse s'ouvre une fois la réponse vérifiée (jamais sur une abstention ni une erreur).
    let verifiee = false;
    effect(() => {
      const etat = this.agent().state() as { verification?: string; vue?: unknown } | undefined;
      const maintenant = etat?.verification === 'verifiee';
      const vue = etat?.vue ?? null;
      if (maintenant && !verifiee && vue) {
        const messages = untracked(() => this.agent().messages());
        const derniere = [...messages].reverse().find((m) => m.role === 'assistant' && typeof m.content === 'string');
        void this.ouvertureVue.ouvrir(vue, typeof derniere?.content === 'string' ? derniere.content : '');
      } else if (etat?.verification === 'en_cours') {
        untracked(() => this.ouvertureVue.oublier());
      }
      verifiee = maintenant;
    });
  }

  /** `Ctrl K` (ou `⌘ K`) ouvre ou ferme l'assistant depuis n'importe quel écran. */
  raccourci(evenement: KeyboardEvent): void {
    if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k') {
      evenement.preventDefault();
      this.ouvert.update((ouvert) => !ouvert);
    }
  }
}
