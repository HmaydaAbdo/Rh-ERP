import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, linkedSignal, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { BehaviorSubject, catchError, distinctUntilChanged, of, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { LazySelectInMemorySource } from '../../../shared/components/lazy-select/lazy-select-in-memory.source';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { LazySelectSource } from '../../../shared/components/lazy-select/lazy-select.model';
import { MonthPickerComponent } from '../../../shared/components/month-picker/month-picker.component';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReference } from '../../../shared/reference-data/equipe-reference.model';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { PaieChantierPeriode } from '../models/paie.model';
import { libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { AUCUN_FILTRE, memesFiltres, PaieFiltres } from './paie-filtres';

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
  imports: [FormField, FormRoot, CdkConnectedOverlay, CdkOverlayOrigin, MonthPickerComponent, LazySelectComponent, IconComponent, ButtonComponent],
  templateUrl: './paie-filtres.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-filtres.component.scss'
})
export class PaieFiltresComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);

  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly equipeReferenceService = inject(EquipeReferenceService);

  /** Un sélecteur appelle la route de recherche de son référentiel : sans la permission de lecture correspondante, il
   * recevrait un refus (403) à chaque ouverture — il n'est donc pas proposé (conventions/security.md, « Journal de sécurité »). */
  protected readonly peutChoisirChantiers = computed(() => this.authService.hasPermission('CHANTIER_READ'));
  protected readonly peutChoisirEquipes = computed(() => this.authService.hasPermission('EQUIPE_READ'));
  protected readonly peutChoisirFonctions = computed(() => this.authService.hasPermission('FUNCTION_READ'));

  /** Mois qui contiennent de la paie, du plus récent au plus ancien. */
  readonly periodes = input<string[]>([]);
  /** Vrai en analytique : un mois est indispensable, on ne propose donc pas de l'effacer. */
  readonly moisRequis = input(false);
  /** Vrai dans les Cartes : affiche le fil de navigation sous la barre. */
  readonly avecFil = input(false);
  /** Les filtres affichés : ils viennent de la page (l'URL), le composant les émet à chaque changement (`valueChange`). */
  readonly value = input<PaieFiltres>(AUCUN_FILTRE);
  readonly valueChange = output<PaieFiltres>();

  protected readonly disponibles = computed(() => this.periodes());
  protected readonly moisObligatoire = computed(() => this.moisRequis());
  protected readonly fil = computed(() => this.avecFil());
  /** Les filtres courants : ceux de la page, tant que l'utilisateur n'en a pas changé un. */
  protected readonly courant = linkedSignal<PaieFiltres>(() => this.value());
  protected readonly panneauMoisOuvert = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
  ];
  /** Téléphone : le CIN et les trois sélecteurs se replient derrière le bouton « Filtres » ; ailleurs la barre est toujours entière. */
  protected readonly secondairesOuverts = signal(false);

  /** Les chantiers du mois choisi, avec leurs équipes : de quoi restreindre les choix de la cascade. */
  private readonly chantiersDuMois = signal<PaieChantierPeriode[]>([]);
  private readonly periodeSuivie = new BehaviorSubject<string | null>(null);
  private readonly cacheChantiersDuMois = new Map<string, PaieChantierPeriode[]>();
  /** Les derniers filtres émis : un changement des filtres courants identique à celui-ci n'est pas à ré-émettre. */
  private dernierEmis: PaieFiltres = AUCUN_FILTRE;

  /** Le formulaire édite directement les filtres courants : une saisie de texte n'y arrive qu'après un court délai. */
  protected readonly formulaire = form(this.courant, (chemin) => {
    debounce(chemin.nomPrenom, DEBOUNCE_FILTRES_MS);
    debounce(chemin.cin, DEBOUNCE_FILTRES_MS);
  });

  protected readonly periode = computed(() => this.courant().periode);
  protected readonly libelle = computed(() => libellePeriode(this.periode()) || (this.moisObligatoire() ? 'Choisir un mois' : 'Tous les mois'));
  protected readonly plusRecent = computed(() => this.voisin(-1));
  protected readonly plusAncien = computed(() => this.voisin(1));

  protected readonly aDesFiltres = computed(() => {
    const f = this.courant();
    return this.periode() !== null || f.chantierIds.length + f.equipeIds.length + f.fonctionIds.length > 0 || this.nomOuCinSaisi(f);
  });

  /** Filtres du panneau replié (CIN, chantiers, équipes, fonctions) : le « n » du bouton « Filtres ». */
  protected readonly nombreSecondaires = computed(() => {
    const f = this.courant();
    return (f.cin.trim() ? 1 : 0) + (f.chantierIds.length > 0 ? 1 : 0) + (f.equipeIds.length > 0 ? 1 : 0) + (f.fonctionIds.length > 0 ? 1 : 0);
  });

  /** Chantier du fil de navigation (niveau 3 des Cartes), nommé d'après les chantiers du mois. */
  protected readonly chantierOuvert = computed(() => {
    const ids = this.courant().chantierIds;
    if (ids.length !== 1) {
      return null;
    }
    const trouve = this.chantiersDuMois().find((c) => c.id === ids[0]);
    return trouve?.code ?? `n° ${ids[0]}`;
  });

  /** Les sources sont dans un tableau d'un élément pour que `@for … track` recrée le sélecteur quand la source change. */
  protected readonly sourcesChantiers = computed<LazySelectSource<ChantierReference>[]>(() => {
    const chantiers = this.chantiersDuMois();
    if (!this.periode() || chantiers.length === 0) {
      return [this.chantierReferenceService];
    }
    const liste = chantiers
      .map((c) => ({ id: c.id, code: c.code, designation: c.libelle ?? '', actif: true }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return [new LazySelectInMemorySource(liste, (c) => `${c.code} ${c.designation}`, this.chantierReferenceService)];
  });

  protected readonly sourcesEquipes = computed<LazySelectSource<EquipeReference>[]>(() => {
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

  constructor() {
    effect(() => {
      const filtres = this.value();
      untracked(() => {
        this.dernierEmis = filtres;
        this.periodeSuivie.next(filtres.periode);
      });
    });

    // Un champ modifié par l'utilisateur change les filtres courants : la page en est prévenue.
    effect(() => {
      const filtres = this.courant();
      untracked(() => {
        if (!memesFiltres(filtres, this.dernierEmis) && !memesFiltres(filtres, this.value())) {
          this.emettreFiltres(filtres);
        }
      });
    });

    this.periodeSuivie
      .pipe(
        distinctUntilChanged(),
        switchMap((periode) => this.chargerChantiersDuMois(periode)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((chantiers) => this.chantiersDuMois.set(chantiers));
  }

  /** Choisit un mois ; `null` revient à « tous les mois ». Les choix qui dépendaient de l'ancien mois restent : on les voit. */
  protected choisir(periode: string | null): void {
    this.emettreFiltres({ ...this.courant(), periode });
  }

  protected basculerSecondaires(): void {
    this.secondairesOuverts.update((ouverts) => !ouverts);
  }

  /** Fil de navigation (Cartes) : revient au niveau demandé, 1 = tous les mois, 2 = chantiers du mois. */
  protected allerAuNiveau(niveau: 1 | 2): void {
    const f = this.courant();
    this.emettreFiltres(niveau === 1 ? { ...f, periode: null, chantierIds: [] } : { ...f, chantierIds: [] });
  }

  /** Un pas en arrière dans le fil de navigation : d'abord le chantier, puis le mois. */
  protected remonter(): void {
    const f = this.courant();
    this.emettreFiltres(f.chantierIds.length > 0 ? { ...f, chantierIds: [] } : { ...f, periode: null });
  }

  protected reinitialiser(): void {
    this.emettreFiltres({ ...AUCUN_FILTRE, periode: this.moisObligatoire() ? this.periode() : null });
  }

  protected surToucheMois(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.panneauMoisOuvert.set(false);
    }
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

  private emettreFiltres(filtres: PaieFiltres): void {
    this.dernierEmis = filtres;
    this.courant.set(filtres);
    this.valueChange.emit(filtres);
  }
}
