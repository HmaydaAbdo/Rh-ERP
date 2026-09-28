import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { PaieExportRequest, PaieRapportPdfRequest } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

type Inclusion = 'INCLURE' | 'EXCLURE';
type Format = 'PDF' | 'EXCEL';

const LIBELLES_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const NB_ANNEES_PASSEES = 5;

/**
 * Dialog d'export unique de la paie — PDF ou Excel, une seule sélection manuelle d'équipes à
 * détailler pour les deux formats (demande explicite de direction, 2026-09-29, voir
 * docs/report/rapport-v2.md). Pour un chantier sélectionné ici : le PDF affiche le graphique de
 * répartition par équipe + une section détaillée par équipe cochée (les autres employés du chantier
 * regroupés dans une dernière section), tandis que l'Excel génère en plus une feuille par équipe
 * cochée (toujours en plus des feuilles Global/chantier, jamais à la place — l'Excel duplique
 * volontairement, le PDF jamais, voir le Javadoc de EquipeBiVue côté backend).
 */
@Component({
  selector: 'app-paie-export-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    DropdownModule,
    MultiSelectModule,
    SelectButtonModule,
    LazySelectComponent
  ],
  templateUrl: './paie-export-dialog.component.html',
  styleUrl: './paie-export-dialog.component.scss'
})
export class PaieExportDialogComponent implements OnChanges, OnInit {
  private readonly paieService = inject(PaieService);
  private readonly messageService = inject(MessageService);
  readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();

  exporting = false;
  format: Format = 'PDF';

  readonly formatOptions: { label: string; value: Format }[] = [
    { label: 'Rapport PDF', value: 'PDF' },
    { label: 'Classeur Excel', value: 'EXCEL' }
  ];
  readonly anneeOptions: number[] = this.construireAnneeOptions();
  readonly moisOptions: { label: string; value: number }[] = LIBELLES_MOIS.map((label, index) => ({ label, value: index + 1 }));
  readonly inclusionOptions: { label: string; value: Inclusion }[] = [
    { label: 'Inclure', value: 'INCLURE' },
    { label: 'Exclure', value: 'EXCLURE' }
  ];

  readonly form = this.fb.group({
    annee: [new Date().getFullYear()],
    mois: [new Date().getMonth() + 1],
    chantiersConcernes: [[] as string[]]
  });

  /** Pour chaque chantier concerné : équipes ayant leur propre section (PDF) et feuille (Excel) —
   * sélection explicite, jamais déduite automatiquement des équipes trouvées pour ce chantier. */
  equipesSepareesParChantier: Record<string, string[] | undefined> = {};
  /** Spécifique à l'Excel : sous-ensemble des équipes séparées ci-dessus, par chantier, exclues de la
   * feuille du chantier (défaut : incluses) — n'a pas de sens pour le PDF, où un employé n'apparaît
   * jamais dans deux sections (voir le Javadoc de EquipeBiVue côté backend). */
  private equipesExcluesParChantier: Record<string, Set<string>> = {};

  private readonly equipesCache = new Map<string, string[]>();
  private readonly equipesLoading = new Set<string>();

