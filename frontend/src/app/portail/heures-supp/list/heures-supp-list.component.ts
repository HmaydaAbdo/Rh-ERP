import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, map } from 'rxjs';

import { CollectionTableComponent, CollectionTableConfig } from '../../../shared/components/collection-table/collection-table.component';
import { ColumnState } from '../../../shared/table/table-columns';
import { TableCellDirective, TableLazyLoadEvent } from '../../../shared/ui/table/table.component';
import { HeuresSupp, HeuresSuppSearchCriteria } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { NumberInputComponent } from '../../../shared/ui/number-input/number-input.component';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { AuthService } from '../../../core/auth/services/auth.service';
import { PdfExportButtonComponent } from '../../../shared/components/pdf-export-button/pdf-export-button.component';
import { PdfImpressionDocument } from '../../../shared/services/pdf-impression.service';
import { chargerToutLeReferentiel } from '../../perimetre/perimetre-module';

const TABLE: CollectionTableConfig = { countLabel: (n) => `${n} ligne${n > 1 ? 's' : ''}`, accessibleLabel: 'Liste des heures supplémentaires', emptyMessage: 'Aucune heure supplémentaire ou forfait sur ce périmètre.' };

@Component({
  selector: 'app-heures-supp-list',
  imports: [DecimalPipe, CollectionTableComponent, TableCellDirective, ButtonComponent, DialogComponent, NumberInputComponent, PdfExportButtonComponent],
  templateUrl: './heures-supp-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppListComponent {
  protected readonly table = TABLE;
  protected readonly columns = new ColumnState([
    { field: 'periode', header: 'Mois' }, { field: 'chantier', header: 'Chantier' }, { field: 'employe', header: 'Employé' },
    { field: 'cin', header: 'CIN' }, { field: 'fonction', header: 'Fonction' }, { field: 'salaireReferenceDh', header: 'Salaire référence' },
    { field: 'typeSalaireReference', header: 'Type salaire' }, { field: 'salaireHoraireDh', header: 'S/H' },
    { field: 'heuresSupplementaires', header: 'P/H' }, { field: 'montantDh', header: 'Montant' }, { field: 'stcOuSortie', header: 'Statut paie' },
    { field: 'stcDh', header: 'STC' }, { field: 'forfaitDh', header: 'Forfait' }, { field: 'netAPayerDh', header: 'Net à payer' }, { field: 'actions', header: 'Actions' }
  ]);
  protected readonly lignes = signal<HeuresSupp[]>([]);
  protected readonly total = signal(0);
  protected readonly totalNetAPayer = signal<number | null>(null);
  protected readonly erreurTotal = signal(false);
  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly purgeNombre = signal<number | null>(null);
  protected readonly purgeSaisie = signal<number | null>(null);
  protected readonly purgeDialogueOuvert = signal(false);
  private readonly service = inject(HeuresSuppService);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected criteres: HeuresSuppSearchCriteria = {};
  private dernierEvenement: TableLazyLoadEvent | null = null;
  private dernierCritereAnalytique = '';

  protected readonly documentVide: PdfImpressionDocument = { titre: 'Heures supplémentaires', contexte: '', colonnes: [], lignes: [] };
  protected readonly chargerExport = () => {
    const criteres = { ...this.criteres };
    const colonnes = this.columns.visible.filter((colonne) => colonne.field !== 'actions');
    return forkJoin({
      lignes: chargerToutLeReferentiel((page, taille) => this.service.search(criteres, page, taille)),
      analytique: this.service.analyser(criteres)
    }).pipe(map(({ lignes, analytique }) => ({
      titre: 'Heures supplémentaires',
      contexte: `${this.contexteFiltres()} · Total net à payer : ${analytique.indicateurs.netAPayerDh.toFixed(2)} DH`,
      colonnes: colonnes.map((colonne) => colonne.header),
      lignes: [...lignes.map((ligne) => colonnes.map((colonne) => this.valeurExport(ligne, colonne.field))), colonnes.map((colonne) => colonne.field === 'employe' ? 'TOTAL NET À PAYER' : colonne.field === 'netAPayerDh' ? `${analytique.indicateurs.netAPayerDh.toFixed(2)} DH` : '')]
    })));
  };

  protected canDelete(): boolean { return this.auth.hasPermission('HEURES_SUP_DELETE'); }
  protected canPurge(): boolean { return this.auth.hasPermission('HEURES_SUP_PURGE'); }
  protected canWrite(): boolean { return this.auth.hasPermission('HEURES_SUP_IMPORT') && this.auth.hasPermission('EMPLOYEE_READ') && this.auth.hasPermission('CHANTIER_READ'); }
  protected purgeConfirme(): boolean { const nombre = this.purgeNombre(); return nombre !== null && this.purgeSaisie() === nombre; }
  protected fermerPurge(): void { this.purgeDialogueOuvert.set(false); this.purgeNombre.set(null); this.purgeSaisie.set(null); }
  protected modifier(ligne: HeuresSupp): void { void this.router.navigate(['/heures-supp', ligne.id, 'edit']); }
  protected supprimer(ligne: HeuresSupp): void {
    this.confirmation.confirm({ header: 'Supprimer cette ligne ?', message: `${ligne.nomPrenom} · ${ligne.periode} · ${ligne.chantier}`, acceptLabel: 'Supprimer', rejectLabel: 'Annuler', accept: () => this.service.supprimer(ligne.id).subscribe({ next: () => { if (this.dernierEvenement) this.charger(this.dernierEvenement); }, error: () => this.erreur.set('La ligne n’a pas pu être supprimée. Actualisez puis réessayez.') }) });
  }
  protected preparerPurge(): void {
    const periode = this.criteres.periode;
    if (!periode) return;
    this.service.search({ periode }, 0, 1).subscribe({ next: (page) => { this.purgeNombre.set(page.page.totalElements); this.purgeSaisie.set(null); this.purgeDialogueOuvert.set(true); }, error: () => this.erreur.set('Le nombre de lignes du mois n’a pas pu être vérifié.') });
  }
  protected purgerMois(): void {
    const periode = this.criteres.periode; const nombre = this.purgeNombre();
    if (!periode || nombre === null || this.purgeSaisie() !== nombre) return;
    this.service.supprimerMois(periode, nombre).subscribe({ next: () => { this.fermerPurge(); if (this.dernierEvenement) this.charger(this.dernierEvenement); }, error: () => { this.fermerPurge(); this.erreur.set('Le mois a changé ou n’a pas pu être supprimé. Rechargez les données avant de réessayer.'); } });
  }

  private valeurExport(ligne: HeuresSupp, champ: string): string {
    const valeurs: Record<string, unknown> = {
      periode: ligne.periode, chantier: `${ligne.codeChantier} ${ligne.chantier}`, employe: ligne.nomPrenom, cin: ligne.cin,
      fonction: ligne.fonction, salaireReferenceDh: ligne.salaireReferenceDh === null ? '—' : `${ligne.salaireReferenceDh} DH`,
      typeSalaireReference: ligne.typeSalaireReference === 'JOURNALIER' ? 'Journalier' : ligne.typeSalaireReference === 'MENSUEL' ? 'Mensuel' : '—',
      salaireHoraireDh: ligne.salaireHoraireDh === null ? '—' : `${ligne.salaireHoraireDh} DH/h`,
      heuresSupplementaires: ligne.heuresSupplementaires === null ? '—' : `${ligne.heuresSupplementaires} h`,
      montantDh: `${ligne.montantDh} DH`, stcOuSortie: ligne.stcOuSortie ? 'STC / sortie' : '—', stcDh: `${ligne.stcDh} DH`,
      forfaitDh: ligne.forfaitDh === null ? '—' : `${ligne.forfaitDh} DH`, netAPayerDh: `${ligne.netAPayerDh} DH`
    };
    return String(valeurs[champ] ?? '—');
  }

  private contexteFiltres(): string {
    const f = this.criteres;
    const valeurs = [f.periode && `Mois : ${f.periode}`, f.nomPrenom && `Nom : ${f.nomPrenom}`, f.cin && `CIN : ${f.cin}`].filter(Boolean);
    if (f.chantierIds?.length) valeurs.push(`Chantiers : ${f.chantierIds.join(', ')}`);
    if (f.equipeIds?.length) valeurs.push(`Équipes : ${f.equipeIds.join(', ')}`);
    if (f.fonctionIds?.length) valeurs.push(`Fonctions : ${f.fonctionIds.join(', ')}`);
    return valeurs.join(' · ') || 'Toutes les heures supplémentaires';
  }

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const periode = params.get('periode');
      const ids = (key: string): number[] | undefined => {
        const value = params.get(key);
        if (value === null) return undefined;
        return value.split(',').map(Number).filter((id) => Number.isInteger(id) && id >= 0);
      };
      this.criteres = {
        periode: periode ?? undefined,
        nomPrenom: params.get('nom')?.trim() || undefined,
        cin: params.get('cin')?.trim() || undefined,
        chantierIds: ids('chantierIds'),
        equipeIds: ids('equipeIds'),
        fonctionIds: ids('fonctionIds')
      };
      if (this.dernierEvenement) this.charger(this.dernierEvenement);
    });
  }

  protected charger(event: TableLazyLoadEvent): void {
    this.dernierEvenement = event;
    this.chargement.set(true); this.erreur.set(null);
    this.service.search(this.criteres, Math.floor(event.first / event.rows), event.rows).pipe(finalize(() => this.chargement.set(false))).subscribe({
      next: (page) => { this.lignes.set(page.content); this.total.set(page.page.totalElements); },
      error: () => this.erreur.set('Les heures supplémentaires n’ont pas pu être chargées. Réessayez.')
    });
    const cleAnalytique = JSON.stringify(this.criteres);
    if (cleAnalytique !== this.dernierCritereAnalytique) {
      this.dernierCritereAnalytique = cleAnalytique;
      this.totalNetAPayer.set(null);
      this.erreurTotal.set(false);
      this.service.analyser(this.criteres).subscribe({
        next: (analytique) => this.totalNetAPayer.set(analytique.indicateurs.netAPayerDh),
        error: () => this.erreurTotal.set(true)
      });
    }
  }
}
