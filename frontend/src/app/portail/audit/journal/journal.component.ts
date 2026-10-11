import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { finalize } from 'rxjs';

import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { surChangementDesFiltres } from '../../../shared/forms/filtres';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { ACTIONS_AUDIT, ENTITES_AUDITEES, formaterHorodatage, libelleAction, libelleEntite, LIBELLES_CATEGORIES, LIBELLES_ORIGINES, LIBELLES_RESULTATS } from '../audit-format';
import { AuditChampsComponent } from '../champs/audit-champs.component';
import { AuditChangement, AuditCriteres, AuditEntree, AuditLigne, CategorieAudit, ResultatAudit } from '../models/audit.model';
import { AuditService } from '../services/audit.service';
import { AuthService } from '../../../core/auth/services/auth.service';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { PaieService } from '../../paie/services/paie.service';

const DEBOUNCE_RECHERCHE_MS = 300;
const TAILLE_PAGE_DETAIL = 10;

const filtresVides = () => ({
  dateDebut: '',
  dateFin: '',
  utilisateur: '',
  categorie: null as CategorieAudit | null,
  action: null as string | null,
  resultat: null as ResultatAudit | null,
  entiteType: null as string | null,
  requestId: ''
});

/**
 * Journal d'audit : toutes les opérations, tous les événements de sécurité et toutes les sorties de données, filtrables en
 * temps réel. Un clic ouvre l'entrée dans un panneau latéral : son contexte (qui, d'où, sous quel identifiant de requête),
 * son périmètre, puis — chargé à l'ouverture seulement, par pages — ce qu'elle a changé, champ par champ.
 */
@Component({
  selector: 'app-journal',
  imports: [
    ColumnChooserComponent,
    AuditChampsComponent,
    ButtonComponent,
    SelectComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective,
    FormField,
    FormRoot,
    DialogComponent
  ],
  templateUrl: './journal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './journal.component.scss'
})
export class JournalComponent {
  protected readonly columns = new ColumnState([
    { field: 'horodatage', header: 'Date' },
    { field: 'categorie', header: 'Catégorie' },
    { field: 'action', header: 'Action' },
    { field: 'resultat', header: 'Résultat' },
    { field: 'utilisateurNom', header: 'Utilisateur' },
    { field: 'origine', header: 'Origine' },
    { field: 'cible', header: 'Cible', sortField: 'entiteType' },
    { field: 'nombreElements', header: 'Éléments', align: 'text-right' },
    { field: 'motif', header: 'Motif', cellClass: 'text-truncate' }
  ]);

  protected readonly categorieOptions = (Object.keys(LIBELLES_CATEGORIES) as CategorieAudit[]).map((value) => ({ value, label: LIBELLES_CATEGORIES[value] }));
  protected readonly resultatOptions = (Object.keys(LIBELLES_RESULTATS) as ResultatAudit[]).map((value) => ({ value, label: LIBELLES_RESULTATS[value] }));
  protected readonly actionOptions = ACTIONS_AUDIT.map((a) => ({ value: a.code, label: a.libelle }));
  protected readonly entiteOptions = ENTITES_AUDITEES.map((e) => ({ value: e.code, label: e.libelle }));

  protected readonly formaterHorodatage = formaterHorodatage;
  protected readonly libelleAction = libelleAction;
  protected readonly libelleEntite = libelleEntite;
  protected readonly libelleCategorie = (categorie: CategorieAudit): string => LIBELLES_CATEGORIES[categorie];
  protected readonly libelleResultat = (resultat: ResultatAudit): string => LIBELLES_RESULTATS[resultat];
  protected readonly libelleOrigine = (origine: AuditLigne['origine']): string => LIBELLES_ORIGINES[origine];

