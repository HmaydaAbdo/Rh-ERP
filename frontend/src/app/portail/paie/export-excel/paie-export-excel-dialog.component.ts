import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { PaieExportRequest } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

type Inclusion = 'INCLURE' | 'EXCLURE';

const LIBELLES_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const NB_ANNEES_PASSEES = 5;

/**
 * Dialog d'export Excel de la paie — expérience dédiée, indépendante du rapport PDF (voir
 * PaieListComponent pour le dialog PDF). Structure toujours générée par le backend (voir
 * docs/report/README.md) : feuille Global (tous les employés) + une feuille par chantier.
 *
 * Cette dialog ne pilote que la configuration optionnelle des sous-feuilles équipe : pour chaque
 * chantier concerné, l'utilisateur choisit explicitement les équipes à séparer (aucune sélection
 * automatique de "toutes les équipes"), puis pour chacune si elle reste aussi dans la feuille du
 * chantier ou en est exclue.
 */
@Component({
  selector: 'app-paie-export-excel-dialog',
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
  templateUrl: './paie-export-excel-dialog.component.html',
  styleUrl: './paie-export-excel-dialog.component.scss'
})
export class PaieExportExcelDialogComponent implements OnChanges, OnInit {
  private readonly paieService = inject(PaieService);
  readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();

  exporting = false;

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

  /** Pour chaque chantier concerné : équipes ayant leur propre feuille — sélection explicite,
   * jamais déduite automatiquement des équipes trouvées pour ce chantier. */
  equipesSepareesParChantier: Record<string, string[] | undefined> = {};
  /** Sous-ensemble des équipes séparées ci-dessus, par chantier, exclues de la feuille du chantier
   * (défaut : incluses). */
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

    const equipesParChantier: Record<string, string[]> = {};
    const equipesExcluesFeuilleChantier: Record<string, string[]> = {};
    for (const code of this.form.controls.chantiersConcernes.value ?? []) {
      const equipes = this.equipesSepareesParChantier[code] ?? [];
      if (equipes.length === 0) {
        continue;
      }
      equipesParChantier[code] = equipes;
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
        this.setVisible(false);
      });
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