  ngOnInit(): void {
    this.form.controls.chantiersConcernes.valueChanges.subscribe(() => this.onChantiersConcernesChange());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.ouvrir();
    }
  }

  setVisible(valeur: boolean): void {
    this.visible = valeur;
    this.visibleChange.emit(valeur);
  }

  hintTexte(): string {
    return this.format === 'PDF'
      ? "Rapport de synthèse : chaque chantier a sa propre page. Une équipe cochée ci-dessous obtient sa propre section (graphique et tableau) ; les autres employés du chantier sont réunis dans un seul tableau, jamais répétés ailleurs."
      : 'Classeur complet : une feuille Global et une feuille par chantier, toujours entières. Une équipe cochée obtient en plus sa propre feuille — ses employés restent aussi visibles dans la feuille du chantier, sauf si vous les en excluez.';
  }

  onPeriodeChange(): void {
    this.equipesCache.clear();
    this.equipesLoading.clear();
    this.equipesSepareesParChantier = {};
    this.equipesExcluesParChantier = {};
    this.form.patchValue({ chantiersConcernes: [] });
  }

  onChantiersConcernesChange(): void {
    const codes = this.form.controls.chantiersConcernes.value ?? [];
    codes.forEach((code) => this.chargerEquipesSiNecessaire(code));
    this.equipesSepareesParChantier = Object.fromEntries(
      Object.entries(this.equipesSepareesParChantier).filter(([code]) => codes.includes(code))
    );
    this.equipesExcluesParChantier = Object.fromEntries(
      Object.entries(this.equipesExcluesParChantier).filter(([code]) => codes.includes(code))
    );
  }

  onEquipesSepareesChange(code: string, equipes: string[]): void {
    this.equipesSepareesParChantier = { ...this.equipesSepareesParChantier, [code]: equipes };
    const exclues = this.equipesExcluesParChantier[code];
    if (exclues) {
      const equipesRestantes = new Set(equipes);
      Array.from(exclues)
        .filter((equipe) => !equipesRestantes.has(equipe))
        .forEach((equipe) => exclues.delete(equipe));
    }
  }

  equipesDisponiblesPour(chantierCode: string): string[] {
    const cle = this.cleEquipesCache(chantierCode);
    return cle ? (this.equipesCache.get(cle) ?? []) : [];
  }

  chargementEquipesEnCours(chantierCode: string): boolean {
    const cle = this.cleEquipesCache(chantierCode);
    return cle ? this.equipesLoading.has(cle) : false;
  }

  inclusionDe(code: string, equipe: string): Inclusion {
    return this.equipesExcluesParChantier[code]?.has(equipe) ? 'EXCLURE' : 'INCLURE';
  }

  onInclusionChange(code: string, equipe: string, valeur: Inclusion): void {
    const exclues = new Set(this.equipesExcluesParChantier[code] ?? []);
    if (valeur === 'EXCLURE') {
      exclues.add(equipe);
    } else {
      exclues.delete(equipe);
    }
    this.equipesExcluesParChantier = { ...this.equipesExcluesParChantier, [code]: exclues };
  }

  onExporter(): void {
    const annee = this.form.controls.annee.value;
    const mois = this.form.controls.mois.value;
    if (!annee || !mois) {
      return;
    }
    const periode = this.formaterPeriode(annee, mois);
    const equipesParChantier = this.construireEquipesParChantier();

    this.exporting = true;
    if (this.format === 'EXCEL') {
      this.exporterExcel(periode, equipesParChantier);
    } else {
      this.exporterPdf(periode, equipesParChantier);
    }
  }

  private construireEquipesParChantier(): Record<string, string[]> {
    const equipesParChantier: Record<string, string[]> = {};
    for (const code of this.form.controls.chantiersConcernes.value ?? []) {
      const equipes = this.equipesSepareesParChantier[code] ?? [];
      if (equipes.length > 0) {
        equipesParChantier[code] = equipes;
      }
    }
    return equipesParChantier;
  }

  private exporterExcel(periode: string, equipesParChantier: Record<string, string[]>): void {
    const equipesExcluesFeuilleChantier: Record<string, string[]> = {};
    for (const [code, equipes] of Object.entries(equipesParChantier)) {
      const exclues = this.equipesExcluesParChantier[code];
      if (exclues && exclues.size > 0) {
        equipesExcluesFeuilleChantier[code] = equipes.filter((equipe) => exclues.has(equipe));
      }
    }

    const requete: PaieExportRequest = {
      periode,
      feuillesEquipeMode: Object.keys(equipesParChantier).length > 0 ? 'PERSONNALISE' : 'AUCUNE',
      equipesParChantier: Object.keys(equipesParChantier).length > 0 ? equipesParChantier : null,
      equipesExcluesFeuilleChantier: Object.keys(equipesExcluesFeuilleChantier).length > 0 ? equipesExcluesFeuilleChantier : null,
      chantiers: null
    };

    this.paieService
      .exporter(requete)
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: (blob) => this.telecharger(blob, `Paie_Export_${periode}.xlsx`),
        error: (err: HttpErrorResponse) => void this.afficherErreur('export Excel', err)
      });
  }

  private exporterPdf(periode: string, equipesParChantier: Record<string, string[]>): void {
    const requete: PaieRapportPdfRequest = {
      periode,
      equipesParChantier: Object.keys(equipesParChantier).length > 0 ? equipesParChantier : null
    };

    this.paieService
      .telechargerRapportPdf(requete)
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: (blob) => this.telecharger(blob, `Paie_Rapport_BI_${periode}.pdf`),
        error: (err: HttpErrorResponse) => void this.afficherErreur('rapport PDF', err)
      });
  }

  private telecharger(blob: Blob, nomFichier: string): void {
    const url = window.URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    window.URL.revokeObjectURL(url);
    this.setVisible(false);
  }

  /** Avec responseType 'blob', le corps d'erreur JSON du backend arrive lui aussi en Blob : on le
   * relit pour afficher son message (ex. « Aucun bulletin de paie pour la période 2026-08 … ») —
   * l'intercepteur global ne peut pas le faire, il ne voit qu'un Blob opaque sur cette requête. */
  private async afficherErreur(libelle: string, err: HttpErrorResponse): Promise<void> {
    let detail = `L'export n'a pas pu être généré (${libelle}).`;
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
    this.messageService.add({ severity: 'error', summary: 'Export paie', detail, life: 8000 });
  }

  private ouvrir(): void {
    const maintenant = new Date();
    this.form.reset({ annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1, chantiersConcernes: [] });
    this.equipesSepareesParChantier = {};
    this.equipesExcluesParChantier = {};
    this.equipesCache.clear();
    this.equipesLoading.clear();
  }

  private chargerEquipesSiNecessaire(chantierCode: string): void {
    const periode = this.periodeCourante();
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
    const periode = this.periodeCourante();
    return periode ? `${chantierCode}|${periode}` : null;
  }

  private periodeCourante(): string | null {
    const annee = this.form.controls.annee.value;
    const mois = this.form.controls.mois.value;
    return annee && mois ? this.formaterPeriode(annee, mois) : null;
  }

  private formaterPeriode(annee: number, mois: number): string {
    return `${annee}-${String(mois).padStart(2, '0')}`;
  }

  private construireAnneeOptions(): number[] {
    const anneeCourante = new Date().getFullYear();
    const annees: number[] = [];
    for (let annee = anneeCourante + 1; annee >= anneeCourante - NB_ANNEES_PASSEES; annee--) {
      annees.push(annee);
    }
    return annees;
  }
}