  private readonly auditService = inject(AuditService);
  private readonly authService = inject(AuthService);
  private readonly paieService = inject(PaieService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly notificationService = inject(NotificationService);
  protected readonly canRestore = computed(() => this.authService.hasPermission('PAIE_RESTORE'));
  protected readonly restaurationPossible = computed(() => {
    const entree = this.entree();
    return entree?.action === 'PAIE_SUPPRESSION_GROUPE'
      && entree.categorie === 'OPERATION'
      && entree.resultat === 'SUCCES'
      && entree.typeOperation === 'DELETE'
      && entree.entiteType === 'Paie'
      && (entree.nombreElements ?? 0) > 0;
  });

  protected readonly lignes = signal<AuditLigne[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);

  protected readonly filtres = signal(filtresVides());
  protected readonly filterForm = form(this.filtres, (chemin) => {
    debounce(chemin.utilisateur, DEBOUNCE_RECHERCHE_MS);
    debounce(chemin.requestId, DEBOUNCE_RECHERCHE_MS);
  });

  /** « Plus de filtres » : résultat, entité et identifiant de requête, les moins utilisés. Le panneau reste ouvert tant qu'un
   * de ces filtres est actif (ex. après « Voir toutes les entrées de cette requête »). */
  protected readonly plusOuverts = signal(false);

  /** Panneau latéral : l'entrée ouverte et ce qu'elle a changé. */
  protected readonly panneauOuvert = signal(false);
  protected readonly entree = signal<AuditEntree | null>(null);
  protected readonly changements = signal<AuditChangement[]>([]);
  protected readonly totalChangements = signal(0);
  protected readonly pageChangements = signal(0);
  protected readonly chargementDetail = signal(false);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'horodatage,desc';

  constructor() {
    surChangementDesFiltres(this.filtres, () => this.onSearch());
  }

  /** Nombre de filtres actifs du panneau « Plus de filtres ». */
  nombreAvances(): number {
    const f = this.filtres();
    return [f.resultat, f.entiteType, f.requestId].filter((valeur) => Boolean(valeur)).length;
  }

  avancesVisibles(): boolean {
    return this.plusOuverts() || this.nombreAvances() > 0;
  }

  basculerPlus(): void {
    this.plusOuverts.set(!this.avancesVisibles());
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

  /** Ouvre une entrée dans le panneau : son contexte d'abord, puis la première page de ses modifications. */
  protected onOuvrir(ligne: AuditLigne): void {
    this.panneauOuvert.set(true);
    this.entree.set(null);
    this.changements.set([]);
    this.totalChangements.set(0);
    this.pageChangements.set(0);
    this.auditService.getById(ligne.id).subscribe((entree) => {
      this.entree.set(entree);
      this.chargerChangements();
    });
  }

  changementsSuivants(): void {
    this.pageChangements.update((page) => page + 1);
    this.chargerChangements();
  }

  changementsPrecedents(): void {
    this.pageChangements.update((page) => page - 1);
    this.chargerChangements();
  }

  nombrePagesChangements(): number {
    return Math.max(1, Math.ceil(this.totalChangements() / TAILLE_PAGE_DETAIL));
  }

  /** Remplace les filtres par « toutes les entrées de cette requête » : relie les événements d'une même action. */
  protected onVoirLaRequete(requestId: string): void {
    this.filterForm().reset({ ...filtresVides(), requestId });
    this.panneauOuvert.set(false);
  }

  protected demanderRestauration(): void {
    const entree = this.entree();
    if (!entree || !this.canRestore() || !this.restaurationPossible()) {
      return;
    }
    this.confirmationService.confirm({
      header: 'Restaurer ce groupe de bulletins ?',
      message: `${entree.nombreElements} bulletin(s) seront recréés avec de nouveaux identifiants. Si un bulletin existe déjà pour un employé et ce mois, toute la restauration sera refusée.`,
      acceptLabel: 'Restaurer',
      rejectLabel: 'Annuler',
      accept: () => this.paieService.restaurerDepuisAudit(entree.id).subscribe((resultat) => {
        this.notificationService.add({
          severity: 'success',
          summary: 'Bulletins restaurés',
          detail: `${resultat.restaures} bulletin(s) recréé(s) depuis cette entrée d’audit.`,
          life: 6000
        });
      })
    });
  }

  perimetreEntrees(): [string, string][] {
    const perimetre = this.entree()?.perimetre;
    if (!perimetre) {
      return [];
    }
    return Object.entries(perimetre).map(([cle, valeur]) => [cle, typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur)]);
  }

  cible(ligne: Pick<AuditLigne, 'entiteType' | 'entiteId'>): string {
    return ligne.entiteType ? `${libelleEntite(ligne.entiteType)}${ligne.entiteId != null ? ' n° ' + ligne.entiteId : ''}` : '';
  }

  private chargerChangements(): void {
    const entree = this.entree();
    if (!entree) {
      return;
    }
    this.chargementDetail.set(true);
    this.auditService
      .details(entree.id, { page: this.pageChangements(), size: TAILLE_PAGE_DETAIL })
      .pipe(finalize(() => this.chargementDetail.set(false)))
      .subscribe((resultat) => {
        this.changements.set(resultat.content);
        this.totalChangements.set(resultat.page.totalElements);
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    this.auditService
      .search(this.criteres(), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((resultat) => {
        this.lignes.set(resultat.content);
        this.totalRecords.set(resultat.page.totalElements);
      });
  }

  private criteres(): AuditCriteres {
    const f = this.filtres();
    return {
      dateDebut: f.dateDebut ? new Date(`${f.dateDebut}T00:00:00`).toISOString() : undefined,
      dateFin: f.dateFin ? new Date(`${f.dateFin}T23:59:59.999`).toISOString() : undefined,
      utilisateur: f.utilisateur || undefined,
      categorie: f.categorie ?? undefined,
      action: f.action ?? undefined,
      resultat: f.resultat ?? undefined,
      entiteType: f.entiteType ?? undefined,
      requestId: f.requestId || undefined
    };
  }
}
