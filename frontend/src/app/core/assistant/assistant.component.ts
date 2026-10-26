import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { CopilotKit, CopilotSidebar, connectAgentContext } from '@copilotkit/angular';
import { filter, map } from 'rxjs';

import { ThemeService } from '../theme/theme.service';
import { AssistantChatComponent } from './assistant-chat.component';
import { AssistantEnteteComponent } from './assistant-entete.component';
import { contexteEcran, suggestionsPour } from './ecran-assistant';

/**
 * Assistant RH : le panneau de CopilotKit, flottant au-dessus de l'écran à droite (il ne déplace ni ne réduit les vues), ouvert par `Ctrl K` (ou `⌘ K`) ou par son lanceur.
 * L'écran ouvert (domaine et filtres) part avec chaque question et les questions proposées s'adaptent à cet écran.
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
      mode="overlay"
      position="right"
      title="Assistant RH"
      [chatComponent]="chat"
      [headerComponent]="entete"
    />
  `
})
export class AssistantComponent {
  private readonly router = inject(Router);
  private readonly copilot = inject(CopilotKit);
  protected readonly theme = inject(ThemeService);

  protected readonly chat = AssistantChatComponent;
  protected readonly entete = AssistantEnteteComponent;
  readonly ouvert = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url }
  );

  constructor() {
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
  }

  /** `Ctrl K` (ou `⌘ K`) ouvre ou ferme l'assistant depuis n'importe quel écran. */
  raccourci(evenement: KeyboardEvent): void {
    if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k') {
      evenement.preventDefault();
      this.ouvert.update((ouvert) => !ouvert);
    }
  }
}
