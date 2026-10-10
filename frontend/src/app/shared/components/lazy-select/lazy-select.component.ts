import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormValueControl } from '@angular/forms/signals';
import { debounceTime, distinctUntilChanged, forkJoin, map, Observable, of, Subject, switchMap } from 'rxjs';

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
 * Valeur exposée au formulaire hôte (`[formField]`) : un identifiant (`dataKey`) en mode simple,
 * un tableau d'identifiants en mode multiple — jamais l'objet complet, pour rester compatible avec
 * les DTO existants (`chantierId`, `fonctionId`, ...) sans aucun changement de contrat.
 *
 * L'affichage et la navigation (clavier, rôles ARIA, panneau flottant) sont ceux de `SelectComponent` ; ce
 * composant ne gère que les données : pages successives chargées au défilement (`loadMore`), recherche
 * côté serveur (debounce de 300 ms) et résolution du libellé des valeurs déjà sélectionnées.
 */
@Component({
  selector: 'app-lazy-select',
  imports: [SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <stp-select
      [(value)]="value"
      [disabled]="disabled()"
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
      (touch)="touch.emit()"
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
export class LazySelectComponent<T extends object = Record<string, unknown>> implements FormValueControl<unknown> {
  readonly value = model<unknown>(null);
  readonly disabled = input(false);
  /** Émis quand l'utilisateur quitte le champ (le formulaire le marque « touché »). */
  readonly touch = output<void>();
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

  private readonly select = viewChild(SelectComponent);
  protected readonly options = signal<SelectOption<Key>[]>([]);
  protected readonly resolved = signal<SelectOption<Key>[]>([]);
  protected readonly loading = signal(false);

  private total = 0;
  private search = '';
  private initialLoadDone = false;
  private readonly filterSubject = new Subject<string>();
  private readonly resolution = new Subject<Key[]>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.filterSubject.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(destroyRef)).subscribe((term) => this.resetAndLoad(term));
    // Une valeur déjà choisie (mode édition, remise à zéro) retrouve son libellé ; la plus récente l'emporte.
    this.resolution
      .pipe(
        switchMap((ids) => (ids.length === 0 ? of([]) : forkJoin(ids.map((id) => this.resolveOne(id))))),
        takeUntilDestroyed(destroyRef)
      )
      .subscribe((options) => this.resolved.set(options));
    effect(() => {
      const value = this.value();
      untracked(() => this.resolution.next((Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]) as Key[]));
    });
    afterNextRender(() => this.ensureInitialLoad());
  }

  /** Donne le focus au champ (premier champ invalide d'un formulaire refusé). */
  focus(options?: FocusOptions): void {
    this.select()?.focus(options);
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
