import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableColumn } from '../../../shared/table/table-columns';
import { TableComponent } from '../../../shared/ui/table/table.component';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { MonthPickerComponent } from '../../../shared/ui/month-picker/month-picker.component';
import { telechargerFichier } from '../../../shared/utils/telecharger-fichier';
import { moisCourant, versRequete } from '../../mouvement/mouvement-filtres';
import { AUCUN_FILTRE, EmployeeFiltres } from '../filtres/employee-filtres';
import { EmployeeImportResult } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

/**
 * Les actions des employés — Importer (avec le modèle Excel dans son menu) et Nouvel employé — posées une seule fois dans
 * l'en-tête de la page (voir `EmployeeVuesComponent`). Chaque bouton n'apparaît qu'avec sa permission. Un import réussi prévient
 * la page par `importe`, qui recharge la vue.
 */
@Component({
  selector: 'app-employee-actions',
  imports: [TableComponent, RouterLink, ButtonComponent, DialogComponent, SplitButtonComponent, MonthPickerComponent],
  templateUrl: './employee-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeActionsComponent {
  protected readonly colonnesIgnorees: TableColumn[] = [{ field: 'numeroLigne', header: 'Ligne' }, { field: 'cin', header: 'CIN' }, { field: 'nomPrenom', header: 'Nom & prénom' }, { field: 'raison', header: 'Raison' }];
  /** Des employés ont été importés : la vue affichée doit se recharger. */
  readonly importe = output<void>();
  /** Les filtres de la page : le PDF des mouvements couvre le même périmètre que la liste affichée. */
  readonly filtres = input<EmployeeFiltres>(AUCUN_FILTRE);

  private readonly employeeService = inject(EmployeeService);
  private readonly messageService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly canWrite = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));
  protected readonly canImport = computed(() => this.authService.hasPermission('EMPLOYEE_IMPORT'));

  protected readonly canExport = computed(() => this.authService.hasPermission('EMPLOYEE_EXPORT'));

  protected readonly dialogueMouvements = signal(false);
  protected readonly moisMouvements = signal(moisCourant());
  protected readonly mouvementsEnCours = signal(false);

  protected readonly importing = signal(false);
  protected readonly importResult = signal<EmployeeImportResult | null>(null);
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
    this.employeeService
      .telechargerModele()
      .pipe(finalize(() => this.downloadingTemplate.set(false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Employes.xlsx';
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
    this.employeeService
      .importer(file)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: (result) => {
          this.importResult.set(result);
          this.showImportResultDialog.set(true);
          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `${result.crees} créé(s) sur ${result.totalLignes} ligne(s)`,
            life: 6000
          });
          this.importe.emit();
        },
        error: (err: HttpErrorResponse) => {
          const result = err.error as EmployeeImportResult | null;
          if (result && Array.isArray(result.lignesIgnorees)) {
            this.importResult.set(result);
            this.showImportResultDialog.set(true);
          }
        }
      });
  }

  protected ouvrirMouvements(): void {
    this.dialogueMouvements.set(true);
  }

  /** Télécharge le PDF des entrées et sorties du mois choisi, pour les filtres de la page (le statut ne filtre pas ici). */
  protected telechargerMouvements(): void {
    const periode = this.moisMouvements();
    const requete = versRequete({ periode, employes: { ...this.filtres(), statut: null }, valeurs: [] }, 'motifs');
    this.mouvementsEnCours.set(true);
    this.employeeService
      .exporterMouvementsPdf(requete)
      .pipe(finalize(() => this.mouvementsEnCours.set(false)))
      .subscribe({
        next: (pdf) => {
          telechargerFichier(pdf, `Mouvements_${periode}.pdf`);
          this.dialogueMouvements.set(false);
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Impossible de générer le PDF des mouvements.' })
      });
  }
}
