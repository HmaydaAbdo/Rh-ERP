import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ToolRenderer } from '@copilotkit/angular';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import { lireDocumentGenere } from './document-genere-assistant';
import { FichiersAssistant } from './fichiers-assistant.service';

type Appel = ReturnType<ToolRenderer['toolCall']>;

/**
 * Le document que l'assistant vient de créer (Word, PowerPoint, Excel, PDF) : un bouton qui le télécharge depuis
 * l'espace de l'utilisateur, avec sa connexion. Le chemin ne s'affiche jamais ; le service IA ne rend que les fichiers
 * de l'utilisateur connecté.
 */
@Component({
  selector: 'app-document-genere-assistant',
  imports: [ButtonComponent],
  host: { class: 'my-2 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (document(); as pret) {
      <button type="button" stp-button class="telecharger" [disabled]="occupe()" (click)="telecharger(pret.chemin)">
        Télécharger {{ pret.nom }}
      </button>
      @if (erreur()) {
        <p class="erreur" role="alert">Le téléchargement a échoué : le fichier a peut-être été supprimé, redemandez-le.</p>
      }
    } @else if (enCours()) {
      <p class="en-cours" role="status">Création du document…</p>
    }
  `
})
export class DocumentGenereAssistantComponent implements ToolRenderer {
  readonly toolCall = input.required<Appel>();

  private readonly fichiers = inject(FichiersAssistant);
  protected readonly occupe = signal(false);
  protected readonly erreur = signal(false);
  protected readonly enCours = computed(() => this.toolCall().status !== 'complete');
  protected readonly document = computed(() => {
    const appel = this.toolCall();
    return appel.status === 'complete' ? lireDocumentGenere(appel.result) : null;
  });

  protected async telecharger(chemin: string): Promise<void> {
    this.occupe.set(true);
    this.erreur.set(false);
    try {
      await this.fichiers.telecharger(chemin);
    } catch {
      this.erreur.set(true);
    } finally {
      this.occupe.set(false);
    }
  }
}
