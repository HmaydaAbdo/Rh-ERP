import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationService } from '@shared/feedback/feedback.service';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';
import { SplitButtonModule } from 'primeng/splitbutton';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
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
    imports: [
        ReactiveFormsModule,
        RouterLink,
        ButtonModule,
        CalendarModule,
        DialogModule,
        SplitButtonModule,
        PaieExportWizardComponent
    ],
    templateUrl: './paie-actions.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './paie-actions.component.scss'
})
export class PaieActionsComponent {
  /** Des bulletins ont été importés : la vue affichée doit se recharger. */
  @Output() readonly importe = new EventEmitter<void>();

  private readonly paieService = inject(PaieService);
  private readonly messageService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  canWrite(): boolean {
    return this.authService.hasPermission('PAIE_WRITE');
  }

  canImport(): boolean {
    return this.authService.hasPermission('PAIE_IMPORT');
  }

  canExport(): boolean {
    return this.authService.hasPermission('PAIE_EXPORT');
  }

  showImportDialog = false;
  importing = false;
  importResult: PaieImportResult | null = null;
  showImportResultDialog = false;
  downloadingTemplate = false;
  showExportDialog = false;

  /** Le modèle Excel se télécharge depuis le menu du bouton « Importer » : c'est le fichier qu'il attend. */
  readonly menuImport: MenuItem[] = [
    {
      label: 'Télécharger le modèle Excel',
      icon: 'pi pi-file-excel',
      command: () => {
        if (!this.downloadingTemplate) {
          this.onDownloadTemplate();
        }
      }
    }
  ];

  readonly importForm = this.fb.group({
    periode: [null as Date | null]
  });

  onOpenImportDialog(): void {
    this.importForm.reset();
    this.showImportDialog = true;
  }

  onDownloadTemplate(): void {
    this.downloadingTemplate = true;
    this.paieService
      .telechargerModele()
      .pipe(finalize(() => (this.downloadingTemplate = false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Paie.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const periode = toPeriodeString(this.importForm.controls.periode.value);
    input.value = '';
    if (!file || !periode) {
      return;
    }

    this.importing = true;
    this.paieService
      .importer(file, periode)
      .pipe(finalize(() => (this.importing = false)))
      .subscribe({
        next: (result) => {
          this.showImportDialog = false;
          this.importResult = result;
          this.showImportResultDialog = true;
          const fonctionsCreeesDetail = result.fonctionsCreees.length > 0
            ? ` — ${result.fonctionsCreees.length} fonction(s) créée(s) : ${result.fonctionsCreees.join(', ')}`
            : '';
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
            this.showImportDialog = false;
            this.importResult = result;
            this.showImportResultDialog = true;
          }
        }
      });
  }
}
