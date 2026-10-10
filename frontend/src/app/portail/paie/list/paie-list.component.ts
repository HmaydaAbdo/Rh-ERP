import { CommonModule, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, finalize, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { lireFiltres, PaieFiltres, versCriteres } from '../filtres/paie-filtres';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

@Component({
  selector: 'app-paie-list',
  imports: [
    ColumnChooserComponent,
    DecimalPipe,
    ButtonComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective
  ],
  templateUrl: './paie-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieListComponent {
  protected readonly columns = new ColumnState([
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

  private readonly paieService = inject(PaieService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canWrite = computed(() => this.authService.hasPermission('PAIE_WRITE'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('PAIE_DELETE'));

  protected readonly paies = signal<Paie[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);

  /** Filtres de la barre commune, lus dans l'URL (voir `filtres/paie-filtres.ts`). */
  private filtres: PaieFiltres = lireFiltres(this.route.snapshot.queryParamMap);

  /** Première ligne de la page affichée, liée au tableau pour qu'un changement de filtres le ramène à la première page. */
  protected readonly first = signal(0);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'periode,desc';

  constructor() {
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

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows;
    this.lastPage = size > 0 ? Math.floor(event.first / size) : 0;
    this.lastSize = size;
    this.lastSort = event.sortField ? `${event.sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.fetchPage();
  }

  protected onSearch(): void {
    this.lastPage = 0;
    this.first.set(0);
    this.fetchPage();
  }

  protected onView(paie: Paie): void {
    this.router.navigate(['/paie', paie.id]);
  }

  protected onEdit(paie: Paie): void {
    this.router.navigate(['/paie', paie.id, 'edit']);
  }

  protected onDelete(paie: Paie): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce bulletin',
      message: `Confirmez-vous la suppression du bulletin de ${paie.employee.nomPrenom} (${paie.periode}) ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deletePaie(paie)
    });
  }

  private deletePaie(paie: Paie): void {
    this.deletingId.set(paie.id);
    this.paieService
      .delete(paie.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Bulletin supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);

    this.paieService
      .search(versCriteres(this.filtres), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.paies.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
