import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, finalize, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { ChantierFiltres, lireFiltresChantier, memesFiltresChantier, versCriteresChantier } from '../filtres/chantier-filtres';
import { Chantier } from '../models/chantier.model';
import { confirmationStatutChantier, libelleStatutChantier } from '../models/chantier-statut';
import { ChantierService } from '../services/chantier.service';

/** Vue tabulaire des chantiers. Les filtres viennent de l'URL (voir `ChantierVuesComponent`) ; la synchronisation et la création sont dans l'en-tête de la page. */
@Component({
  selector: 'app-chantier-list',
  imports: [ColumnChooserComponent, ButtonComponent, BadgeComponent, TableComponent, TableCellDirective, TableRowActionsDirective],
  templateUrl: './chantier-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierListComponent {
  protected readonly columns = new ColumnState([
    { field: 'code', header: 'Code' },
    { field: 'nom', header: 'Nom' },
    { field: 'designation', header: 'Désignation', cellClass: 'text-truncate' },
    { field: 'sourceErp', header: 'Source' },
    { field: 'actif', header: 'Statut' }
  ]);

  private readonly chantierService = inject(ChantierService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('CHANTIER_WRITE'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('CHANTIER_DELETE'));

  protected readonly chantiers = signal<Chantier[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly statutEnCoursId = signal<number | null>(null);

  protected readonly libelleStatut = libelleStatutChantier;

  private filtres: ChantierFiltres = lireFiltresChantier(this.route.snapshot.queryParamMap);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'code,asc';

  constructor() {
    this.route.queryParamMap
      .pipe(map(lireFiltresChantier), skip(1), distinctUntilChanged(memesFiltresChantier), takeUntilDestroyed(this.destroyRef))
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
    this.fetchPage();
  }

  protected onView(chantier: Chantier): void {
    this.router.navigate(['/chantiers', chantier.id]);
  }

  protected onEdit(chantier: Chantier): void {
    this.router.navigate(['/chantiers', chantier.id, 'edit']);
  }

  protected onDelete(chantier: Chantier): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce chantier',
      message: `Confirmez-vous la suppression de ${chantier.code} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteChantier(chantier)
    });
  }

  /** Clôture un chantier en cours, ou rouvre un chantier clôturé, après confirmation. */
  protected onChangerStatut(chantier: Chantier): void {
    this.confirmationService.confirm({
      ...confirmationStatutChantier(chantier),
      rejectLabel: 'Annuler',
      accept: () => {
        this.statutEnCoursId.set(chantier.id);
        this.chantierService
          .changerStatut(chantier, !chantier.actif)
          .pipe(finalize(() => this.statutEnCoursId.set(null)))
          .subscribe((modifie) => {
            this.messageService.add({ severity: 'success', summary: `Chantier ${modifie.code} : ${libelleStatutChantier(modifie.actif).toLowerCase()}`, life: 4000 });
            this.fetchPage();
          });
      }
    });
  }

  private deleteChantier(chantier: Chantier): void {
    this.deletingId.set(chantier.id);
    this.chantierService
      .delete(chantier.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Chantier supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);

    this.chantierService
      .search(versCriteresChantier(this.filtres), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.chantiers.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
