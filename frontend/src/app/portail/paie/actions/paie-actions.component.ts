import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { PaieExportWizardComponent } from '../export/paie-export-wizard.component';
import { PaieImportResult } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

function toPeriodeString(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Les actions de la paie — Exporter, Importer (avec le modèle Excel dans son menu) et Nouveau bulletin — posées une seule fois
 * dans l'en-tête de la page, à droite, au niveau du titre et des onglets : les mêmes dans les trois vues (voir `PaieVuesComponent`).
 * Chaque bouton n'apparaît qu'avec sa permission. Un import réussi (ou partiel) prévient la page par `importe`, qui recharge la vue.
 */
@Component({
  selector: 'app-paie-actions',
  imports: [FormField, FormRoot, RouterLink, PaieExportWizardComponent, ButtonComponent, DialogComponent, SplitButtonComponent, MonthInputComponent],
  templateUrl: './paie-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-actions.component.scss'
})
export class PaieActionsComponent {
  /** Des bulletins ont été importés : la vue affichée doit se recharger. */
  readonly importe = output<void>();

  private readonly paieService = inject(PaieService);
  private readonly messageService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('PAIE_WRITE'));
  protected readonly canImport = computed(() => this.authService.hasPermission('PAIE_IMPORT'));
  protected readonly canExport = computed(() => this.authService.hasPermission('PAIE_EXPORT'));

  protected readonly showImportDialog = signal(false);
  protected readonly importing = signal(false);
  protected readonly importResult = signal<PaieImportResult | null>(null);
  protected readonly showImportResultDialog = signal(false);
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

  private readonly saisieImport = signal<{ periode: Date | null }>({ periode: null });
  protected readonly importForm = form(this.saisieImport);

  protected onOpenImportDialog(): void {
    this.importForm().reset({ periode: null });
    this.showImportDialog.set(true);
  }

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

  protected onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const periode = toPeriodeString(this.saisieImport().periode);
    input.value = '';
    if (!file || !periode) {
      return;
    }

    this.importing.set(true);
    this.paieService
      .importer(file, periode)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: (result) => {
          this.showImportDialog.set(false);
          this.importResult.set(result);
          this.showImportResultDialog.set(true);
          const fonctionsCreeesDetail =
            result.fonctionsCreees.length > 0 ? ` — ${result.fonctionsCreees.length} fonction(s) créée(s) : ${result.fonctionsCreees.join(', ')}` : '';
          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `${result.crees} créé(s) sur ${result.totalLignes} ligne(s)${fonctionsCreeesDetail}`,
            life: 8000
          });
          this.importe.emit();
        },
        error: (err: HttpErrorResponse) => {
          const result = err.error as PaieImportResult | null;
          if (result && Array.isArray(result.lignesIgnorees)) {
            this.showImportDialog.set(false);
            this.importResult.set(result);
            this.showImportResultDialog.set(true);
          }
        }
      });
  }
}
