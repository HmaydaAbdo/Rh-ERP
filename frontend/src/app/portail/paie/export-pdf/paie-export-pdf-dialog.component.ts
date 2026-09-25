import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { finalize } from 'rxjs';

import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { PaieRapportPdfRequest } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

/** Filtres actifs sur la page Paie au moment de l'ouverture du dialog — même forme que
 * PaieListComponent.filterForm (moins le tri/la pagination, hors-sujet pour un rapport). */
export interface PaieFiltresActifs {
  nomPrenom: string | null;
  cin: string | null;
  periode: Date | null;
  fonctionId: number | null;
  chantierId: number | null;
}

const LIBELLES_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const NB_ANNEES_PASSEES = 5;

/**
 * Dialog d'export du rapport PDF — un rapport BI RH/Paie de synthèse pour la direction (voir
 * docs/report/README.md), pas un export tabulaire (voir PaieExportExcelDialogComponent pour
 * celui-ci). Le périmètre reprend exactement les filtres déjà actifs sur la page Paie : ce dialog
 * ne fait que les afficher (lecture seule) et demander la période à analyser (obligatoire, non
 * portée par le filtre "Période" qui est optionnel côté liste).
 */
@Component({
  selector: 'app-paie-export-pdf-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, DialogModule, DropdownModule],
  templateUrl: './paie-export-pdf-dialog.component.html',
  styleUrl: './paie-export-pdf-dialog.component.scss'
})
export class PaieExportPdfDialogComponent implements OnChanges {
  private readonly paieService = inject(PaieService);
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);

  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();

  @Input() filtreCourant: PaieFiltresActifs = { nomPrenom: null, cin: null, periode: null, fonctionId: null, chantierId: null };
  @Input() functions: FunctionReference[] = [];
  @Input() chantiers: ChantierReference[] = [];

  exporting = false;
  filtresLibelles: string[] = [];

  readonly anneeOptions: number[] = this.construireAnneeOptions();
  readonly moisOptions: { label: string; value: number }[] = LIBELLES_MOIS.map((label, index) => ({ label, value: index + 1 }));

  readonly form = this.fb.group({
    annee: [new Date().getFullYear()],
    mois: [new Date().getMonth() + 1]
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.ouvrir();
    }
  }

  setVisible(valeur: boolean): void {
    this.visible = valeur;
    this.visibleChange.emit(valeur);
  }

  onExporter(): void {
    const annee = this.form.controls.annee.value;
    const mois = this.form.controls.mois.value;
    if (!annee || !mois) {
      return;
    }
    const periode = `${annee}-${String(mois).padStart(2, '0')}`;

    const requete: PaieRapportPdfRequest = {
      periode,
      nomPrenom: this.filtreCourant.nomPrenom || null,
      cin: this.filtreCourant.cin || null,
      fonctionId: this.filtreCourant.fonctionId,
      chantierId: this.filtreCourant.chantierId
    };

    this.exporting = true;
    this.paieService
      .telechargerRapportPdf(requete)
      .pipe(finalize(() => (this.exporting = false)))
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const lien = document.createElement('a');
          lien.href = url;
          lien.download = `Paie_Rapport_BI_${periode}.pdf`;
          lien.click();
          window.URL.revokeObjectURL(url);
          this.setVisible(false);
        },
        error: (err: HttpErrorResponse) => void this.afficherErreur(err)
      });
  }

  private ouvrir(): void {
    const periodeFiltre = this.filtreCourant.periode ?? new Date();
    this.form.reset({ annee: periodeFiltre.getFullYear(), mois: periodeFiltre.getMonth() + 1 });
    this.filtresLibelles = this.construireFiltresLibelles();
  }

  private construireFiltresLibelles(): string[] {
    const libelles: string[] = [];
    if (this.filtreCourant.chantierId != null) {
      const chantier = this.chantiers.find((c) => c.id === this.filtreCourant.chantierId);
      libelles.push(`Chantier : ${chantier?.code ?? this.filtreCourant.chantierId}`);
    }
    if (this.filtreCourant.fonctionId != null) {
      const fonction = this.functions.find((f) => f.id === this.filtreCourant.fonctionId);
      libelles.push(`Fonction : ${fonction?.libelle ?? this.filtreCourant.fonctionId}`);
    }
    if (this.filtreCourant.nomPrenom) {
      libelles.push(`Nom & prénom contient : ${this.filtreCourant.nomPrenom}`);
    }
    if (this.filtreCourant.cin) {
      libelles.push(`CIN contient : ${this.filtreCourant.cin}`);
    }
    return libelles;
  }

  /** Avec responseType 'blob', le corps d'erreur JSON du backend arrive lui aussi en Blob : on le
   * relit pour afficher son message (ex. « Aucun bulletin de paie pour la période 2026-08 … ») —
   * l'intercepteur global ne peut pas le faire, il ne voit qu'un Blob opaque sur cette requête. */
  private async afficherErreur(err: HttpErrorResponse): Promise<void> {
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

  private construireAnneeOptions(): number[] {
    const anneeCourante = new Date().getFullYear();
    const annees: number[] = [];
    for (let annee = anneeCourante + 1; annee >= anneeCourante - NB_ANNEES_PASSEES; annee--) {
      annees.push(annee);
    }
    return annees;
  }
}
