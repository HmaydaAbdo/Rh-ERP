import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { ColumnState } from '../../../shared/table/table-columns';
import { ColumnChooserComponent } from '../../../shared/ui/column-chooser/column-chooser.component';
import { MonthPickerComponent } from '../../../shared/ui/month-picker/month-picker.component';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { Sortie, SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';

/** Libellé affiché pour le motif que l'API renvoie quand aucun motif n'a été saisi. */
export const LIBELLE_MOTIF_NON_PRECISE = 'Non précisé';

export function libelleMotif(motif: string): string {
  return motif === 'NON_PRECISE' ? LIBELLE_MOTIF_NON_PRECISE : motif;
}

/** Mois courant au format `aaaa-MM`, celui de l'API. */
export function moisCourant(maintenant: Date = new Date()): string {
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Sorties du mois : qui a quitté son poste et pourquoi. C'est la source de l'équipe RH pour le calcul des STC et le suivi des
 * abandons de poste ; chaque nom ouvre la fiche de l'employé.
 */
@Component({
  selector: 'app-sortie-page',
  imports: [ColumnChooserComponent, MonthPickerComponent, RouterLink, TableComponent, TableCellDirective],
  templateUrl: './sortie-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortiePageComponent {
  private readonly service = inject(SortieService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private requete: Subscription | null = null;

  protected readonly periode = signal(moisCourant());
  protected readonly resultat = signal<SortiesMois | null>(null);
  protected readonly chargement = signal(false);
  protected readonly motifs = computed(() =>
    Object.entries(this.resultat()?.parMotif ?? {}).map(([motif, nombre]) => ({ motif: libelleMotif(motif), nombre }))
  );
  protected readonly lignes = computed<Sortie[]>(() => this.resultat()?.sorties ?? []);
  protected readonly libelleMotif = libelleMotif;

  protected readonly colonnes = new ColumnState([
    { field: 'nomPrenom', header: 'Nom et prénom', minWidth: 220 },
    { field: 'cin', header: 'CIN', minWidth: 120 },
    { field: 'motif', header: 'Motif', minWidth: 180 }
  ]);

  constructor() {
    this.charger(this.periode());
    this.destroyRef.onDestroy(() => this.requete?.unsubscribe());
  }

  protected choisir(periode: string): void {
    this.periode.set(periode);
    this.charger(periode);
  }

  private charger(periode: string): void {
    this.requete?.unsubscribe();
    this.chargement.set(true);
    this.requete = this.service
      .sortiesDuMois(periode)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.chargement.set(false))
      )
      .subscribe({
        next: (resultat) => this.resultat.set(resultat),
        error: () => {
          this.resultat.set(null);
          this.notifications.add({ severity: 'error', summary: 'Impossible de charger les sorties du mois.' });
        }
      });
  }
}
