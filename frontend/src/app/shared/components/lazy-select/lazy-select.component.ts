import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, forwardRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, forkJoin, map, Observable, of, Subject } from 'rxjs';

import { SelectComponent, SelectOption } from '../../ui/select/select.component';
import { LazySelectSource } from './lazy-select.model';

type Key = number | string;

/** Sélecteur générique recherche + chargement différé (voir `conventions/frontend.md`, section
 * Sélecteurs) — un seul composant pour tout le projet, chaque domaine ne fournit qu'un
 * {@link LazySelectSource} (ex. `ChantierReferenceService`) au lieu de dupliquer la pagination et le
 * debounce de recherche dans chaque formulaire/filtre.
 *
 * `multiple` ne change que la cardinalité de la sélection — jamais la recherche/pagination, communes
 * aux deux. Un champ qui pilote une relation unique d'un enregistrement (ex. le chantier d'un bulletin
 * de paie) reste `multiple=false` : la sélection multiple ne s'applique qu'aux filtres de liste et aux
 * relations réellement multiples (voir la convention).
 *
 * Valeur exposée au formulaire hôte (`formControlName`) : un identifiant (`dataKey`) en mode simple,
 * un tableau d'identifiants en mode multiple — jamais l'objet complet, pour rester compatible avec
 * les DTO existants (`chantierId`, `fonctionId`, ...) sans aucun changement de contrat.
 *
 * L'affichage et la navigation (clavier, rôles ARIA, panneau flottant) sont ceux de `SelectComponent` ; ce
 * composant ne gère que les données : pages successives chargées au défilement (`loadMore`), recherche
 * côté serveur (debounce de 300 ms) et résolution du libellé des valeurs déjà sélectionnées.
 */
@Component({
  selector: 'app-lazy-select',
  imports: [ReactiveFormsModule, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LazySelectComponent), multi: true }],
  template: `
    <stp-select
      [formControl]="control"
      [options]="options()"
      [selectedOptions]="resolved()"
      [multiple]="multiple()"
      [filterable]="true"
      [externalFilter]="true"
      [clearable]="showClear()"
      [loading]="loading()"
      [placeholder]="placeholder()"
      [filterPlaceholder]="filterPlaceholder()"
      [summaryLabel]="summaryLabel()"
      [ariaLabel]="ariaLabel()"
      [inputId]="inputId()"
      (filterChange)="onFilterInput($event)"
      (loadMore)="onLoadMore()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `
})
export class LazySelectComponent<T extends object = Record<string, unknown>> implements ControlValueAccessor {
  readonly source = input.required<LazySelectSource<T>>();
  readonly multiple = input(false);
  readonly optionLabel = input('label');
  readonly dataKey = input('id');
  readonly placeholder = input('Sélectionner…');
  readonly filterPlaceholder = input('Rechercher…');
  readonly pageSize = input(30);
  readonly showClear = input(true);
  /** Identifiant du champ interactif : le `<label for>` d'un formulaire s'y accroche. */
  readonly inputId = input<string | null>(null);
  /** Nom accessible du champ quand son placeholder disparaît (valeur choisie) — utile dans une barre d'outils sans libellé visible. */
  readonly ariaLabel = input<string | null>(null);
  /** Sélection multiple compacte, sur une seule ligne : la valeur choisie s'affiche seule, puis ce texte à partir de deux
   * valeurs (`{0}` = leur nombre, ex. `{0} chantiers`). */
  readonly summaryLabel = input<string | null>(null);

  protected readonly control = new FormControl<Key | Key[] | null>(null);
  protected readonly options = signal<SelectOption<Key>[]>([]);
  protected readonly resolved = signal<SelectOption<Key>[]>([]);
  protected readonly loading = signal(false);

  private total = 0;
  private search = '';
  private initialLoadDone = false;
  private readonly filterSubject = new Subject<string>();
  private onChange: (value: unknown) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.filterSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(destroyRef)).subscribe((term) => this.resetAndLoad(term));
    this.control.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((value) => {
      this.onChange(value);
      this.onTouched();
    });
    afterNextRender(() => this.ensureInitialLoad());
  }

  protected onFilterInput(term: string): void {
    this.filterSubject.next(term ?? '');
  }

  protected onLoadMore(): void {
    this.ensureInitialLoad();
    const loaded = this.options().length;
    if (this.loading() || loaded >= this.total) {
      return;
    }
    this.fetchPage(Math.floor(loaded / this.pageSize()), false);
  }

  writeValue(value: unknown): void {
    this.control.setValue((value ?? null) as Key | Key[] | null, { emitEvent: false });
    const ids = (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]) as Key[];
    if (ids.length === 0) {
      this.resolved.set([]);
      return;
    }
    forkJoin(ids.map((id) => this.resolveOne(id))).subscribe((options) => this.resolved.set(options));
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.control.disable({ emitEvent: false });
    } else {
      this.control.enable({ emitEvent: false });
    }
  }

  /** Réutilise l'option déjà chargée (évite un aller-retour réseau) — sinon résout l'identifiant individuellement
   * (voir {@link LazySelectSource.fetchById}), pour afficher le libellé d'une valeur déjà sélectionnée (mode édition)
   * même si elle n'est pas dans la première page de résultats. */
  private resolveOne(id: Key): Observable<SelectOption<Key>> {
    const loaded = this.options().find((option) => option.value === id);
    return loaded ? of(loaded) : this.source().fetchById(id).pipe(map((item) => this.toOption(item)));
  }

  private toOption(item: T): SelectOption<Key> {
    const record = item as Record<string, unknown>;
    return { label: String(record[this.optionLabel()] ?? ''), value: record[this.dataKey()] as Key };
  }

  private ensureInitialLoad(): void {
    if (this.initialLoadDone) {
      return;
    }
    this.initialLoadDone = true;
    this.resetAndLoad('');
  }

  private resetAndLoad(search: string): void {
    this.search = search;
    this.fetchPage(0, true);
  }

  private fetchPage(page: number, reset: boolean): void {
    this.loading.set(true);
    const search = this.search;
    this.source()
      .fetchPage(page, this.pageSize(), search)
      .subscribe((result) => {
        if (search !== this.search) {
          return; // une recherche plus récente a pris le relais
        }
        this.total = result.totalRecords;
        const loaded = result.items.map((item) => this.toOption(item));
        this.options.update((current) => (reset ? loaded : [...current, ...loaded]));
        this.loading.set(false);
      });
  }
}
