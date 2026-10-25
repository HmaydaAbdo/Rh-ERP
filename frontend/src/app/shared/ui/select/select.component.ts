import { Combobox, ComboboxPopup, ComboboxWidget } from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

import { normaliser } from '../../text/recherche';
import { IconComponent } from '../icon/icon.component';

/** Une option de sélection : `label` s'affiche, `value` est ce que le formulaire reçoit. */
export interface SelectOption<V = unknown> {
  label: string;
  value: V;
  /** Code court affiché à côté du libellé métier lorsqu'il existe. */
  code?: string;
}

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 }
];

/** Distance (px) au bas de la liste à partir de laquelle `loadMore` est émis. */
const LOAD_MORE_THRESHOLD = 48;
const OPTION_PAGE_SIZE = 40;

/**
 * Liste déroulante Staport : sélection simple ou multiple, filtre à la frappe, bouton d'effacement. Construite sur
 * Angular Aria (`combobox` + `listbox` : rôles ARIA, flèches, Début/Fin, saisie, Échap) et l'overlay du CDK (le panneau n'est
 * jamais rogné par un dialogue ou un conteneur défilant).
 *
 * Contrôle de Signal Forms (`FormValueControl`) : la valeur est `V | null` (simple) ou `V[]` (`multiple`), jamais l'objet d'option.
 *
 * Source distante (voir `LazySelectComponent`) : `externalFilter` laisse le parent filtrer (le composant n'émet que
 * `filterChange`), `loadMore` demande la page suivante quand la liste est défilée jusqu'en bas, `selectedOptions` fournit les
 * libellés des valeurs sélectionnées qui ne sont pas (ou plus) dans `options`.
 */
