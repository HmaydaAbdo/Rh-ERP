import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LucideCheck } from '@lucide/angular';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import type { DemandeEcriture } from './accord-ecriture';

const APERCU = 600;

/**
 * Accord de l'utilisateur avant que l'agent n'écrive dans son espace de fichiers : chemin et début du contenu, puis
 * Approuver ou Refuser. Rien n'est écrit tant que la réponse n'est pas donnée (interruption côté service IA).
 */
@Component({
  selector: 'app-accord-ecriture',
  imports: [LucideCheck, ButtonComponent],
  host: { class: 'my-2 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-ask" aria-label="Accord avant écriture">
      <p class="app-ask__title">
        L’assistant veut enregistrer {{ demandes().length > 1 ? 'des fichiers' : 'un fichier' }} dans votre espace.
      </p>
      @for (demande of apercus(); track demande.chemin) {
        <div class="demande">
          <p class="chemin">
            <strong>{{ demande.chemin }}</strong>
          </p>
          <pre class="apercu">{{ demande.apercu }}</pre>
        </div>
      }
      @if (!reponse()) {
        <div class="app-ask__free">
          <button type="button" stp-button class="approuver" (click)="repondre(true)">Approuver</button>
          <button type="button" stp-button class="refuser" (click)="repondre(false)">Refuser</button>
        </div>
      } @else {
        <p class="reponse app-ask__answer">
          <svg lucideCheck aria-hidden="true"></svg>
          {{ reponse() === 'oui' ? 'Écriture approuvée.' : 'Écriture refusée.' }}
        </p>
      }
    </section>
  `
})
export class AccordEcritureComponent {
  readonly demandes = input.required<readonly DemandeEcriture[]>();
  readonly decision = output<boolean>();

  protected readonly reponse = signal<'oui' | 'non' | null>(null);
  protected readonly apercus = computed(() =>
    this.demandes().map((demande) => ({
      chemin: demande.chemin,
      apercu: demande.contenu.length > APERCU ? `${demande.contenu.slice(0, APERCU)}…` : demande.contenu
    }))
  );

  protected repondre(approuve: boolean): void {
    if (this.reponse()) {
      return;
    }
    this.reponse.set(approuve ? 'oui' : 'non');
    this.decision.emit(approuve);
  }
}
