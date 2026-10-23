import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { FunctionImportResult } from '../models/function.model';
import { FunctionService } from '../services/function.service';

/**
 * Les actions des fonctions — Importer (avec le modèle Excel dans son menu) et Nouvelle fonction — posées une seule fois dans
 * l'en-tête de la page (voir `FunctionVuesComponent`). Chaque bouton n'apparaît qu'avec sa permission. Un import réussi prévient
 * la page par `importe`, qui recharge la vue.
 */
@Component({
  selector: 'app-function-actions',
  imports: [RouterLink, ButtonComponent, DialogComponent, SplitButtonComponent],
  templateUrl: './function-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .function-actions__fichier {
      display: none;
    }
  `
})
export class FunctionActionsComponent {
  /** Des fonctions ont été importées : la vue affichée doit se recharger. */
  readonly importe = output<void>();

  private readonly functionService = inject(FunctionService);
  private readonly messageService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly canWrite = computed(() => this.authService.hasPermission('FUNCTION_WRITE'));
  protected readonly canImport = computed(() => this.authService.hasPermission('FUNCTION_IMPORT'));

  protected readonly importing = signal(false);
  protected readonly importResult = signal<FunctionImportResult | null>(null);
  protected readonly showImportResultDialog = signal(false);
  protected readonly downloadingTemplate = signal(false);

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

  protected onTriggerImport(): void {
    this.fileInput().nativeElement.click();
  }

  protected onDownloadTemplate(): void {
    this.downloadingTemplate.set(true);
    this.functionService
      .telechargerModele()
      .pipe(finalize(() => this.downloadingTemplate.set(false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Fonctions.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.importing.set(true);
    this.functionService
      .importer(file)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: (result) => {
          this.importResult.set(result);
          this.showImportResultDialog.set(true);
          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `${result.crees} créée(s) sur ${result.totalLignes} ligne(s)`,
            life: 6000
          });
          this.importe.emit();
        },
        error: (err: HttpErrorResponse) => {
          const result = err.error as FunctionImportResult | null;
          if (result && Array.isArray(result.lignesIgnorees)) {
            this.importResult.set(result);
            this.showImportResultDialog.set(true);
          }
        }
      });
  }
}
