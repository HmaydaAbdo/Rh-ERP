import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideCheck, LucideTrash2, LucideX } from '@lucide/angular';

import { MemoireAssistant, TAILLE_MAX_MEMOIRE } from './memoire-assistant.service';

/**
 * Ce que l'assistant retient de l'utilisateur, affiché par-dessus la discussion (KAN-84) : lire, corriger, tout
 * oublier. L'assistant ne retient qu'avec l'accord de l'utilisateur ; ce panneau lui donne la main directe.
 */
@Component({
  selector: 'app-memoire-assistant',
  host: { class: 'absolute inset-0 z-10 flex min-h-0 flex-col bg-surface' },
  imports: [DatePipe, FormsModule, LucideCheck, LucideTrash2, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="m-0 border-b border-border px-4 py-3 text-sm font-semibold text-text">Ce que l’assistant retient</h3>
    <div class="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <p class="m-0 text-xs text-muted">
        Vos préférences et des faits sur votre rôle, retenus d’une conversation à l’autre avec votre accord. Vous pouvez les corriger ou tout oublier ;
        ils expirent après une longue inactivité.
      </p>
      <textarea class="min-h-0 flex-1 resize-none rounded-md border border-border bg-surface p-2 text-sm text-text" [(ngModel)]="texte" [maxLength]="max" aria-label="Contenu de la mémoire" placeholder="Rien n’est retenu pour le moment. Demandez par exemple : « retiens que je suis responsable du chantier Atlas »."></textarea>
      <div class="flex items-center gap-2">
        <span class="flex-1 text-xs text-muted">
          @if (memoire.modifie()) { Modifié le {{ memoire.modifie() | date: 'dd/MM/yyyy HH:mm' }} · }
          {{ texte.length }} / {{ max }}
        </span>
        @if (oubli()) {
          <span class="text-sm text-text">Tout oublier ?</span>
          <button type="button" class="grid size-8 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="confirmerOubli()" aria-label="Confirmer l’oubli"><svg lucideCheck class="size-4" aria-hidden="true"></svg></button>
          <button type="button" class="grid size-8 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="oubli.set(false)" aria-label="Annuler"><svg lucideX class="size-4" aria-hidden="true"></svg></button>
        } @else {
          <button type="button" class="grid size-8 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="oubli.set(true)" [disabled]="!memoire.contenu()" aria-label="Tout oublier"><svg lucideTrash2 class="size-4" aria-hidden="true"></svg></button>
          <button type="button" class="cursor-pointer rounded-md border-0 bg-primary px-3 py-1 text-sm text-primary-contrast disabled:cursor-default disabled:opacity-50" (click)="enregistrer()" [disabled]="texte === memoire.contenu()">Enregistrer</button>
        }
      </div>
    </div>
  `,
})
export class MemoireAssistantComponent {
  protected readonly memoire = inject(MemoireAssistant);
  protected readonly max = TAILLE_MAX_MEMOIRE;
  protected readonly oubli = signal(false);
  protected texte = '';

  constructor() {
    // Le texte affiché suit la mémoire : chargement initial, puis après chaque enregistrement ou oubli.
    effect(() => {
      const contenu = this.memoire.contenu();
      untracked(() => (this.texte = contenu));
    });
    void this.memoire.charger();
  }

  protected async enregistrer(): Promise<void> {
    await this.memoire.enregistrer(this.texte);
  }

  protected async confirmerOubli(): Promise<void> {
    this.oubli.set(false);
    await this.memoire.oublier();
  }
}
