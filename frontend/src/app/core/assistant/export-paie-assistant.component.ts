import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ToolRenderer } from '@copilotkit/angular';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import { lireExportPrepare } from './export-paie-assistant';
import { FichiersAssistant } from './fichiers-assistant.service';

type Appel = ReturnType<ToolRenderer['toolCall']>;

/**
 * Le classeur de paie préparé par l'assistant : un bouton qui le télécharge avec la connexion de l'utilisateur. La
 * référence (5 minutes) n'apparaît jamais dans la discussion ; le serveur vérifie qu'elle lui est réservée.
 */
@Component({
  selector: 'app-export-paie-assistant',
  imports: [ButtonComponent],
  host: { class: 'my-2 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (export(); as prepare) {
      <button type="button" stp-button class="telecharger" [disabled]="occupe()" (click)="telecharger(prepare)">
        Télécharger {{ prepare.nomFichier }}
      </button>
      @if (erreur()) {
        <p class="erreur" role="alert">Le téléchargement a échoué : la référence a peut-être expiré, redemandez le fichier.</p>
      }
    }
  `
})
export class ExportPaieAssistantComponent implements ToolRenderer {
  readonly toolCall = input.required<Appel>();

  private readonly fichiers = inject(FichiersAssistant);
  protected readonly occupe = signal(false);
  protected readonly erreur = signal(false);
  protected readonly export = computed(() => {
    const appel = this.toolCall();
    return appel.status === 'complete' ? lireExportPrepare(appel.result) : null;
  });

  protected async telecharger(prepare: { reference: string; nomFichier: string }): Promise<void> {
    this.occupe.set(true);
    this.erreur.set(false);
    try {
      await this.fichiers.telechargerExport(prepare.reference, prepare.nomFichier);
    } catch {
      this.erreur.set(true);
    } finally {
      this.occupe.set(false);
    }
  }
}
