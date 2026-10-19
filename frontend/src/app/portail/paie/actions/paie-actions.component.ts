import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { PaieExportWizardComponent } from '../export/paie-export-wizard.component';
import { PaieImportWizardComponent } from '../import/paie-import-wizard.component';
import { PaieService } from '../services/paie.service';

/**
 * Les actions de la paie — Exporter, Importer (avec le modèle Excel dans son menu) et Nouveau bulletin — posées une seule fois
 * dans l'en-tête de la page, à droite, au niveau du titre et des onglets : les mêmes dans les trois vues (voir `PaieVuesComponent`).
 * Chaque bouton n'apparaît qu'avec sa permission. « Importer » ouvre l'assistant d'import (`PaieImportWizardComponent`) ; un
 * import réussi prévient la page par `importe`, qui recharge la vue.
 */
@Component({
  selector: 'app-paie-actions',
  imports: [RouterLink, PaieExportWizardComponent, PaieImportWizardComponent, ButtonComponent, SplitButtonComponent],
  templateUrl: './paie-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieActionsComponent {
  /** Mois déjà importés, du plus récent au plus ancien (l'assistant d'import en déduit le mois à importer). */
  readonly periodes = input<string[]>([]);
  /** Des bulletins ont été importés : la vue affichée doit se recharger. */
  readonly importe = output<void>();

  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('PAIE_WRITE'));
  /** L'assistant analyse le fichier en le comparant aux fiches (salaires compris) : il demande aussi la lecture de la paie. */
  protected readonly canImport = computed(() => this.authService.hasPermission('PAIE_IMPORT') && this.authService.hasPermission('PAIE_READ'));
  protected readonly canExport = computed(() => this.authService.hasPermission('PAIE_EXPORT'));

  protected readonly showImportDialog = signal(false);
  protected readonly downloadingTemplate = signal(false);
  protected readonly showExportDialog = signal(false);

  /** Le modèle Excel se télécharge depuis le menu du bouton « Importer » : c'est le fichier qu'il attend. */
  protected readonly menuImport: MenuAction[] = [
    {
      label: 'Télécharger le modèle Excel',
      icon: 'file-spreadsheet',
      command: () => {
        if (!this.downloadingTemplate()) {
          this.onDownloadTemplate();
        }
      }
    }
  ];

  protected onDownloadTemplate(): void {
    this.downloadingTemplate.set(true);
    this.paieService
      .telechargerModele()
      .pipe(finalize(() => this.downloadingTemplate.set(false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Paie.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      });
  }
}