@Component({
  selector: 'stp-select',
  imports: [Combobox, ComboboxPopup, ComboboxWidget, Listbox, Option, CdkConnectedOverlay, CdkOverlayOrigin, IconComponent],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectComponent<V = unknown> implements FormValueControl<unknown> {
  readonly value = model<unknown>(null);
  readonly disabled = input(false);
  /** Émis quand l'utilisateur quitte le champ (le formulaire le marque « touché »). */
  readonly touch = output<void>();
  readonly options = input<SelectOption<V>[]>([]);
  readonly selectedOptions = input<SelectOption<V>[]>([]);
  readonly multiple = input(false);
  /** `filter` = toutes les valeurs via absence de restriction; `loaded` = toutes les options locales. */
  readonly bulkMode = input<'none' | 'filter' | 'loaded'>('none');
  readonly externalFilter = input(false);
  readonly clearable = input(true);
  readonly loading = input(false);
  readonly placeholder = input('Sélectionner…');
  readonly filterPlaceholder = input('Rechercher…');
  /** Multiple : texte affiché dès `summaryFrom` valeurs, `{0}` étant leur nombre (ex. `{0} chantiers`). */
  readonly summaryLabel = input<string | null>(null);
  readonly summaryFrom = input(2);
  readonly ariaLabel = input<string | null>(null);
  readonly inputId = input<string | null>(null);

  readonly filterChange = output<string>();
  readonly loadMore = output<void>();

  protected readonly expanded = signal(false);
  protected readonly term = signal('');
  protected readonly visibleLimit = signal(OPTION_PAGE_SIZE);
  protected readonly selected = computed<V[]>(() => {
    const value = this.value();
    if (value === null || value === undefined) {
      return [];
    }
    return Array.isArray(value) ? (value as V[]) : [value as V];
  });
  protected readonly toutSelectionne = signal(false);
  protected readonly known = signal(new Map<V, string>());
  protected readonly positions = POSITIONS;
  protected readonly minWidth = signal(0);
  private readonly listbox = viewChild(Listbox);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly shown = computed(() => {
    const term = normaliser(this.term().trim());
    if (this.externalFilter()) {
      return this.options();
    }
    const filtered = term === '' ? this.options() : this.options().filter((option) => normaliser(`${option.code ?? ''} ${option.label}`).includes(term));
    return filtered.slice(0, this.visibleLimit());
  });

  /** Texte du champ fermé : libellé choisi, ou résumé à partir de deux valeurs en sélection multiple. */
  protected readonly display = computed(() => {
    const values = this.selected();
    if (values.length === 0) {
      return this.toutSelectionne() ? 'Tous' : '';
    }
    if (this.multiple() && values.length >= this.summaryFrom()) {
      const summary = this.summaryLabel();
      return summary ? summary.replace('{0}', String(values.length)) : `${values.length} sélectionnés`;
    }
    return this.known().get(values[0]) ?? '';
  });

  /** Le champ affiche la saisie pendant qu'on cherche, la sélection sinon. */
  protected readonly text = computed(() => (this.expanded() ? this.term() : this.display()));
  protected readonly canClear = computed(() => this.clearable() && !this.disabled() && (this.selected().length > 0 || this.toutSelectionne()));

  constructor() {
    // Retient les libellés de tout ce qui a été vu : une valeur choisie garde son libellé quand la liste filtrée ne la contient plus.
    effect(() => {
      const next = new Map(untracked(this.known));
      [...this.options(), ...this.selectedOptions()].forEach((option) => next.set(option.value, option.code ? `${option.code} · ${option.label}` : option.label));
      this.known.set(next);
    });
    effect(() => {
      if (this.expanded()) {
        this.minWidth.set(this.host.nativeElement.offsetWidth);
      } else {
        this.term.set('');
      }
    });
  }

  /** Donne le focus au champ (premier champ invalide d'un formulaire refusé). */
  focus(options?: FocusOptions): void {
    this.field()?.nativeElement.focus(options);
  }

  /**
   * La liste est toujours recherchable : le clic ouvre la saisie et le panneau; Échap, le choix d'une option ou un clic
   * à l'extérieur ferment la liste.
   */
  protected toggle(): void {
    if (this.disabled()) {
      return;
    }
    this.expanded.set(true);
  }

  protected onType(text: string): void {
    if (!this.expanded()) {
      return;
    }
    this.term.set(text);
    this.visibleLimit.set(OPTION_PAGE_SIZE);
    this.filterChange.emit(text);
  }

  /** Le combobox déplace le descendant actif ; on le garde visible après la mise à jour d'Angular Aria. */
  protected onComboboxKeydown(): void {
    requestAnimationFrame(() => {
      const activeId = this.listbox()?.activeDescendant();
      if (activeId) {
        this.host.nativeElement.ownerDocument.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  protected onSelection(values: V[]): void {
    this.toutSelectionne.set(false);
    if (this.multiple()) {
      // Le listbox ne connaît que les options affichées : une valeur déjà choisie qui n'y figure pas (autre page d'une source
      // distante, ou écartée par le filtre) lui échappe et ne doit pas être perdue pour autant.
      const affichees = new Set(this.shown().map((option) => option.value));
      const avant = this.selected();
      const conservees = avant.filter((value) => !affichees.has(value) || values.includes(value));
      this.commit([...conservees, ...values.filter((value) => !avant.includes(value))]);
      return;
    }
    // En simple, le listbox garde la valeur précédente cochée : on retient la dernière choisie.
    const chosen = values.filter((value) => !this.selected().includes(value));
    this.commit(chosen.length > 0 ? [chosen[chosen.length - 1]] : values.slice(-1));
    this.expanded.set(false);
    queueMicrotask(() => this.expanded.set(false));
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.commit([]);
    this.toutSelectionne.set(false);
    this.term.set('');
    this.visibleLimit.set(OPTION_PAGE_SIZE);
    this.filterChange.emit('');
  }

  protected selectionnerTout(): void {
    this.commit(this.bulkMode() === 'loaded' ? this.options().map((option) => option.value) : []);
    this.toutSelectionne.set(this.bulkMode() === 'filter');
    this.expanded.set(false);
  }

  protected neRienSelectionner(): void {
    this.commit([]);
    this.toutSelectionne.set(false);
    this.expanded.set(false);
  }

  protected onScroll(event: Event): void {
    const list = event.target as HTMLElement;
    if (list.scrollHeight - list.scrollTop - list.clientHeight < LOAD_MORE_THRESHOLD) {
      if (this.externalFilter()) {
        this.loadMore.emit();
      } else if (this.visibleLimit() < this.shown().length || this.shown().length < this.options().length) {
        this.visibleLimit.update((limit) => limit + OPTION_PAGE_SIZE);
      }
    }
  }

  protected onOutsideClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.expanded.set(false);
      this.touch.emit();
    }
  }

  protected onBlur(): void {
    if (!this.expanded()) {
      this.touch.emit();
    }
  }

  private commit(values: V[]): void {
    this.value.set(this.multiple() ? values : (values[0] ?? null));
  }
}
