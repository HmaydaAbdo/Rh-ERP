import { FilAssistant, ROUTE_ESPACE_ASSISTANT } from './fil-assistant.service';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { connectAgentContext, registerRenderToolCall } from '@copilotkit/angular';
import { LucideSparkles } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { z } from 'zod';

import { ThemeService } from '../theme/theme.service';
import { CarteOutilComponent } from './carte-outil.component';
import { contexteEcran } from './ecran-assistant';
import { EspaceAssistantComponent } from './espace-assistant.component';
import { ExportPaieAssistantComponent } from './export-paie-assistant.component';
import { OUTIL_EXPORT_PAIE } from './export-paie-assistant';

/**
 * Staport Intelligence : l'icône flottante de l'assistant, présente sur tous les écrans, ouvre l'espace dédié à l'IA
 * (KAN-91, route `/assistant`, plein écran) ; `Ctrl K` (ou `⌘ K`) l'ouvre et le referme. Dans l'espace, l'écran
 * d'origine (domaine et filtres) part avec chaque question comme indice de contexte.
 */
@Component({
  selector: 'app-assistant-interne',
  imports: [EspaceAssistantComponent, LucideSparkles],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `dark` : le mode sombre de la bibliothèque suit le thème de l'application (qui porte `data-theme`, pas cette classe).
  host: { '(document:keydown)': 'raccourci($event)', '[class.dark]': "theme.theme() === 'dark'" },
  template: `
    @if (enEspace()) {
      <app-espace-assistant />
    } @else {
      <button
        type="button"
        class="lanceur fixed end-4 bottom-4 z-40 grid size-12 cursor-pointer place-items-center rounded-full border-0 bg-primary text-primary-contrast shadow-lg hover:opacity-90"
        aria-label="Ouvrir Staport Intelligence"
        title="Staport Intelligence (Ctrl K)"
        (click)="ouvrir()"
      >
        <svg lucideSparkles class="size-6" aria-hidden="true"></svg>
      </button>
    }
  `
})
export class AssistantComponent {
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  protected readonly fil = inject(FilAssistant);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url }
  );
  readonly enEspace = computed(() => this.url().split(/[?#]/, 1)[0] === ROUTE_ESPACE_ASSISTANT);

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

    // L'écran d'où l'utilisateur vient accompagne chaque question : indice de confiance limitée, revérifié par le serveur.
    // Dans l'espace, c'est l'écran d'origine (celui d'où l'on est parti), pas la page de l'assistant.
    connectAgentContext(() => ({
      description: 'Écran ouvert par l’utilisateur dans Staport Intelligence : son domaine et ses filtres (JSON).',
      value: JSON.stringify(contexteEcran(this.enEspace() ? (this.fil.origine() ?? '/') : this.url()))
    }));
  }

  /** Ouvre l'espace en retenant l'écran d'origine, pour le « Retour ». */
  ouvrir(): void {
    this.fil.ouvrirEspace();
  }

  /** `Ctrl K` (ou `⌘ K`) ouvre l'espace depuis n'importe quel écran, et le referme. */
  raccourci(evenement: KeyboardEvent): void {
    if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'k') {
      evenement.preventDefault();
      if (this.enEspace()) {
        this.fil.quitter();
      } else {
        this.ouvrir();
      }
    }
  }
}
