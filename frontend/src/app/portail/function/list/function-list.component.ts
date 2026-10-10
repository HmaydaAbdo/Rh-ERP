import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { surChangementDesFiltres } from '../../../shared/forms/filtres';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { Function, FunctionImportResult } from '../models/function.model';
import { FunctionService } from '../services/function.service';

const DEBOUNCE_RECHERCHE_MS = 300;

const filtresVides = () => ({ libelle: '' });

@Component({
  selector: 'app-function-list',
  imports: [
    FormField,
    FormRoot,
    RouterLink,
    ButtonComponent,
    ColumnChooserComponent,
    DialogComponent,
    SplitButtonComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective
  ],
  templateUrl: './function-list.component.html',
  styleUrl: './function-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionListComponent {
  readonly columns = new ColumnState([{ field: 'libelle', header: 'Libellé' }]);

  private readonly functionService = inject(FunctionService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly canWrite = computed(() => this.authService.hasPermission('FUNCTION_WRITE'));
  protected readonly canImport = computed(() => this.authService.hasPermission('FUNCTION_IMPORT'));
  protected readonly canDelete = computed(() => this.authService.hasPermission('FUNCTION_DELETE'));

  protected readonly functions = signal<Function[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);
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

  protected readonly filtres = signal(filtresVides());
  protected readonly filterForm = form(this.filtres, (chemin) => debounce(chemin.libelle, DEBOUNCE_RECHERCHE_MS));

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'libelle,asc';

  constructor() {
    surChangementDesFiltres(this.filtres, () => this.onSearch());
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows;
    this.lastPage = size > 0 ? Math.floor(event.first / size) : 0;
    this.lastSize = size;
    this.lastSort = event.sortField ? `${event.sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.fetchPage();
  }

  protected onSearch(): void {
    this.lastPage = 0;
    this.fetchPage();
  }

  protected onResetFilters(): void {
    this.filterForm().reset(filtresVides());
  }

  protected onView(fonction: Function): void {
    this.router.navigate(['/functions', fonction.id]);
  }

  protected onEdit(fonction: Function): void {
    this.router.navigate(['/functions', fonction.id, 'edit']);
  }

  protected onDelete(fonction: Function): void {
    this.confirmationService.confirm({
      header: 'Supprimer cette fonction',
      message: `Confirmez-vous la suppression de ${fonction.libelle} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteFunction(fonction)
    });
  }

  protected onTriggerImport(): void {
    this.fileInput().nativeElement.click();
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
          this.fetchPage();
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

  private onDownloadTemplate(): void {
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

  private deleteFunction(fonction: Function): void {
    this.deletingId.set(fonction.id);
    this.functionService
      .delete(fonction.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Fonction supprimée', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    const criteria = this.filtres();

    this.functionService
      .search({ libelle: criteria.libelle || undefined }, { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.functions.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
