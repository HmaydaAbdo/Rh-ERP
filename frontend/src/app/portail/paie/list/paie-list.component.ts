import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CalendarModule } from 'primeng/calendar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import {
  FeuillesEquipeMode,
  FormatExport,
  Paie,
  PaieExportRequest,
  PaieImportResult,
  PaieRapportPdfRequest
} from '../models/paie.model';
import { PaieService } from '../services/paie.service';

const DEBOUNCE_RECHERCHE_MS = 300;

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
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    CalendarModule,
    MultiSelectModule,
    SelectButtonModule,
    ConfirmDialogModule,
    DialogModule
  ],
  providers: [ConfirmationService],
  templateUrl: './paie-list.component.html',
  styleUrl: './paie-list.component.scss'
})
export class PaieListComponent implements OnInit {
  private readonly paieService = inject(PaieService);
  private readonly functionReferenceService = inject(FunctionReferenceService);
  private readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  canDelete(): boolean {
    return this.authService.hasPermission('PAIE_DELETE');
  }

  paies: Paie[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;

  functions: FunctionReference[] = [];
  chantiers: ChantierReference[] = [];

  readonly filterForm = this.fb.group({
    nomPrenom: [''],
    cin: [''],
    periode: [null as Date | null],
    fonctionId: [null as number | null],
    chantierId: [null as number | null]
  });

  showImportDialog = false;
  importing = false;
  importResult: PaieImportResult | null = null;
  showImportResultDialog = false;
  downloadingTemplate = false;

  readonly importForm = this.fb.group({
    periode: [null as Date | null]
  });

  showExportDialog = false;
  exporting = false;

  readonly exportForm = this.fb.group({
    format: ['PDF' as FormatExport],
    periode: [null as Date | null],
    chantiers: [[] as string[]],
    feuillesEquipeMode: ['AUCUNE' as FeuillesEquipeMode],
    chantiersPersonnalises: [[] as string[]],
    chantiersExclusion: [[] as string[]]
  });

  readonly feuillesEquipeModeOptions: { label: string; value: FeuillesEquipeMode }[] = [
    { label: 'Aucune', value: 'AUCUNE' },
    { label: 'Toutes', value: 'TOUTES' },
    { label: 'Personnalisé', value: 'PERSONNALISE' }
  ];

  readonly formatExportOptions: { label: string; value: FormatExport }[] = [
    { label: 'PDF', value: 'PDF' },
    { label: 'Excel', value: 'EXCEL' }
  ];

  /** Équipes sélectionnées par chantier (mode PERSONNALISE) et équipes exclues par chantier
   * (feuille globale de ce chantier) — objets simples, pas des FormControl (nombre de chantiers
   * variable), liés au template en dehors du formGroup. */
  equipesParChantierPersonnalise: Record<string, string[] | undefined> = {};
  equipesExcluesParChantier: Record<string, string[] | undefined> = {};

  private readonly equipesCache = new Map<string, string[]>();
  private readonly equipesLoading = new Set<string>();

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'periode,desc';

  ngOnInit(): void {
    this.functionReferenceService.list().subscribe((functions) => (this.functions = functions));
    this.chantierReferenceService.listActive().subscribe((chantiers) => (this.chantiers = chantiers));

    this.filterForm.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_RECHERCHE_MS),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe(() => this.onSearch());
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
            detail: `${result.crees} créé(s), ${result.misAJour} mis à jour sur ${result.totalLignes} ligne(s)${fonctionsCreeesDetail}`,
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

  onOpenExportDialog(): void {
    this.exportForm.reset({
      format: 'PDF',
      periode: null,
      chantiers: [],
      feuillesEquipeMode: 'AUCUNE',
      chantiersPersonnalises: [],
      chantiersExclusion: []
    });
    this.equipesParChantierPersonnalise = {};
    this.equipesExcluesParChantier = {};
    this.equipesCache.clear();
    this.equipesLoading.clear();
    this.showExportDialog = true;
  }

  /** La période change : les équipes déjà chargées/sélectionnées sont propres au couple
   * (chantier, période) précédent, donc on réinitialise toute la configuration équipe. */
  onExportPeriodeChange(): void {
    this.equipesCache.clear();
    this.equipesLoading.clear();
    this.equipesParChantierPersonnalise = {};
    this.equipesExcluesParChantier = {};
    this.exportForm.patchValue({ chantiersPersonnalises: [], chantiersExclusion: [] });
  }

  onChantiersPersonnalisesChange(): void {
    const codes = this.exportForm.controls.chantiersPersonnalises.value ?? [];
    codes.forEach((code) => this.chargerEquipesSiNecessaire(code));
    this.equipesParChantierPersonnalise = this.conserverClesPresentes(this.equipesParChantierPersonnalise, codes);
  }

  onChantiersExclusionChange(): void {
    const codes = this.exportForm.controls.chantiersExclusion.value ?? [];
    codes.forEach((code) => this.chargerEquipesSiNecessaire(code));
    this.equipesExcluesParChantier = this.conserverClesPresentes(this.equipesExcluesParChantier, codes);
  }

  equipesDisponiblesPour(chantierCode: string): string[] {
    const cle = this.cleEquipesCache(chantierCode);
    return cle ? (this.equipesCache.get(cle) ?? []) : [];
  }

  chargementEquipesEnCours(chantierCode: string): boolean {
    const cle = this.cleEquipesCache(chantierCode);
    return cle ? this.equipesLoading.has(cle) : false;
  }

  onExporter(): void {
    const periode = toPeriodeString(this.exportForm.controls.periode.value);
    if (!periode) {
      return;
    }
    const format = this.exportForm.controls.format.value ?? 'PDF';
    const feuillesEquipeMode = this.exportForm.controls.feuillesEquipeMode.value ?? 'AUCUNE';
    const chantiersSelectionnes = this.exportForm.controls.chantiers.value ?? [];
    const chantiers = chantiersSelectionnes.length > 0 ? chantiersSelectionnes : null;

    const equipesParChantier = this.equipesNonVides(this.equipesParChantierPersonnalise);
    const equipesExclues = this.equipesNonVides(this.equipesExcluesParChantier);

    if (format === 'PDF') {
      this.telechargerRapportPdf({
        periode,
        feuillesEquipeMode,
        equipesParChantier: feuillesEquipeMode === 'PERSONNALISE' && Object.keys(equipesParChantier).length > 0 ? equipesParChantier : null,
        equipesExcluesFeuilleChantier: Object.keys(equipesExclues).length > 0 ? equipesExclues : null,
        chantiers
      });
      return;
    }

    const requete: PaieExportRequest = {
      periode,
      feuillesEquipeMode,
      equipesParChantier: feuillesEquipeMode === 'PERSONNALISE' && Object.keys(equipesParChantier).length > 0 ? equipesParChantier : null,
      equipesExcluesFeuilleChantier: Object.keys(equipesExclues).length > 0 ? equipesExclues : null,
      chantiers
    };

    this.exporting = true;
    this.paieService
      .exporter(requete)
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `Paie_Export_${periode}.xlsx`;
        lien.click();
        window.URL.revokeObjectURL(url);
        this.showExportDialog = false;
      });
  }

  private telechargerRapportPdf(requete: PaieRapportPdfRequest): void {
    this.exporting = true;
    this.paieService
      .telechargerRapportPdf(requete)
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const lien = document.createElement('a');
          lien.href = url;
          lien.download = `Paie_Rapport_${requete.periode}.pdf`;
          lien.click();
          window.URL.revokeObjectURL(url);
          this.showExportDialog = false;
        },
        error: (err: HttpErrorResponse) => void this.afficherErreurRapportPdf(err)
      });
  }

  /** Avec responseType 'blob', le corps d'erreur JSON du backend arrive lui aussi en Blob : on le relit
   * pour afficher son message (ex. « Aucun bulletin de paie pour la période 2026-08 … »). */
  private async afficherErreurRapportPdf(err: HttpErrorResponse): Promise<void> {
    let detail = "Le rapport PDF n'a pas pu être généré.";
    if (err.error instanceof Blob) {
      try {
        const corps = JSON.parse(await err.error.text()) as { message?: string };
        if (corps.message) {
          detail = corps.message;
        }
      } catch {
        // corps non JSON : on garde le message générique
      }
    }
    this.messageService.add({ severity: 'error', summary: 'Rapport PDF', detail, life: 8000 });
  }
  private chargerEquipesSiNecessaire(chantierCode: string): void {
    const periode = toPeriodeString(this.exportForm.controls.periode.value);
    const cle = this.cleEquipesCache(chantierCode);
    if (!periode || !cle || this.equipesCache.has(cle) || this.equipesLoading.has(cle)) {
      return;
    }
    this.equipesLoading.add(cle);
    this.paieService
      .listerEquipes(chantierCode, periode)
      .pipe(finalize(() => this.equipesLoading.delete(cle)))
      .subscribe((equipes) => this.equipesCache.set(cle, equipes));
  }

  private cleEquipesCache(chantierCode: string): string | null {
    const periode = toPeriodeString(this.exportForm.controls.periode.value);
    return periode ? `${chantierCode}|${periode}` : null;
  }

  private conserverClesPresentes(
    source: Record<string, string[] | undefined>,
    clesAConserver: string[]
  ): Record<string, string[] | undefined> {
    return Object.fromEntries(Object.entries(source).filter(([cle]) => clesAConserver.includes(cle)));
  }

  private equipesNonVides(source: Record<string, string[] | undefined>): Record<string, string[]> {
    const resultat: Record<string, string[]> = {};
    for (const [code, equipes] of Object.entries(source)) {
      if (equipes && equipes.length > 0) {
        resultat[code] = equipes;
      }
    }
    return resultat;
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
    const criteria = this.filterForm.getRawValue();

    this.paieService
      .search(
        {
          nomPrenom: criteria.nomPrenom || undefined,
          cin: criteria.cin || undefined,
          periode: toPeriodeString(criteria.periode),
          fonctionId: criteria.fonctionId ?? undefined,
          chantierId: criteria.chantierId ?? undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.paies = result.content;
        this.totalRecords = result.totalElements;
      });
  }
}
