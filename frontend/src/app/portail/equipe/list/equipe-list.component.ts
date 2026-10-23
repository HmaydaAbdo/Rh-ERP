import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, map, skip } from 'rxjs';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { CollectionTableComponent, CollectionTableConfig } from '../../../shared/components/collection-table/collection-table.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { PdfExportButtonComponent } from '../../../shared/components/pdf-export-button/pdf-export-button.component';
import { PdfImpressionDocument } from '../../../shared/services/pdf-impression.service';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';
import { EquipeFiltres, lireFiltresEquipe, memesFiltresEquipe } from '../filtres/equipe-filtres';
import { chargerToutLeReferentiel } from '../../perimetre/perimetre-module';

const CONFIGURATION_TABLE_EQUIPE: CollectionTableConfig = {
  countLabel: (total) => `${total} équipe${total > 1 ? 's' : ''}`,
  accessibleLabel: 'Liste : Équipes',
  emptyMessage: 'Aucune équipe ne correspond à ces critères.'
};

@Component({
  selector: 'app-equipe-list',
  imports: [ButtonComponent, CollectionTableComponent, TableCellDirective, TableRowActionsDirective, PdfExportButtonComponent],
  templateUrl: './equipe-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeListComponent {
  protected readonly tableConfiguration = CONFIGURATION_TABLE_EQUIPE;
  readonly columns = new ColumnState([
    { field: 'code', header: 'Code' },
    { field: 'libelle', header: 'Libellé' }
  ]);

  private readonly equipeService = inject(EquipeService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('EQUIPE_WRITE'));
  protected readonly canDelete = computed(() => this.authService.hasPermission('EQUIPE_DELETE'));

  protected readonly equipes = signal<Equipe[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);

  private filtres: EquipeFiltres = lireFiltresEquipe(this.route.snapshot.queryParamMap);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'code,asc';

  protected readonly documentVide: PdfImpressionDocument = { titre: 'Équipes', contexte: '', colonnes: [], lignes: [] };
  protected readonly chargerExport = () => {
    const filtres = this.filtres;
    const colonnes = this.columns.visible;
    return chargerToutLeReferentiel((page, taille) => this.equipeService.search({
      code: filtres.code || undefined,
      libelle: filtres.libelle || undefined
    }, { page, size: taille, sort: this.lastSort })).pipe(map((equipes) => ({
      titre: 'Équipes',
      contexte: `Filtres actifs · ${filtres.code || filtres.libelle ? 'résultat filtré' : 'toutes les équipes'}`,
      colonnes: colonnes.map((colonne) => colonne.header),
      lignes: equipes.map((equipe) => colonnes.map((colonne) => String(equipe[colonne.field as keyof Equipe] ?? '')))
    })));
  };

  constructor() {
    this.route.queryParamMap
      .pipe(map(lireFiltresEquipe), skip(1), distinctUntilChanged(memesFiltresEquipe), takeUntilDestroyed(this.destroyRef))
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

  protected onView(equipe: Equipe): void {
    this.router.navigate(['/equipes', equipe.id]);
  }

  protected onEdit(equipe: Equipe): void {
    this.router.navigate(['/equipes', equipe.id, 'edit']);
  }

  protected onDelete(equipe: Equipe): void {
    this.confirmationService.confirm({
      header: 'Supprimer cette équipe',
      message: `Confirmez-vous la suppression de ${equipe.code} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteEquipe(equipe)
    });
  }

  private deleteEquipe(equipe: Equipe): void {
    this.deletingId.set(equipe.id);
    this.equipeService
      .delete(equipe.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Équipe supprimée', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    const criteria = this.filtres;

    this.equipeService
      .search(
        {
          code: criteria.code || undefined,
          libelle: criteria.libelle || undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.equipes.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
