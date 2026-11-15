import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCheck, LucidePencil, LucideTrash2, LucideX } from '@lucide/angular';

import { Conversation, FilAssistant } from './fil-assistant.service';

/**
 * Liste des conversations de l'assistant, affichée par-dessus la discussion (KAN-81). CopilotKit ne fournit ce panneau
 * qu'avec Intelligence (service hébergé) : celui-ci en reprend l'ergonomie (liste, reprise, renommage, suppression) avec
 * les composants et couleurs de l'ERP ; les données viennent du runtime (`/copilotkit/conversations`).
 */
@Component({
  selector: 'app-liste-conversations',
  host: { class: 'absolute inset-0 z-10 flex min-h-0 flex-col bg-surface' },
  imports: [DatePipe, FormsModule, LucideCheck, LucidePencil, LucideTrash2, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="m-0 border-b border-border px-4 py-3 text-sm font-semibold text-text">Conversations</h3>
    <ul class="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2" aria-label="Conversations">
      @for (conversation of fil.conversations(); track conversation.id) {
        <li class="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-alt" [class.bg-surface-alt]="conversation.id === fil.fil()">
          @if (edition() === conversation.id) {
            <input class="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text" [(ngModel)]="titre" (keydown.enter)="valider(conversation)" (keydown.escape)="edition.set(null)" aria-label="Nouveau nom de la conversation" />
            <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="valider(conversation)" aria-label="Enregistrer le nom"><svg lucideCheck class="size-4" aria-hidden="true"></svg></button>
            <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="edition.set(null)" aria-label="Annuler"><svg lucideX class="size-4" aria-hidden="true"></svg></button>
          } @else if (suppression() === conversation.id) {
            <span class="min-w-0 flex-1 text-sm text-text">Supprimer définitivement ?</span>
            <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="confirmer(conversation)" aria-label="Confirmer la suppression"><svg lucideCheck class="size-4" aria-hidden="true"></svg></button>
            <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="suppression.set(null)" aria-label="Annuler"><svg lucideX class="size-4" aria-hidden="true"></svg></button>
          } @else {
            <button type="button" class="ouvrir min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-start" (click)="fil.ouvrir(conversation.id)">
              <span class="block truncate text-sm text-text">{{ conversation.title }}</span>
              <span class="block text-xs text-muted">{{ conversation.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</span>
            </button>
            <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="renommer(conversation)" aria-label="Renommer la conversation"><svg lucidePencil class="size-4" aria-hidden="true"></svg></button>
            <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="suppression.set(conversation.id)" aria-label="Supprimer la conversation"><svg lucideTrash2 class="size-4" aria-hidden="true"></svg></button>
          }
        </li>
      } @empty {
        <li class="px-2 py-3 text-sm text-muted">Aucune conversation pour le moment.</li>
      }
    </ul>
  `,
})
export class ListeConversationsComponent {
  protected readonly fil = inject(FilAssistant);
  protected readonly edition = signal<string | null>(null);
  protected readonly suppression = signal<string | null>(null);
  protected titre = '';

  constructor() {
    void this.fil.rafraichir();
  }

  protected renommer(conversation: Conversation): void {
    this.titre = conversation.title;
    this.suppression.set(null);
    this.edition.set(conversation.id);
  }

  protected async valider(conversation: Conversation): Promise<void> {
    const titre = this.titre.trim();
    this.edition.set(null);
    if (titre && titre !== conversation.title) {
      await this.fil.renommer(conversation.id, titre);
    }
  }

  protected async confirmer(conversation: Conversation): Promise<void> {
    this.suppression.set(null);
    await this.fil.supprimer(conversation.id);
  }
}
