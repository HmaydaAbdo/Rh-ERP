import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { Observable, Subject, debounceTime, distinctUntilChanged, forkJoin, of } from 'rxjs';

import { LazySelectSource } from './lazy-select.model';

/** Sélecteur générique recherche + chargement différé (voir `conventions/frontend.md`, section
 * Sélecteurs) — un seul composant pour tout le projet, chaque domaine ne fournit qu'un
 * {@link LazySelectSource} (ex. `ChantierReferenceService`) au lieu de dupliquer la pagination et le
 * debounce de recherche dans chaque formulaire/filtre.
 *
 * `multiple` ne change que la cardinalité de la sélection (`p-multiSelect` vs `p-dropdown`) — jamais
 * la recherche/pagination, communes aux deux. Un champ qui pilote une relation unique d'un
 * enregistrement (ex. le chantier d'un bulletin de paie) reste `multiple=false` : le multiselect ne
 * s'applique qu'aux filtres de liste et aux relations réellement multiples (voir la convention).
 *
 * Valeur exposée au formulaire hôte (`formControlName`) : un identifiant (`dataKey`) en mode simple,
 * un tableau d'identifiants en mode multiple — jamais l'objet complet, pour rester compatible avec
 * les DTO existants (`chantierId`, `fonctionId`, ...) sans aucun changement de contrat.
 *
 * `[ngModel]`/`(ngModelChange)` ci-dessous ne sont PAS un formulaire Template Driven : c'est le seul
 * moyen de piloter un composant PrimeNG (qui expose sa propre implémentation de
 * `ControlValueAccessor`) depuis l'intérieur d'un autre `ControlValueAccessor` — la règle
 * "Reactive Forms exclusivement" de `conventions/frontend.md` porte sur les formulaires de page,
 * jamais sur la plomberie interne d'un composant de présentation réutilisable.
 */
@Component({
  selector: 'app-lazy-select',
  standalone: true,
  imports: [CommonModule, FormsModule, DropdownModule, MultiSelectModule],
  templateUrl: './lazy-select.component.html',
  styleUrl: './lazy-select.component.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LazySelectComponent), multi: true }]
})
export class LazySelectComponent<T extends object = Record<string, unknown>> implements OnInit, ControlValueAccessor {
  @Input({ required: true }) source!: LazySelectSource<T>;
  @Input() multiple = false;
  @Input() optionLabel = 'label';
  @Input() dataKey = 'id';
  @Input() placeholder = 'Sélectionner...';
  @Input() filterPlaceholder = 'Rechercher...';
  @Input() pageSize = 30;
  @Input() virtualScrollItemSize = 36;
  @Input() showClear = true;
  /** `null` (défaut) laisse le panneau s'afficher dans son conteneur naturel — suffisant pour un champ
   * de formulaire de page. `"body"` fait sortir le panneau du flux (overlay ajouté à `<body>`) :
   * NÉCESSAIRE dès que ce composant est utilisé dans un conteneur à défilement/overflow contraint
   * (ex. `p-dialog`), sans quoi le panneau — surtout avec le scroll virtuel activé ici — peut se
   * retrouver rogné ou mal positionné, ses lignes ne correspondant alors plus à la zone réellement
   * cliquable (régression constatée le 2026-09-28 sur le dialog d'export Excel de la paie, alors
   * `PaieExportExcelDialogComponent`, depuis fusionné avec le dialog PDF en `PaieExportDialogComponent`
   * — ce champ avait `appendTo="body"` avant d'être migré vers ce composant partagé, qui ne l'exposait
   * pas encore). */
  @Input() appendTo: string | null = null;

  options: (T | undefined)[] = [];
  loading = false;
  disabled = false;
  internalSingleValue: T | null = null;
  internalMultipleValue: T[] = [];

  private totalRecords = 0;
  private currentSearch = '';
  private initialLoadDone = false;
  private readonly filterSubject = new Subject<string>();

  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    this.filterSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((term) => this.resetAndLoad(term));
  }

  ngOnInit(): void {
    this.ensureInitialLoad();
  }

  private ensureInitialLoad(): void {
    if (this.initialLoadDone) {
      return;
    }
    this.initialLoadDone = true;
    this.resetAndLoad('');
  }

  onFilterInput(term: string): void {
    this.filterSubject.next(term ?? '');
  }

  onLazyLoad(event: { first: number; last: number }): void {
    this.ensureInitialLoad();
    const page = Math.floor(event.first / this.pageSize);
    const pageStart = page * this.pageSize;
    if (this.options[pageStart] !== undefined || pageStart >= this.totalRecords) {
      return;
    }
    this.loading = true;
    this.source.fetchPage(page, this.pageSize, this.currentSearch).subscribe((result) => {
      const next = [...this.options];
      result.items.forEach((item, index) => (next[pageStart + index] = item));
      this.options = next;
      this.loading = false;
    });
  }

  onSingleChange(value: T | null): void {
    this.internalSingleValue = value;
    this.onChange(value ? this.keyOf(value) : null);
    this.onTouched();
  }

  onMultipleChange(values: T[]): void {
    this.internalMultipleValue = values ?? [];
    this.onChange(this.internalMultipleValue.map((v) => this.keyOf(v)));
    this.onTouched();
  }

  writeValue(value: unknown): void {
    this.ensureInitialLoad();
    if (this.multiple) {
      const ids = (value as Array<number | string> | null) ?? [];
      if (ids.length === 0) {
        this.internalMultipleValue = [];
        return;
      }
      forkJoin(ids.map((id) => this.resolveOne(id))).subscribe(
        (items) => (this.internalMultipleValue = items.filter((item): item is T => !!item))
      );
    } else {
      const id = value as number | string | null;
      if (id === null || id === undefined) {
        this.internalSingleValue = null;
        return;
      }
      this.resolveOne(id).subscribe((item) => (this.internalSingleValue = item));
    }
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  /** Réutilise l'objet déjà chargé s'il est déjà dans la page courante (évite un aller-retour réseau
   * inutile) — sinon le résout individuellement (voir {@link LazySelectSource.fetchById}), pour
   * afficher correctement une valeur déjà sélectionnée (mode édition) même si elle n'est pas dans la
   * première page de résultats. */
  private resolveOne(id: number | string): Observable<T | null> {
    const loaded = this.options.find((option) => option !== undefined && this.keyOf(option) === id);
    return loaded ? of(loaded) : this.source.fetchById(id);
  }

  private keyOf(item: T): unknown {
    return (item as Record<string, unknown>)[this.dataKey];
  }

  private resetAndLoad(search: string): void {
    this.currentSearch = search;
    this.loading = true;
    this.source.fetchPage(0, this.pageSize, search).subscribe((result) => {
      this.totalRecords = result.totalRecords;
      const sparse: (T | undefined)[] = new Array(this.totalRecords);
      result.items.forEach((item, index) => (sparse[index] = item));
      this.options = sparse;
      this.loading = false;
    });
  }
}
