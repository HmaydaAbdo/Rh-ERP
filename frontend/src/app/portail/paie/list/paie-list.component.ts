import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { EtatVue } from '../../../shared/etat-vue/etat-vue';
import { CollectionTableComponent, CollectionTableConfig } from '../../../shared/ui/collection-table/collection-table.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { lireFiltres, memesFiltres, PaieFiltres, versCriteres } from '../filtres/paie-filtres';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

const CONFIGURATION_TABLE_PAIE: CollectionTableConfig = {
  countLabel: (total) => `${total} bulletin${total > 1 ? 's' : ''}`,
  accessibleLabel: 'Liste des bulletins de paie',
  emptyMessage: 'Aucun bulletin ne correspond à ces critères.'
};

@Component({
  selector: 'app-paie-list',
  imports: [
    CollectionTableComponent,
    DecimalPipe,
    ButtonComponent,
    TableCellDirective,
    TableRowActionsDirective
  ],
  templateUrl: './paie-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieListComponent {
  protected readonly tableConfiguration = CONFIGURATION_TABLE_PAIE;
  /** Vrai dans la conversation de l'assistant : seul « Modifier » reste (en fenêtre de dialogue) ; voir et supprimer quittent la conversation. */
  readonly lectureSeule = input(false);
  /** Dans la conversation, « Modifier » ne navigue pas : il demande l'ouverture du formulaire en fenêtre de dialogue (KAN-310). */
  readonly modifier = output<number>();
  protected readonly columns = new ColumnState([
    { field: 'nomPrenom', header: 'Nom & prénom', sortField: 'employee.nomPrenom', cellClass: 'font-semibold', minWidth: 200 },
    { field: 'fonction', header: 'Fonction', sortField: 'fonction.libelle', minWidth: 170 },
    { field: 'cin', header: 'CIN', sortField: 'employee.cin' },
    { field: 'nombreJoursTravailles', header: 'Nombre de jours travaillés', shortHeader: 'Jours trav.', align: 'text-center', minWidth: 112 },
    { field: 'joursRecuperationOuvrable', header: 'Jours de récupération ouvrables', shortHeader: 'J.R.O', align: 'text-center' },
    { field: 'joursRecuperationDimanche', header: 'Jours de récupération du dimanche', shortHeader: 'J.R.D', align: 'text-center' },
    { field: 'salaireMensuel', header: 'Salaire mensuel', shortHeader: 'Salaire', align: 'text-end' },
    { field: 'primeRoulageOrdinaire', header: 'Prime de roulage ordinaire', shortHeader: 'Prime RO', align: 'text-end', minWidth: 110 },
    { field: 'primeRoulageDimanche', header: 'Prime de roulage du dimanche', shortHeader: 'Prime RD', align: 'text-end', minWidth: 110 },
    { field: 'salaireTotal', header: 'Salaire total', shortHeader: 'Total', align: 'text-end', cellClass: 'font-bold' },
    { field: 'observation', header: 'Observation', shortHeader: 'Obs', minWidth: 160 },
    { field: 'chantier', header: 'Chantier', sortField: 'chantier.code', align: 'text-center' },
    { field: 'chantierDesignation', header: 'Désignation du chantier', shortHeader: 'Désign. chantier', sortField: 'chantier.designation', minWidth: 170 },
    { field: 'equipe', header: 'Équipe', sortField: 'equipe.libelle', align: 'text-center' },
    { field: 'equipeLibelle', header: 'Libellé de l’équipe', shortHeader: 'Libellé équipe', sortField: 'equipe.libelle', minWidth: 150 },
    { field: 'periode', header: 'Période', align: 'text-center' }
  ]);

  private readonly paieService = inject(PaieService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly etat = inject(EtatVue);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canWrite = computed(() => this.authService.hasPermission('PAIE_WRITE') && this.authService.hasPermission('EMPLOYEE_WRITE'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('PAIE_DELETE'));

  protected readonly paies = signal<Paie[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly deletingId = signal<number | null>(null);

  /** Filtres de la barre commune, lus dans l'URL (voir `filtres/paie-filtres.ts`). */
  private filtres: PaieFiltres = lireFiltres(this.etat.params());

  /** Première ligne de la page affichée, liée au tableau pour qu'un changement de filtres le ramène à la première page. */
  protected readonly first = signal(0);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'periode,desc';
  private rechercheEnCours?: Subscription;

  constructor() {
    // Le premier chargement vient du tableau (`onLazyLoad`) : les filtres déjà lus ci-dessus ne relancent pas la recherche.
    effect(() => {
      const filtres = lireFiltres(this.etat.params());
      untracked(() => {
        if (memesFiltres(filtres, this.filtres)) {
          return;
        }
        this.filtres = filtres;
        this.onSearch();
      });
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
    if (this.lectureSeule()) {
      this.modifier.emit(paie.id);
      return;
    }
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

  protected fetchPage(): void {
    this.rechercheEnCours?.unsubscribe();
    this.loading.set(true);
    this.erreur.set(null);

    this.rechercheEnCours = this.paieService
      .search(versCriteres(this.filtres), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (result) => {
          this.paies.set(result.content);
          this.totalRecords.set(result.page.totalElements);
        },
        error: () => this.erreur.set('Impossible de charger les bulletins. Vérifiez la connexion puis réessayez.')
      });
  }
}
