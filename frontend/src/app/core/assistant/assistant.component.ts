import { FilAssistant } from './fil-assistant.service';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { CopilotSidebar, connectAgentContext, registerFrontendTool, registerRenderToolCall } from '@copilotkit/angular';
import { filter, map } from 'rxjs';
import { z } from 'zod';

import { ThemeService } from '../theme/theme.service';
import { AssistantChatComponent } from './assistant-chat.component';
import { AssistantEnteteComponent } from './assistant-entete.component';
import { CarteOutilComponent } from './carte-outil.component';
import { contexteEcran } from './ecran-assistant';
import { ExportPaieAssistantComponent } from './export-paie-assistant.component';
import { OUTIL_EXPORT_PAIE } from './export-paie-assistant';
import { OUTIL_PROPOSER_VUE, validerVue } from './vue-assistant';
import { VueAssistantComponent } from './vue-assistant.component';

/**
 * Staport Intelligence : le panneau de CopilotKit, flottant au-dessus de l'écran à droite (il ne déplace ni ne réduit les vues), ouvert par `Ctrl K` (ou `⌘ K`) ou par son lanceur.
 * L'écran ouvert (domaine et filtres) part avec chaque question comme indice de contexte.
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
      [width]="fil.agrandi() ? 'min(56rem, 70vw)' : 480"
      title="Staport Intelligence"
      [chatComponent]="chat"
      [headerComponent]="entete"
    />
  `
})
export class AssistantComponent {
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  protected readonly fil = inject(FilAssistant);

  protected readonly chat = AssistantChatComponent;
  protected readonly entete = AssistantEnteteComponent;
  readonly ouvert = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url }
  );

  constructor() {
    // Le classeur de paie préparé par l'outil MCP s'affiche comme un bouton de téléchargement (KAN-266).
    registerRenderToolCall({
      name: OUTIL_EXPORT_PAIE,
      args: z.record(z.string(), z.unknown()),
      component: ExportPaieAssistantComponent
    });

    // Rendu universel (`*`) des consultations d'outils (KAN-87) : une carte au titre français, jamais le nom technique ;
    // le rendu du classeur de paie, enregistré par son nom, garde la priorité.
    registerRenderToolCall({ name: '*', args: z.record(z.string(), z.unknown()), component: CarteOutilComponent });

    // Outil frontend réversible (KAN-89) : l'agent propose une vue filtrée, l'utilisateur l'ouvre d'un clic (et peut
    // revenir). Rien ne s'ouvre seul, aucun droit n'est accordé ; les arguments du modèle sont revalidés ici.
    registerFrontendTool({
      name: OUTIL_PROPOSER_VUE,
      description:
        'Propose à l’utilisateur d’ouvrir une vue filtrée de l’application (bouton « Ouvrir la vue » dans la discussion). ' +
        'N’ouvre rien seul. Domaines : paie, employees, chantiers, equipes, functions, audit. ' +
        'Filtres : periode, chantierIds, equipeIds, fonctionIds, statut, actif, page.',
      parameters: z.object({
        domaine: z.enum(['paie', 'employees', 'chantiers', 'equipes', 'functions', 'audit']),
        filtres: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
      }),
      component: VueAssistantComponent,
      handler: async ({ domaine, filtres }) =>
        validerVue(domaine, filtres)
          ? 'Vue proposée à l’utilisateur : il peut l’ouvrir d’un clic ; elle n’accorde aucun droit.'
          : 'Proposition refusée : domaine ou filtre inconnu.'
    });

    // L'écran ouvert accompagne chaque question : indice de confiance limitée, revérifié par le serveur.
    connectAgentContext(() => ({
      description: 'Écran ouvert par l’utilisateur dans Staport Intelligence : son domaine et ses filtres (JSON).',
      value: JSON.stringify(contexteEcran(this.url()))
    }));

  }

  /** `Ctrl K` (ou `⌘ K`) ouvre ou ferme l'assistant depuis n'importe quel écran. */
  raccourci(evenement: KeyboardEvent): void {
    if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k') {
      evenement.preventDefault();
      this.ouvert.update((ouvert) => !ouvert);
    }
  }
}
