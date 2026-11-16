import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideArrowLeft, LucideBrain, LucideHistory, LucideMoon, LucideSparkles, LucideSquarePen, LucideSun } from '@lucide/angular';

import { ThemeService } from '../theme/theme.service';

import { AssistantChatComponent } from './assistant-chat.component';
import { FilAssistant } from './fil-assistant.service';
import { InfobullesAssistantDirective } from './infobulles-assistant.directive';
import { ListeConversationsComponent } from './liste-conversations.component';

/**
 * L'espace Staport Intelligence (KAN-91) : un univers dédié à l'IA, plein écran, ouvert par l'icône de l'assistant.
 * Barre latérale des conversations (titres, reprise, renommage, suppression) à gauche ; à droite, la discussion officielle
 * de CopilotKit, la même que celle du panneau d'origine (mêmes cartes, raisonnement, surfaces, mémoire, accords) : la
 * parité vient de ce que le composant est réutilisé, non réécrit. « Retour » ramène à l'écran d'où l'on vient.
 */
@Component({
  selector: 'app-espace-assistant',
  imports: [AssistantChatComponent, InfobullesAssistantDirective, ListeConversationsComponent, LucideArrowLeft, LucideBrain, LucideHistory, LucideMoon, LucideSparkles, LucideSquarePen, LucideSun],
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section appInfobulles class="espace-assistant fixed inset-0 z-[500] flex bg-surface text-text" role="region" aria-label="Staport Intelligence">
      <aside class="hidden w-72 flex-none flex-col border-0 border-e border-solid border-border bg-surface-alt md:flex" aria-label="Conversations">
        <div class="flex items-center gap-2 px-3 py-3">
          <span class="relative size-(--control-height) flex-none" aria-hidden="true">
            <img class="block size-full rounded-md" src="assets/brand/monogramme.svg" alt="" />
            <span class="pastille-ia absolute end-0 bottom-0 grid size-4 place-items-center rounded-full border border-surface"><svg lucideSparkles class="size-3"></svg></span>
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="m-0 truncate text-md font-semibold text-text">Staport Intelligence</h2>
            <p class="m-0 text-xs text-muted">Votre assistant numérique</p>
          </div>
        </div>
        <div class="px-3 pb-2">
          <button type="button" class="nouvelle-conversation flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium" (click)="fil.nouveau()">
            <svg lucideSquarePen class="size-4 flex-none" aria-hidden="true"></svg>
            Nouvelle conversation
          </button>
        </div>
        <app-liste-conversations [lateral]="true" />
        <div class="pied-espace mt-auto flex flex-col gap-1 border-0 border-t border-solid border-border p-2">
          <button type="button" class="action-espace" (click)="fil.listeOuverte.set(false); fil.memoireOuverte.set(!fil.memoireOuverte())" aria-label="Ce que l’assistant retient" [attr.aria-pressed]="fil.memoireOuverte()">
            <svg lucideBrain class="size-4 flex-none" aria-hidden="true"></svg>
            <span>Ce que l’assistant retient</span>
          </button>
          <button type="button" class="action-espace bascule-theme" (click)="theme.basculer()" [attr.aria-label]="theme.theme() === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'">
            @if (theme.theme() === 'dark') {
              <svg lucideSun class="size-4 flex-none" aria-hidden="true"></svg>
              <span>Thème clair</span>
            } @else {
              <svg lucideMoon class="size-4 flex-none" aria-hidden="true"></svg>
              <span>Thème sombre</span>
            }
          </button>
        </div>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-2 border-0 border-b border-solid border-border px-3 py-2">
          <button type="button" class="retour inline-flex cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-muted hover:bg-surface-alt hover:text-text" (click)="fil.quitter()">
            <svg lucideArrowLeft class="size-4" aria-hidden="true"></svg>
            Retour à l’application
          </button>
          <span class="flex-1"></span>
          <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text md:hidden" (click)="fil.memoireOuverte.set(false); fil.listeOuverte.set(!fil.listeOuverte())" aria-label="Conversations" title="Conversations" [attr.aria-pressed]="fil.listeOuverte()">
            <svg lucideHistory class="size-4" aria-hidden="true"></svg>
          </button>
          <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text md:hidden" (click)="fil.listeOuverte.set(false); fil.memoireOuverte.set(!fil.memoireOuverte())" aria-label="Ce que l’assistant retient" title="Ce que l’assistant retient" [attr.aria-pressed]="fil.memoireOuverte()">
            <svg lucideBrain class="size-4" aria-hidden="true"></svg>
          </button>
          <button type="button" class="bascule-theme grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text md:hidden" (click)="theme.basculer()" [attr.aria-label]="theme.theme() === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'" [attr.title]="theme.theme() === 'dark' ? 'Thème clair' : 'Thème sombre'">
            @if (theme.theme() === 'dark') {
              <svg lucideSun class="size-4" aria-hidden="true"></svg>
            } @else {
              <svg lucideMoon class="size-4" aria-hidden="true"></svg>
            }
          </button>
          <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text md:hidden" (click)="fil.nouveau()" aria-label="Nouvelle conversation" title="Nouvelle conversation">
            <svg lucideSquarePen class="size-4" aria-hidden="true"></svg>
          </button>
        </header>
        <div class="espace-assistant-discussion min-h-0 w-full flex-1">
          <app-assistant-chat />
        </div>
      </div>
    </section>
  `
})
export class EspaceAssistantComponent {
  protected readonly fil = inject(FilAssistant);
  /** Le thème : l'espace couvre tout l'écran et masque la barre de l'application, qui porte sinon la bascule. */
  protected readonly theme = inject(ThemeService);
}
