import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';

import { CollectionTableComponent, CollectionTableConfig } from '../../../shared/components/collection-table/collection-table.component';
import { ColumnState } from '../../../shared/table/table-columns';
import { TableCellDirective, TableLazyLoadEvent } from '../../../shared/ui/table/table.component';
import { HeuresSupp, HeuresSuppSearchCriteria } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { AuthService } from '../../../core/auth/services/auth.service';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';

const TABLE: CollectionTableConfig = { countLabel: (n) => `${n} ligne${n > 1 ? 's' : ''}`, accessibleLabel: 'Liste des heures supplémentaires', emptyMessage: 'Aucune heure supplémentaire ou forfait sur ce périmètre.' };

@Component({
  selector: 'app-heures-supp-list',
  imports: [DecimalPipe, CollectionTableComponent, TableCellDirective, ButtonComponent, LazySelectComponent],
  templateUrl: './heures-supp-list.component.html',
  styles: `.heures-supp-secondaire{display:block;color:var(--color-text-muted);font-size:.875em}.heures-supp-ajout{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;align-items:end;padding:1rem;margin-bottom:1rem;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface)}.heures-supp-ajout h2{grid-column:1/-1;margin:0}.heures-supp-ajout label{display:grid;gap:.4rem}.heures-supp-purge{position:fixed;inset:20% 10%;z-index:1000;padding:2rem;border:1px solid var(--color-border);border-radius:var(--radius-xl);background:var(--color-surface);box-shadow:var(--shadow-md)}.heures-supp-purge label{display:grid;gap:.5rem;margin:1rem 0}.heures-supp-actions-mois{display:flex;justify-content:flex-end;margin-bottom:1rem}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppListComponent {
  protected readonly table = TABLE;
  protected readonly columns = new ColumnState([
    { field: 'periode', header: 'Mois' }, { field: 'chantier', header: 'Chantier' }, { field: 'employe', header: 'Employé' },
    { field: 'fonction', header: 'Fonction' }, { field: 'heuresSupplementaires', header: 'P/H' }, { field: 'montantDh', header: 'Montant' },
    { field: 'stcDh', header: 'STC' }, { field: 'forfaitDh', header: 'Forfait' }, { field: 'netAPayerDh', header: 'Net à payer' }, { field: 'actions', header: 'Actions' }
  ]);
  protected readonly lignes = signal<HeuresSupp[]>([]);
  protected readonly employeeReferences = inject(EmployeeReferenceService);
  protected readonly chantierReferences = inject(ChantierReferenceService);
  protected readonly nouvelEmploye = signal<unknown>(null);
  protected readonly nouveauChantier = signal<unknown>(null);
  protected readonly nouvellePeriode = signal(new Date().toISOString().slice(0, 7));
  protected readonly nouvellesHeures = signal<number | null>(null);
  protected readonly nouveauForfait = signal<number | null>(null);
  protected readonly total = signal(0);
  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly editionId = signal<number | null>(null);
  protected readonly heuresEdition = signal<number | null>(null);
  protected readonly forfaitEdition = signal<number | null>(null);
  protected readonly purgeNombre = signal<number | null>(null);
  protected readonly purgeSaisie = signal('');
  private readonly service = inject(HeuresSuppService);
  private readonly confirmation = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  protected criteres: HeuresSuppSearchCriteria = {};
  private dernierEvenement: TableLazyLoadEvent | null = null;

  protected canDelete(): boolean { return this.auth.hasPermission('HEURES_SUP_DELETE'); }
  protected canPurge(): boolean { return this.auth.hasPermission('HEURES_SUP_PURGE'); }
  protected canWrite(): boolean { return this.auth.hasPermission('HEURES_SUP_IMPORT') && this.auth.hasPermission('EMPLOYEE_READ') && this.auth.hasPermission('CHANTIER_READ'); }
  protected purgeConfirme(): boolean { const nombre = this.purgeNombre(); return nombre !== null && this.purgeSaisie().trim() === `${nombre}`; }
  protected inputText(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected numberValue(event: Event): number | null { const value = (event.target as HTMLInputElement).value; return value === '' ? null : Number(value); }
  protected nouvelleSaisieValide(): boolean { return Number.isInteger(this.nouvelEmploye()) && Number.isInteger(this.nouveauChantier()) && !!this.nouvellePeriode() && (this.nouvellesHeures() !== null || this.nouveauForfait() !== null); }
  protected ajouter(): void {
    if (!this.nouvelleSaisieValide()) return;
    this.service.creer({ employeeId: Number(this.nouvelEmploye()), chantierId: Number(this.nouveauChantier()), periode: this.nouvellePeriode(), heuresSupplementaires: this.nouvellesHeures(), forfaitDh: this.nouveauForfait() }).subscribe({ next: () => { this.nouvelEmploye.set(null); this.nouveauChantier.set(null); this.nouvellesHeures.set(null); this.nouveauForfait.set(null); if (this.dernierEvenement) this.charger(this.dernierEvenement); }, error: () => this.erreur.set('La ligne n’a pas pu être ajoutée. Vérifiez la paie du mois, les doublons et les valeurs saisies.') });
  }
  protected editer(ligne: HeuresSupp): void { this.editionId.set(ligne.id); this.heuresEdition.set(ligne.heuresSupplementaires); this.forfaitEdition.set(ligne.forfaitDh); }
  protected sauver(ligne: HeuresSupp): void {
    this.service.modifier(ligne.id, { version: ligne.version, heuresSupplementaires: this.heuresEdition(), forfaitDh: this.forfaitEdition() })
      .subscribe({ next: () => { this.editionId.set(null); if (this.dernierEvenement) this.charger(this.dernierEvenement); }, error: () => this.erreur.set('La ligne n’a pas pu être modifiée. Actualisez puis réessayez.') });
  }
  protected supprimer(ligne: HeuresSupp): void {
    this.confirmation.confirm({ header: 'Supprimer cette ligne ?', message: `${ligne.nomPrenom} · ${ligne.periode} · ${ligne.chantier}`, acceptLabel: 'Supprimer', rejectLabel: 'Annuler', accept: () => this.service.supprimer(ligne.id).subscribe({ next: () => { if (this.dernierEvenement) this.charger(this.dernierEvenement); }, error: () => this.erreur.set('La ligne n’a pas pu être supprimée. Actualisez puis réessayez.') }) });
  }
  protected preparerPurge(): void {
    const periode = this.criteres.periode;
    if (!periode) return;
    this.service.search({ periode }, 0, 1).subscribe({ next: (page) => { this.purgeNombre.set(page.page.totalElements); this.purgeSaisie.set(''); }, error: () => this.erreur.set('Le nombre de lignes du mois n’a pas pu être vérifié.') });
  }
  protected purgerMois(): void {
    const periode = this.criteres.periode; const nombre = this.purgeNombre();
    if (!periode || nombre === null || this.purgeSaisie() !== String(nombre)) return;
    this.service.supprimerMois(periode, nombre).subscribe({ next: () => { this.purgeNombre.set(null); if (this.dernierEvenement) this.charger(this.dernierEvenement); }, error: () => { this.purgeNombre.set(null); this.erreur.set('Le mois a changé ou n’a pas pu être supprimé. Rechargez les données avant de réessayer.'); } });
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
  }
}
