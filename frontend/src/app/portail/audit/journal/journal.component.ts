import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { SidebarModule } from 'primeng/sidebar';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';
import {
  ACTIONS_AUDIT,
  ENTITES_AUDITEES,
  LIBELLES_CATEGORIES,
  LIBELLES_ORIGINES,
  LIBELLES_RESULTATS,
  formaterHorodatage,
  libelleAction,
  libelleEntite
} from '../audit-format';
import { AuditChampsComponent } from '../champs/audit-champs.component';
import { AuditChangement, AuditCriteres, AuditEntree, AuditLigne, CategorieAudit, ResultatAudit } from '../models/audit.model';
import { AuditService } from '../services/audit.service';

const DEBOUNCE_RECHERCHE_MS = 300;
const TAILLE_PAGE_DETAIL = 10;

/**
 * Journal d'audit : toutes les opérations, tous les événements de sécurité et toutes les sorties de données, filtrables en
 * temps réel. Un clic ouvre l'entrée dans un panneau latéral : son contexte (qui, d'où, sous quel identifiant de requête),
 * son périmètre, puis — chargé à l'ouverture seulement, par pages — ce qu'elle a changé, champ par champ.
 */
@Component({
    selector: 'app-journal',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ButtonModule,
        DropdownModule,
        InputTextModule,
        SidebarModule,
        TableModule,
        ColumnChooserComponent,
        AuditChampsComponent
    ],
    templateUrl: './journal.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './journal.component.scss'
})
export class JournalComponent implements OnInit {
  readonly columns = new ColumnState([
    { field: 'horodatage', header: 'Date' },
    { field: 'categorie', header: 'Catégorie' },
    { field: 'action', header: 'Action' },
    { field: 'resultat', header: 'Résultat' },
    { field: 'utilisateurNom', header: 'Utilisateur' },
    { field: 'origine', header: 'Origine' },
    { field: 'cible', header: 'Cible', sortField: 'entiteType' },
    { field: 'nombreElements', header: 'Éléments', align: 'text-right' },
    { field: 'motif', header: 'Motif', cellClass: 'journal__motif' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  readonly categorieOptions = (Object.keys(LIBELLES_CATEGORIES) as CategorieAudit[]).map((value) => ({ value, label: LIBELLES_CATEGORIES[value] }));
  readonly resultatOptions = (Object.keys(LIBELLES_RESULTATS) as ResultatAudit[]).map((value) => ({ value, label: LIBELLES_RESULTATS[value] }));
  readonly actionOptions = ACTIONS_AUDIT.map((a) => ({ value: a.code, label: a.libelle }));
  readonly entiteOptions = ENTITES_AUDITEES.map((e) => ({ value: e.code, label: e.libelle }));

  readonly formaterHorodatage = formaterHorodatage;
  readonly libelleAction = libelleAction;
  readonly libelleEntite = libelleEntite;
  readonly libelleCategorie = (categorie: CategorieAudit): string => LIBELLES_CATEGORIES[categorie];
  readonly libelleResultat = (resultat: ResultatAudit): string => LIBELLES_RESULTATS[resultat];
  readonly libelleOrigine = (origine: AuditLigne['origine']): string => LIBELLES_ORIGINES[origine];

  private readonly auditService = inject(AuditService);
  private readonly fb = inject(FormBuilder);

  lignes: AuditLigne[] = [];
  totalRecords = 0;
  loading = false;

  readonly filterForm = this.fb.group({
    dateDebut: [''],
    dateFin: [''],
    utilisateur: [''],
    categorie: [null as CategorieAudit | null],
    action: [null as string | null],
    resultat: [null as ResultatAudit | null],
    entiteType: [null as string | null],
    requestId: ['']
  });

  /** « Plus de filtres » : résultat, entité et identifiant de requête, les moins utilisés. Le panneau reste ouvert tant qu'un
   * de ces filtres est actif (ex. après « Voir toutes les entrées de cette requête »). */
  plusOuverts = false;

  /** Panneau latéral : l'entrée ouverte et ce qu'elle a changé. */
  panneauOuvert = false;
  entree: AuditEntree | null = null;
  changements: AuditChangement[] = [];
  totalChangements = 0;
  pageChangements = 0;
  chargementDetail = false;

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'horodatage,desc';

  ngOnInit(): void {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_RECHERCHE_MS),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe(() => this.onSearch());
  }

  /** Nombre de filtres actifs du panneau « Plus de filtres ». */
  nombreAvances(): number {
    const f = this.filterForm.getRawValue();
    return [f.resultat, f.entiteType, f.requestId].filter((valeur) => Boolean(valeur)).length;
  }

  avancesVisibles(): boolean {
    return this.plusOuverts || this.nombreAvances() > 0;
  }

  basculerPlus(): void {
    this.plusOuverts = !this.avancesVisibles();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.lastSize;
    const page = size > 0 ? Math.floor((event.first ?? 0) / size) : 0;
    const sortField = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    const sort = sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.lastPage = page;
    this.lastSize = size;
    this.lastSort = sort;

    this.fetchPage();
  }

  onSearch(): void {
    this.lastPage = 0;
    this.fetchPage();
  }

  onResetFilters(): void {
    this.filterForm.reset(undefined, { emitEvent: false });
    this.onSearch();
  }

  /** Ouvre une entrée dans le panneau : son contexte d'abord, puis la première page de ses modifications. */
  onOuvrir(ligne: AuditLigne): void {
    this.panneauOuvert = true;
    this.entree = null;
    this.changements = [];
    this.totalChangements = 0;
    this.pageChangements = 0;
    this.auditService.getById(ligne.id).subscribe((entree) => {
      this.entree = entree;
      this.chargerChangements();
    });
  }

  changementsSuivants(): void {
    this.pageChangements += 1;
    this.chargerChangements();
  }

  changementsPrecedents(): void {
    this.pageChangements -= 1;
    this.chargerChangements();
  }

  nombrePagesChangements(): number {
    return Math.max(1, Math.ceil(this.totalChangements / TAILLE_PAGE_DETAIL));
  }

  /** Remplace les filtres par « toutes les entrées de cette requête » : relie les événements d'une même action. */
  onVoirLaRequete(requestId: string): void {
    this.filterForm.reset(undefined, { emitEvent: false });
    this.filterForm.patchValue({ requestId }, { emitEvent: false });
    this.panneauOuvert = false;
    this.onSearch();
  }

  perimetreEntrees(): [string, string][] {
    const perimetre = this.entree?.perimetre;
    if (!perimetre) {
      return [];
    }
    return Object.entries(perimetre).map(([cle, valeur]) => [cle, typeof valeur === 'object' ? JSON.stringify(valeur) : String(valeur)]);
  }

  cible(ligne: Pick<AuditLigne, 'entiteType' | 'entiteId'>): string {
    return ligne.entiteType ? `${libelleEntite(ligne.entiteType)}${ligne.entiteId != null ? ' n° ' + ligne.entiteId : ''}` : '';
  }

  private chargerChangements(): void {
    if (!this.entree) {
      return;
    }
    this.chargementDetail = true;
    this.auditService
      .details(this.entree.id, { page: this.pageChangements, size: TAILLE_PAGE_DETAIL })
      .pipe(finalize(() => (this.chargementDetail = false)))
      .subscribe((resultat) => {
        this.changements = resultat.content;
        this.totalChangements = resultat.page.totalElements;
      });
  }

  private fetchPage(): void {
    this.loading = true;
    this.auditService
      .search(this.criteres(), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((resultat) => {
        this.lignes = resultat.content;
        this.totalRecords = resultat.page.totalElements;
      });
  }

  private criteres(): AuditCriteres {
    const f = this.filterForm.getRawValue();
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
