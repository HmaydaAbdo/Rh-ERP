import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { BehaviorSubject, catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { LazySelectInMemorySource } from '../../../shared/components/lazy-select/lazy-select-in-memory.source';
import { LazySelectSource } from '../../../shared/components/lazy-select/lazy-select.model';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { MonthPickerComponent } from '../../../shared/components/month-picker/month-picker.component';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReference } from '../../../shared/reference-data/equipe-reference.model';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { PaieChantierPeriode } from '../models/paie.model';
import { libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { AUCUN_FILTRE, PaieFiltres } from './paie-filtres';

const DEBOUNCE_FILTRES_MS = 300;

/**
 * Barre de filtres commune aux trois vues de la paie, **identique dans chacune** et **entièrement visible dès l'arrivée** :
 * le mois (flèches vers le mois précédent / suivant qui contient de la paie, grille de mois dans un panneau), la recherche
 * par nom et par CIN, puis les sélecteurs de chantiers, d'équipes et de fonctions — jamais cachés derrière un bouton. Un
 * sélecteur ne montre que quelques valeurs puis un compteur, quel que soit le nombre de valeurs choisies. Dans les Cartes
 * (`avecFil`), un fil de navigation montre la position (mois, chantier) et permet de remonter.
 *
 * **Cascade** : avec un mois, les chantiers proposés sont ceux qui ont de la paie ce mois-là ; avec des chantiers choisis,
 * les équipes proposées sont celles de ces chantiers ce mois-là. Sans mois, les listes complètes du référentiel.
 *
 * Le composant n'a pas d'état propre au-delà de ce qu'il affiche : la valeur vient de l'extérieur (`value`), chaque
 * changement est émis (`valueChange`, les saisies après un court délai) — c'est la page qui décide quoi en faire (ici, la
 * mettre dans l'URL).
 */
@Component({
    selector: 'app-paie-filtres',
    imports: [ReactiveFormsModule, ButtonModule, InputTextModule, OverlayPanelModule, MonthPickerComponent, LazySelectComponent],
    templateUrl: './paie-filtres.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './paie-filtres.component.scss'
})
export class PaieFiltresComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);

  readonly chantierReferenceService = inject(ChantierReferenceService);
  readonly functionReferenceService = inject(FunctionReferenceService);
  readonly equipeReferenceService = inject(EquipeReferenceService);

  /** Un sélecteur appelle la route de recherche de son référentiel : sans la permission de lecture correspondante, il
   * recevrait un refus (403) à chaque ouverture — il n'est donc pas proposé (conventions/security.md, « Journal de sécurité »). */
  get peutChoisirChantiers(): boolean {
    return this.authService.hasPermission('CHANTIER_READ');
  }

  get peutChoisirEquipes(): boolean {
    return this.authService.hasPermission('EQUIPE_READ');
  }

  get peutChoisirFonctions(): boolean {
    return this.authService.hasPermission('FUNCTION_READ');
  }

  readonly disponibles = signal<string[]>([]);
  readonly courant = signal<PaieFiltres>(AUCUN_FILTRE);
  readonly fil = signal(false);
  /** Téléphone : le CIN et les trois sélecteurs se replient derrière le bouton « Filtres » ; ailleurs la barre est toujours entière. */
  readonly secondairesOuverts = signal(false);
  readonly moisObligatoire = signal(false);

  /** Les chantiers du mois choisi, avec leurs équipes : de quoi restreindre les choix de la cascade. */
  private readonly chantiersDuMois = signal<PaieChantierPeriode[]>([]);
  private readonly periodeSuivie = new BehaviorSubject<string | null>(null);
  private readonly cacheChantiersDuMois = new Map<string, PaieChantierPeriode[]>();

  /** Mois qui contiennent de la paie, du plus récent au plus ancien. */
  @Input() set periodes(periodes: string[]) {
    this.disponibles.set(periodes);
  }

  /** Vrai en analytique : un mois est indispensable, on ne propose donc pas de l'effacer. */
  @Input() set moisRequis(requis: boolean) {
    this.moisObligatoire.set(requis);
  }

  /** Vrai dans les Cartes : affiche le fil de navigation sous la barre. */
  @Input() set avecFil(avec: boolean) {
    this.fil.set(avec);
  }

  @Input() set value(filtres: PaieFiltres) {
    this.courant.set(filtres);
    this.periodeSuivie.next(filtres.periode);
    this.synchroniserFormulaire(filtres);
  }

  @Output() readonly valueChange = new EventEmitter<PaieFiltres>();

  readonly formulaire = this.fb.group({
    nomPrenom: [''],
    cin: [''],
    chantierIds: [[] as number[]],
    fonctionIds: [[] as number[]],
    equipeIds: [[] as number[]]
  });

  readonly periode = computed(() => this.courant().periode);
  readonly libelle = computed(() => libellePeriode(this.periode()) || (this.moisObligatoire() ? 'Choisir un mois' : 'Tous les mois'));
  readonly plusRecent = computed(() => this.voisin(-1));
  readonly plusAncien = computed(() => this.voisin(1));

  readonly aDesFiltres = computed(() => {
    const f = this.courant();
    return this.periode() !== null || f.chantierIds.length + f.equipeIds.length + f.fonctionIds.length > 0 || this.nomOuCinSaisi(f);
  });

  /** Filtres du panneau replié (CIN, chantiers, équipes, fonctions) : le « n » du bouton « Filtres ». */
  readonly nombreSecondaires = computed(() => {
    const f = this.courant();
    return (f.cin.trim() ? 1 : 0) + (f.chantierIds.length > 0 ? 1 : 0) + (f.equipeIds.length > 0 ? 1 : 0) + (f.fonctionIds.length > 0 ? 1 : 0);
  });

  /** Chantier du fil de navigation (niveau 3 des Cartes), nommé d'après les chantiers du mois. */
  readonly chantierOuvert = computed(() => {
    const ids = this.courant().chantierIds;
    if (ids.length !== 1) {
      return null;
    }
    const trouve = this.chantiersDuMois().find((c) => c.id === ids[0]);
    return trouve?.code ?? `n° ${ids[0]}`;
  });

  /** Les sources sont dans un tableau d'un élément pour que `@for … track` recrée le sélecteur quand la source change. */
  readonly sourcesChantiers = computed<LazySelectSource<ChantierReference>[]>(() => {
    const chantiers = this.chantiersDuMois();
    if (!this.periode() || chantiers.length === 0) {
      return [this.chantierReferenceService];
    }
    const liste = chantiers
      .map((c) => ({ id: c.id, code: c.code, designation: c.libelle ?? '', actif: true }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return [new LazySelectInMemorySource(liste, (c) => `${c.code} ${c.designation}`, this.chantierReferenceService)];
  });

  readonly sourcesEquipes = computed<LazySelectSource<EquipeReference>[]>(() => {
    const { periode, chantierIds } = this.courant();
    const chantiers = this.chantiersDuMois();
    if (!periode || chantierIds.length === 0 || chantiers.length === 0) {
      return [this.equipeReferenceService];
    }
    const equipes = new Map<number, EquipeReference>();
    chantiers
      .filter((c) => chantierIds.includes(c.id))
      .forEach((c) => c.equipes.forEach((e) => equipes.set(e.id, { id: e.id, code: e.code, libelle: e.libelle })));
    if (equipes.size === 0) {
      return [this.equipeReferenceService];
    }
    const liste = [...equipes.values()].sort((a, b) => a.code.localeCompare(b.code));
    return [new LazySelectInMemorySource(liste, (e) => `${e.code} ${e.libelle}`, this.equipeReferenceService)];
  });

  ngOnInit(): void {
    this.formulaire.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.courant.set(this.depuisFormulaire()));
    this.formulaire.valueChanges.pipe(debounceTime(DEBOUNCE_FILTRES_MS), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.emettre());

    this.periodeSuivie
      .pipe(
        distinctUntilChanged(),
        switchMap((periode) => this.chargerChantiersDuMois(periode)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((chantiers) => this.chantiersDuMois.set(chantiers));
  }

  /** Choisit un mois ; `null` revient à « tous les mois ». Les choix qui dépendaient de l'ancien mois restent : on les voit. */
  choisir(periode: string | null): void {
    this.emettreFiltres({ ...this.courant(), periode });
  }

  basculerSecondaires(): void {
    this.secondairesOuverts.update((ouverts) => !ouverts);
  }

  /** Fil de navigation (Cartes) : revient au niveau demandé, 1 = tous les mois, 2 = chantiers du mois. */
  allerAuNiveau(niveau: 1 | 2): void {
    const f = this.courant();
    this.emettreFiltres(niveau === 1 ? { ...f, periode: null, chantierIds: [] } : { ...f, chantierIds: [] });
  }

  /** Un pas en arrière dans le fil de navigation : d'abord le chantier, puis le mois. */
  remonter(): void {
    const f = this.courant();
    this.emettreFiltres(f.chantierIds.length > 0 ? { ...f, chantierIds: [] } : { ...f, periode: null });
  }

  reinitialiser(): void {
    this.emettreFiltres({ ...AUCUN_FILTRE, periode: this.moisObligatoire() ? this.periode() : null });
  }

  private chargerChantiersDuMois(periode: string | null) {
    if (!periode) {
      return of<PaieChantierPeriode[]>([]);
    }
    const enCache = this.cacheChantiersDuMois.get(periode);
    if (enCache) {
      return of(enCache);
    }
    return this.paieService.rechercherChantiers({ periode }).pipe(
      tap((chantiers) => this.cacheChantiersDuMois.set(periode, chantiers)),
      catchError(() => of<PaieChantierPeriode[]>([]))
    );
  }

  /** Le mois contigu dans la liste des mois disponibles (`decalage` 1 : plus ancien, -1 : plus récent), ou `null`. */
  private voisin(decalage: number): string | null {
    const periodes = this.disponibles();
    const indice = periodes.indexOf(this.periode() ?? '');
    return indice < 0 ? null : (periodes[indice + decalage] ?? null);
  }

  private nomOuCinSaisi(filtres: PaieFiltres): boolean {
    return Boolean(filtres.nomPrenom.trim()) || Boolean(filtres.cin.trim());
  }

  /** Ne touche pas au formulaire quand il montre déjà ces valeurs : chaque réécriture relance la résolution des libellés choisis. */
  private synchroniserFormulaire(filtres: PaieFiltres): void {
    const actuel = this.formulaire.getRawValue();
    const memes =
      actuel.nomPrenom === filtres.nomPrenom &&
      actuel.cin === filtres.cin &&
      JSON.stringify(actuel.chantierIds) === JSON.stringify(filtres.chantierIds) &&
      JSON.stringify(actuel.fonctionIds) === JSON.stringify(filtres.fonctionIds) &&
      JSON.stringify(actuel.equipeIds) === JSON.stringify(filtres.equipeIds);
    if (!memes) {
      this.formulaire.patchValue(
        {
          nomPrenom: filtres.nomPrenom,
          cin: filtres.cin,
          chantierIds: filtres.chantierIds,
          fonctionIds: filtres.fonctionIds,
          equipeIds: filtres.equipeIds
        },
        { emitEvent: false }
      );
    }
  }

  private depuisFormulaire(): PaieFiltres {
    const valeur = this.formulaire.getRawValue();
    return {
      periode: this.periode(),
      nomPrenom: valeur.nomPrenom ?? '',
      cin: valeur.cin ?? '',
      chantierIds: valeur.chantierIds ?? [],
      fonctionIds: valeur.fonctionIds ?? [],
      equipeIds: valeur.equipeIds ?? []
    };
  }

  private emettre(): void {
    this.emettreFiltres(this.depuisFormulaire());
  }

  private emettreFiltres(filtres: PaieFiltres): void {
    this.courant.set(filtres);
    this.synchroniserFormulaire(filtres);
    this.valueChange.emit(filtres);
  }
}
