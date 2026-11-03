import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, finalize, Subject } from 'rxjs';

import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/ui/collection-shell/collection-shell.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { LazySelectComponent } from '../../../shared/ui/lazy-select/lazy-select.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { AuthService } from '../../../core/auth/services/auth.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { HeuresSuppSearchCriteria } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppExportEtat } from '../services/heures-supp-export-etat.service';

const CONFIG: CollectionShellConfig = {
  titre: 'Heures sup.',
  libelleVue: 'Vues des heures supplémentaires',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/heures-supp' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/heures-supp/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/heures-supp/analytique' }
  ]
};

@Component({
  selector: 'app-heures-supp-vues',
  imports: [CollectionShellComponent, SplitButtonComponent, MonthInputComponent, LazySelectComponent, ButtonComponent, DialogComponent, RouterLink],
  template: `
    <app-collection-shell [configuration]="configuration">
      <stp-split-button collection-actions label="Importer" icon="upload" moreLabel="Autres actions d’import" [items]="menuImport" [disabled]="telechargementModele()" (clicked)="ouvrirImport()" />
      <button collection-actions stp-button variant="secondary" icon="download" type="button" (click)="ouvrirExport()">Exporter</button>
      @if (peutAjouter()) { <a collection-actions stp-button variant="primary" icon="plus" routerLink="/heures-supp/new">Ajouter une ligne</a> }
      <form collection-filters class="app-toolbar" aria-label="Filtres des heures supplémentaires" (submit)="$event.preventDefault()">
        <stp-month-input ariaLabel="Période des heures supplémentaires" [value]="mois()" (valueChange)="choisirMois($event)" />
        <input class="stp-input" type="search" placeholder="Nom &amp; prénom" aria-label="Nom et prénom" autocomplete="off" [value]="nomPrenom()" (input)="saisirTexte('nom', $event)" />
        <input class="stp-input" type="search" placeholder="CIN" aria-label="CIN" autocomplete="off" spellcheck="false" [value]="cin()" (input)="saisirTexte('cin', $event)" />
        @if (peutLireChantier()) { <app-lazy-select ariaLabel="Chantiers" [source]="chantiers" [multiple]="true" [bulkFilterActions]="true" optionLabel="code" placeholder="Chantiers" summaryLabel="{0} chantiers" [value]="chantierIds()" (valueChange)="choisirIds('chantierIds', $event)" /> }
        @if (peutLireEquipe()) { <app-lazy-select ariaLabel="Équipes" [source]="equipes" [multiple]="true" [bulkFilterActions]="true" optionLabel="libelle" placeholder="Équipes" summaryLabel="{0} équipes" [value]="equipeIds()" (valueChange)="choisirIds('equipeIds', $event)" /> }
        @if (peutLireFonction()) { <app-lazy-select ariaLabel="Fonctions" [source]="fonctions" [multiple]="true" [bulkFilterActions]="true" optionLabel="libelle" placeholder="Fonctions" summaryLabel="{0} fonctions" [value]="fonctionIds()" (valueChange)="choisirIds('fonctionIds', $event)" /> }
        <button stp-button variant="text" icon="x" class="app-toolbar__clear" type="button" aria-label="Effacer les filtres" [disabled]="!aDesFiltres()" (click)="effacerFiltres()">Effacer</button>
      </form>
    </app-collection-shell>
    <stp-dialog header="Exporter les heures supplémentaires" width="30rem" [(open)]="exportOuvert">
      <div class="app-form__grid">
        <label class="field" for="hs-export-periode">Mois <stp-month-input inputId="hs-export-periode" ariaLabel="Mois à exporter" [value]="moisExport()" (valueChange)="moisExport.set($event)" /></label>
        <label class="field" for="hs-export-chantier">Chantier <app-lazy-select inputId="hs-export-chantier" ariaLabel="Chantier à exporter" placeholder="Rechercher un chantier" optionLabel="code" dataKey="id" [source]="chantiers" [value]="chantierExport()" (valueChange)="choisirChantierExport($event)" /></label>
      </div>
      <div stpDialogFooter>
        <button stp-button variant="secondary" type="button" (click)="exportOuvert.set(false)">Annuler</button>
        <button stp-button variant="primary" icon="download" type="button" [loading]="exportEtat.enCours()" [disabled]="!moisExport() || !chantierExport()" (click)="exporterPdf()">Exporter en PDF</button>
      </div>
    </stp-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppVuesComponent {
  protected readonly configuration = CONFIG;
  protected readonly mois = signal<Date | null>(null);
  protected readonly nomPrenom = signal('');
  protected readonly cin = signal('');
  protected readonly chantierIds = signal<number[]>([]);
  protected readonly equipeIds = signal<number[]>([]);
  protected readonly fonctionIds = signal<number[]>([]);
  protected readonly chantiers = inject(ChantierReferenceService);
  protected readonly equipes = inject(EquipeReferenceService);
  protected readonly fonctions = inject(FunctionReferenceService);
  protected readonly exportEtat = inject(HeuresSuppExportEtat);
  protected readonly telechargementModele = signal(false);
  protected readonly exportOuvert = signal(false);
  protected readonly moisExport = signal<Date | null>(null);
  protected readonly chantierExport = signal<number | null>(null);
  protected readonly menuImport: MenuAction[] = [{
    label: 'Télécharger le modèle Excel', icon: 'file-spreadsheet', command: () => this.telechargerModele()
  }];
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(HeuresSuppService);
  private readonly auth = inject(AuthService);
  private readonly changementTexte = new Subject<void>();

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const valeur = params.get('periode');
      this.mois.set(valeur && /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur) ? new Date(Number(valeur.slice(0, 4)), Number(valeur.slice(5, 7)) - 1, 1) : null);
      this.nomPrenom.set(params.get('nom') ?? '');
      this.cin.set(params.get('cin') ?? '');
      this.chantierIds.set(this.lireIds(params.get('chantierIds')));
      this.equipeIds.set(this.lireIds(params.get('equipeIds')));
      this.fonctionIds.set(this.lireIds(params.get('fonctionIds')));
    });
    this.changementTexte.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { nom: this.nomPrenom() || null, cin: this.cin() || null, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  protected choisirMois(value: Date | null): void {
    const periode = value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}` : null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { periode, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected peutAjouter(): boolean { return this.auth.hasPermission('HEURES_SUP_IMPORT') && this.auth.hasPermission('PAIE_READ') && this.auth.hasPermission('EMPLOYEE_READ') && this.auth.hasPermission('CHANTIER_READ'); }
  protected peutLireChantier(): boolean { return this.auth.hasPermission('CHANTIER_READ'); }
  protected peutLireEquipe(): boolean { return this.auth.hasPermission('EQUIPE_READ'); }
  protected peutLireFonction(): boolean { return this.auth.hasPermission('FUNCTION_READ'); }
  protected aDesFiltres(): boolean { return !!(this.mois() || this.nomPrenom() || this.cin() || this.chantierIds().length || this.equipeIds().length || this.fonctionIds().length); }
  protected saisirTexte(cle: 'nom' | 'cin', event: Event): void {
    const valeur = (event.target as HTMLInputElement).value.trim();
    (cle === 'nom' ? this.nomPrenom : this.cin).set(valeur);
    this.changementTexte.next();
  }
  protected choisirIds(cle: 'chantierIds' | 'equipeIds' | 'fonctionIds', value: unknown): void {
    const ids = Array.isArray(value) ? value.map(Number).filter((id) => Number.isInteger(id) && id >= 0) : [];
    (cle === 'chantierIds' ? this.chantierIds : cle === 'equipeIds' ? this.equipeIds : this.fonctionIds).set(ids);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [cle]: ids.length ? ids.join(',') : null, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  protected effacerFiltres(): void {
    this.nomPrenom.set(''); this.cin.set(''); this.chantierIds.set([]); this.equipeIds.set([]); this.fonctionIds.set([]); this.mois.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { periode: null, nom: null, cin: null, chantierIds: null, equipeIds: null, fonctionIds: null, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
  private lireIds(value: string | null): number[] { return value?.split(',').map(Number).filter((id) => Number.isInteger(id) && id >= 0) ?? []; }

  /** Ouvre l'export : le mois proposé est le dernier mois importé, le chantier est à choisir. */
  protected ouvrirExport(): void {
    if (this.exportEtat.enCours()) return;
    this.chantierExport.set(null);
    this.moisExport.set(this.mois());
    this.exportOuvert.set(true);
    if (!this.mois()) {
      this.service.periodes().subscribe((periodes) => {
        const derniere = [...periodes].sort().at(-1);
        if (derniere && !this.moisExport()) this.moisExport.set(new Date(Number(derniere.slice(0, 4)), Number(derniere.slice(5, 7)) - 1, 1));
      });
    }
  }

  protected choisirChantierExport(value: unknown): void { this.chantierExport.set(typeof value === 'number' ? value : null); }

  /** Exporte en PDF le mois et le chantier choisis dans le dialogue, dans l'ordre du tableau. */
  protected exporterPdf(): void {
    const mois = this.moisExport();
    const chantierId = this.chantierExport();
    if (this.exportEtat.enCours() || !mois || !chantierId) return;
    const criteres: HeuresSuppSearchCriteria = {
      periode: `${mois.getFullYear()}-${String(mois.getMonth() + 1).padStart(2, '0')}`,
      chantierIds: [chantierId]
    };
    this.exportEtat.enCours.set(true);
    this.service.exporterPdf(criteres, this.exportEtat.tri()).pipe(finalize(() => this.exportEtat.enCours.set(false))).subscribe((blob) => {
      this.exportOuvert.set(false);
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `Heures_supplementaires_${criteres.periode}.pdf`;
      lien.click();
      window.URL.revokeObjectURL(url);
    });
  }

  protected ouvrirImport(): void {
    void this.router.navigate(['/heures-supp/import']);
  }

  private telechargerModele(): void {
    if (this.telechargementModele()) return;
    this.telechargementModele.set(true);
    this.service.telechargerModele().pipe(finalize(() => this.telechargementModele.set(false))).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = 'Modele_Heures_Supplementaires.xlsx';
      lien.click();
      window.URL.revokeObjectURL(url);
    });
  }
}
