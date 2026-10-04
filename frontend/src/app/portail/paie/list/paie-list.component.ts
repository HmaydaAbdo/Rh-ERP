import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CalendarModule } from 'primeng/calendar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { distinctUntilChanged, finalize, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { PaieExportWizardComponent } from '../export/paie-export-wizard.component';
import { Paie, PaieImportResult } from '../models/paie.model';
import { PaieFiltres, lireFiltres, versCriteres } from '../filtres/paie-filtres';
import { PaieService } from '../services/paie.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';

function toPeriodeString(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-paie-list',
  standalone: true,
  imports: [
    CommonModule,
    ColumnChooserComponent,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    CalendarModule,
    ConfirmDialogModule,
    DialogModule,
    PaieExportWizardComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './paie-list.component.html',
  styleUrl: './paie-list.component.scss'
})
export class PaieListComponent implements OnInit {
  readonly columns = new ColumnState([
    { field: 'nomPrenom', header: 'Nom & prénom', sortField: 'employee.nomPrenom', cellClass: 'font-semibold' },
    { field: 'fonction', header: 'Fonction', sortField: 'fonction.libelle' },
    { field: 'cin', header: 'CIN', sortField: 'employee.cin' },
    { field: 'nombreJoursTravailles', header: 'Jours trav.', align: 'text-center' },
    { field: 'joursRecuperationOuvrable', header: 'J.R.O', align: 'text-center' },
    { field: 'joursRecuperationDimanche', header: 'J.R.D', align: 'text-center' },
    { field: 'salaireMensuel', header: 'Salaire', align: 'text-right' },
    { field: 'primeRoulageOrdinaire', header: 'Prime RO', align: 'text-right' },
    { field: 'primeRoulageDimanche', header: 'Prime RD', align: 'text-right' },
    { field: 'salaireTotal', header: 'Total', align: 'text-right', cellClass: 'font-bold' },
    { field: 'observation', header: 'Obs' },
    { field: 'chantier', header: 'Chantier', sortField: 'chantier.code', align: 'text-center' },
    { field: 'equipe', header: 'Équipe', sortField: 'equipe.code', align: 'text-center' },
    { field: 'periode', header: 'Période', align: 'text-center' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  private readonly paieService = inject(PaieService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  canWrite(): boolean {
    return this.authService.hasPermission('PAIE_WRITE');
  }

  canImport(): boolean {
    return this.authService.hasPermission('PAIE_IMPORT');
  }

  canExport(): boolean {
    return this.authService.hasPermission('PAIE_EXPORT');
  }

  canDelete(): boolean {
    return this.authService.hasPermission('PAIE_DELETE');
  }

  paies: Paie[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;

  /** Filtres de la barre commune, lus dans l'URL (voir `filtres/paie-filtres.ts`). */
  private filtres: PaieFiltres = lireFiltres(this.route.snapshot.queryParamMap);

  /** Première ligne de la page affichée, liée au tableau pour qu'un changement de filtres le ramène à la première page. */
  first = 0;

  showImportDialog = false;
  importing = false;
  importResult: PaieImportResult | null = null;
  showImportResultDialog = false;
  downloadingTemplate = false;

  readonly importForm = this.fb.group({
    periode: [null as Date | null]
  });

  showExportDialog = false;

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'periode,desc';

  ngOnInit(): void {
    // La première émission est celle de l'URL déjà lue ci-dessus : le premier chargement vient du tableau (`onLazyLoad`).
    this.route.queryParamMap
      .pipe(
        map(lireFiltres),
        skip(1),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((filtres) => {
        this.filtres = filtres;
        this.onSearch();
      });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.lastSize;
    const page = size > 0 ? Math.floor((event.first ?? 0) / size) : 0;
    const sortField = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    const sort = sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.first = event.first ?? 0;
    this.lastPage = page;
    this.lastSize = size;
    this.lastSort = sort;

    this.fetchPage();
  }

  onSearch(): void {
    this.lastPage = 0;
    this.first = 0;
    this.fetchPage();
  }

  onView(paie: Paie): void {
    this.router.navigate(['/paie', paie.id]);
  }

  onEdit(paie: Paie): void {
    this.router.navigate(['/paie', paie.id, 'edit']);
  }

  onDelete(paie: Paie): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce bulletin',
      message: `Confirmez-vous la suppression du bulletin de ${paie.employee.nomPrenom} (${paie.periode}) ?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deletePaie(paie)
    });
  }

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
          this.fetchPage();
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

  private deletePaie(paie: Paie): void {
    this.deletingId = paie.id;
    this.paieService
      .delete(paie.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Bulletin supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading = true;

    this.paieService
      .search(versCriteres(this.filtres), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.paies = result.content;
        this.totalRecords = result.totalElements;
      });
  }
}
