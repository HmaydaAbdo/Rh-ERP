import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, contentChild, DestroyRef, inject, input, signal, TemplateRef } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, distinctUntilChanged, forkJoin, map, Observable, of, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';
import { PdfExportButtonComponent } from '../../../shared/components/pdf-export-button/pdf-export-button.component';
import { PdfImpressionDocument } from '../../../shared/services/pdf-impression.service';
import { Employee } from '../../employee/models/employee.model';
import { libelleStatutEmploye } from '../../employee/models/employee-statut';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaiePeriodeResume } from '../../paie/models/paie.model';
import { formaterMontant, libellePeriode, periodePrecedente } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import {
  cleIds, DIMENSIONS, Dimension, etapeChoisie, LIBELLES_DIMENSIONS, LIBELLES_PLURIELS, lirePerimetre, Niveau, niveauAffiche,
  Portee, porteeDe, porteeVide, versParametresPerimetre
} from '../perimetre';
import { fusionnerGroupes, GroupeCarte, lignesPaie, nomGroupe, variations } from '../perimetre-groupes';
import { chargerToutLeReferentiel, ItemCatalogue, ModulePerimetre } from '../perimetre-module';

const TAILLE_PAGE = 24;

/** Le contexte d'une carte, donné au gabarit `#actionsCarte` d'un module qui veut y ajouter ses propres boutons (ex. la suppression en groupe de la paie). */
export interface ContexteCarte {
  $implicit: GroupeCarte;
  niveau: Niveau;
  /** Le mois affiché (`null` au niveau des mois). */
  periode: string | null;
  /** Le périmètre dans lequel la carte a été calculée, sans la restriction propre à la carte. */
  portee: Portee;
}

interface Chargement {
  groupes: GroupeCarte[] | null;
  employes: Employee[];
  totalEmployes: number;
  portee: Portee;
}

/**
 * Vues Cartes des modules (lecture seule) — **parcours guidé** selon l'ordre défini par le domaine, jusqu'aux fiches des employés.
 * Ouvrir une carte en fait une étape du fil ; chaque étape se retire seule. Chaque carte réunit les fiches Employé (dernier état
 * importé) et la paie du mois choisi, avec la variation de la masse par rapport au mois contigu ; une source n'est lue qu'avec son
 * droit (`EMPLOYEE_READ`, `PAIE_READ`). Tout vit dans l'URL (voir `perimetre.ts`). Le composant ne connaît aucun module : il lit
 * la description `ModulePerimetre` qu'on lui donne.
 */
@Component({
  selector: 'app-cartes-perimetre',
  imports: [DecimalPipe, NgTemplateOutlet, RouterLink, BadgeComponent, ButtonComponent, IconComponent, SelectComponent, PdfExportButtonComponent],
  templateUrl: './cartes-perimetre.component.html',
  styleUrl: './cartes-perimetre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartesPerimetreComponent {
  readonly module = input.required<ModulePerimetre>();
  /** Boutons propres au module, ajoutés au pied de chaque carte. */
  protected readonly actionsCarte = contentChild<TemplateRef<ContexteCarte>>('actionsCarte');

  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly chantiers = inject(ChantierReferenceService);
  private readonly equipes = inject(EquipeReferenceService);
  private readonly fonctions = inject(FunctionReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dimensions = DIMENSIONS;
  protected readonly libelles = LIBELLES_DIMENSIONS;
  protected readonly libellePeriode = libellePeriode;
  protected readonly formaterMontant = formaterMontant;
  protected readonly nomGroupe = nomGroupe;
  protected readonly libelleStatutEmploye = libelleStatutEmploye;

  /** Compare chaque indicateur au mois contigu et conserve son unité de lecture. */
  protected variationPaie(groupe: GroupeCarte, indicateur: keyof NonNullable<GroupeCarte['paie']>, periode: string): string {
    const valeur = variations(groupe)?.[indicateur];
    if (valeur === undefined) {
      return 'Comparaison indisponible';
    }
    const contexte = ` · vs ${libellePeriode(periodePrecedente(periode))}`;
    if (valeur === null) {
      return `Base précédente nulle${contexte}`;
    }
    return `${valeur}${contexte}`;
  }

  protected readonly voitEmployes = computed(() => this.authService.hasPermission('EMPLOYEE_READ'));
  protected readonly voitPaie = computed(() => this.authService.hasPermission('PAIE_READ'));
  private readonly fichesDansCartes = computed(() => this.voitEmployes() && !this.module().sansEffectifFichesDansCartes);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly perimetre = computed(() => lirePerimetre(this.params()));

  /** Mois de paie du module, du plus récent au plus ancien (avec `PAIE_READ`). */
  protected readonly mois = signal<string[]>([]);
  protected readonly optionsPeriodes = computed<SelectOption<string>[]>(() => this.mois().map((periode) => ({ value: periode, label: libellePeriode(periode) })));
  /** Le mois affiché : celui de l'URL, à défaut le plus récent (sauf module Paie, où « aucun mois » est la liste des mois). */
  protected readonly periode = computed(() => {
    if (!this.voitPaie()) {
      return null;
    }
    if (this.module().periodePaieRecenteFixe) {
      return this.mois()[0] ?? null;
    }
    return this.perimetre().periode ?? (this.module().niveauPeriode ? null : (this.mois()[0] ?? null));
  });

  protected readonly niveau = computed<Niveau>(() =>
    niveauAffiche(this.perimetre(), this.module().ordre, !!this.module().niveauPeriode && this.voitPaie(), this.fichesDansCartes())
  );
  protected readonly progression = computed(() => {
    const niveau = this.niveau();
    const decalageMois = this.module().niveauPeriode ? 1 : 0;
    const total = this.module().ordre.length + (this.fichesDansCartes() ? 1 : 0) + decalageMois;
    if (niveau === 'PERIODE') return { libelle: 'Mois', etape: 1, total };
    if (niveau === 'EMPLOYES') return { libelle: 'Employés', etape: this.module().ordre.length + decalageMois + 1, total };
    return { libelle: LIBELLES_DIMENSIONS[niveau], etape: this.module().ordre.indexOf(niveau) + decalageMois + 1, total };
  });
  /** Les étapes du fil : chaque dimension choisie, dans l'ordre du module. */
  protected readonly etapes = computed(() =>
    this.module().ordre
      .filter((dimension) => etapeChoisie(this.perimetre(), dimension) !== null)
      .map((dimension) => ({ dimension, id: etapeChoisie(this.perimetre(), dimension)! }))
  );

  protected readonly resultat = signal<Chargement>({ groupes: null, employes: [], totalEmployes: 0, portee: {} });
  /** Incrémentée pour recharger le niveau affiché sans changer d'URL (après une suppression, par exemple). */
  private readonly version = signal(0);
  protected readonly chargement = signal(false);
  protected readonly visibles = signal(TAILLE_PAGE);
  private page = 0;

  /** Libellés des étapes du fil (« C168 », « Équipe OP »…), chargés une fois par valeur. */
  protected readonly noms = signal<Record<string, string>>({});

  protected readonly groupes = computed(() => this.resultat().groupes);
  protected readonly groupesVisibles = computed(() => (this.groupes() ?? []).slice(0, this.visibles()));
  protected readonly totaux = computed(() => {
    const liste = this.groupes() ?? [];
    return {
      fiches: liste.reduce((somme, g) => somme + (g.fiches?.effectif ?? 0), 0),
      payes: liste.reduce((somme, g) => somme + (g.paie?.effectif ?? 0), 0),
      masse: liste.reduce((somme, g) => somme + (g.paie?.masse ?? 0), 0)
    };
  });
  protected readonly aucuneSource = computed(() => !this.voitEmployes() && !this.voitPaie());
  protected readonly documentGroupes = computed<PdfImpressionDocument>(() => {
    const groupes = this.groupes() ?? [];
    const avecFiches = !this.module().sansEffectifFichesDansCartes;
    const colonnes = ['Groupe', 'Statut', ...(avecFiches ? ['Employés', 'En poste'] : []), 'Payés', 'Masse (DH)', 'STC', 'Montant STC (DH)'];
    return {
      titre: `Cartes · ${this.module().libellePluriel}`,
      contexte: `${LIBELLES_DIMENSIONS[this.niveau() as Dimension] ?? this.niveau()} · ${this.periode() ? libellePeriode(this.periode()!) : 'toutes périodes'}`,
      colonnes,
      lignes: groupes.map((groupe) => [
        this.titre(groupe), groupe.statut?.libelle ?? '',
        ...(avecFiches ? [groupe.fiches?.effectif ?? '', groupe.fiches?.actifs ?? ''] : []),
        groupe.paie?.effectif ?? '', groupe.paie?.masse ?? '', groupe.paie?.stc ?? '', groupe.paie?.stcMontant ?? ''
      ])
    };
  });
  protected documentCarte(groupe: GroupeCarte): PdfImpressionDocument {
    const periode = this.moisDe(groupe);
    const avecFiches = !this.module().sansEffectifFichesDansCartes;
    return {
      titre: this.titre(groupe),
      contexte: `${LIBELLES_DIMENSIONS[this.niveau() as Dimension] ?? this.niveau()}${periode ? ` · ${libellePeriode(periode)}` : ''}`,
      colonnes: ['Groupe', 'Statut', ...(avecFiches ? ['Employés', 'En poste'] : []), 'Payés', 'Masse (DH)', 'STC', 'Montant STC (DH)'],
      lignes: [[
        this.titre(groupe), groupe.statut?.libelle ?? '', ...(avecFiches ? [groupe.fiches?.effectif ?? '', groupe.fiches?.actifs ?? ''] : []),
        groupe.paie?.effectif ?? '', groupe.paie?.masse ?? '', groupe.paie?.stc ?? '', groupe.paie?.stcMontant ?? ''
      ]]
    };
  }
  protected readonly documentEmployesVide: PdfImpressionDocument = { titre: 'Employés', colonnes: [], lignes: [] };
  protected readonly chargerExportEmployes = () => {
    const params = this.params();
    const portee = this.porteeCourante();
    return chargerToutLeReferentiel((page, taille) => this.employeeService.search(
      this.module().critereEmployes(params, portee), { page, size: taille, sort: 'nomPrenom,asc' }
    )).pipe(map((employes) => ({
      titre: 'Employés',
      contexte: `${this.module().libellePluriel} · ${this.periode() ? libellePeriode(this.periode()!) : 'périmètre courant'}`,
      colonnes: ['Nom et prénom', 'CIN', 'Fonction', 'Chantier', 'Équipe', 'Statut'],
      lignes: employes.map((e) => [e.nomPrenom, e.cin, e.fonction.libelle, e.chantier?.code ?? 'Sans chantier', e.equipe?.libelle ?? '', libelleStatutEmploye(e.statut)])
    })));
  };

  /** Les paramètres de la vue Tabulaire du module : ses filtres propres, sans les étapes du périmètre. */
  protected readonly parametresListe = computed<Params>(() => this.module().parametresListe(this.params()));
  /** Les employés du même périmètre dans leur vue Tabulaire. */
  protected readonly parametresEmployes = computed<Params>(() => {
    const { periode: _periode, ...ids } = versParametresPerimetre(this.perimetre());
    return ids;
  });

  constructor() {
    if (this.voitPaie()) {
      this.paieService.listerPeriodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((periodes) => this.mois.set(periodes.map((p) => p.periode)));
    }
    const requete = computed(() => ({ params: this.params(), niveau: this.niveau(), periode: this.periode(), periodes: this.mois(), module: this.module(), version: this.version() }));
    toObservable(requete)
      .pipe(
        distinctUntilChanged((a, b) => a.module === b.module && a.niveau === b.niveau && a.periode === b.periode && a.periodes === b.periodes && a.version === b.version && a.params.keys.length === b.params.keys.length && a.params.keys.every((k) => a.params.get(k) === b.params.get(k))),
        switchMap((r) => {
          this.chargement.set(true);
          this.visibles.set(TAILLE_PAGE);
          this.nommerEtapes();
          return this.charger(r.niveau, r.periode).pipe(catchError(() => of<Chargement>({ groupes: [], employes: [], totalEmployes: 0, portee: {} })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((resultat) => {
        this.chargement.set(false);
        this.resultat.set(resultat);
      });
  }

  /** Recharge le niveau affiché sans changer d'URL (le module Paie s'en sert après une suppression en groupe). */
  recharger(): void {
    this.version.update((n) => n + 1);
  }

  /** Ouvrir un groupe : il devient une étape du fil, et l'on descend à la dimension suivante. Ouvrir un mois le choisit. */
  protected ouvrir(groupe: GroupeCarte): void {
    if (this.niveau() === 'PERIODE') {
      this.naviguer({ periode: groupe.code, par: null });
      return;
    }
    const niveau = this.niveau() as Dimension;
    this.noms.update((noms) => ({ ...noms, [`${niveau}-${groupe.id}`]: nomGroupe(niveau, groupe) }));
    this.naviguer({ [cleIds(niveau)]: String(groupe.id), par: null });
  }

  protected retirer(dimension: Dimension): void {
    this.naviguer({ [cleIds(dimension)]: null, par: null });
  }

  protected retirerPeriode(): void {
    this.naviguer({ periode: null, par: null });
  }

  protected toutRetirer(): void {
    this.naviguer({ chantierIds: null, equipeIds: null, fonctionIds: null, periode: this.module().niveauPeriode ? null : this.perimetre().periode, par: null });
  }

  protected changerPeriode(value: unknown): void {
    this.naviguer({ periode: typeof value === 'string' && value ? value : null });
  }

  /** Vers l'Analytique du module : mêmes filtres, avec ce groupe pour périmètre. */
  protected parametresAnalytique(groupe: GroupeCarte): Params {
    return this.niveau() === 'PERIODE' ? { periode: groupe.code, par: null } : { [cleIds(this.niveau() as Dimension)]: String(groupe.id), par: null };
  }

  protected nom(dimension: Dimension, id: number): string {
    return this.noms()[`${dimension}-${id}`] ?? (dimension === 'EQUIPE' && id === 0 ? 'Sans équipe' : `${LIBELLES_DIMENSIONS[dimension]} choisi`);
  }

  protected pluriel(niveau: Niveau): string {
    return niveau === 'PERIODE' ? 'mois' : niveau === 'EMPLOYES' ? 'employés' : LIBELLES_PLURIELS[niveau];
  }

  /** Le titre d'une carte : le mois en toutes lettres au niveau des mois, sinon le nom du groupe. */
  protected titre(groupe: GroupeCarte): string {
    return this.niveau() === 'PERIODE' ? groupe.libelle : nomGroupe(this.niveau() as Dimension, groupe);
  }

  /** Le mois que décrivent les chiffres de paie d'une carte : le sien au niveau des mois, sinon le mois affiché. */
  protected moisDe(groupe: GroupeCarte): string | null {
    return this.niveau() === 'PERIODE' ? groupe.code : this.periode();
  }

  protected afficherPlus(): void {
    this.visibles.update((n) => n + TAILLE_PAGE);
  }

  protected afficherPlusEmployes(): void {
    this.page++;
    const portee = this.porteeCourante();
    this.employeeService
      .search(this.module().critereEmployes(this.params(), portee), { page: this.page, size: TAILLE_PAGE, sort: 'nomPrenom,asc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((page) => this.resultat.update((r) => ({ ...r, employes: [...r.employes, ...page.content] })));
  }

  protected initiales(employe: Employee): string {
    return employe.nomPrenom.split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0].toUpperCase()).join('');
  }

  /** La portée sans le référentiel : utile pour les fiches, qui ne dépendent que du périmètre et des filtres propres. */
  private porteeCourante(): Portee {
    return porteeDe(this.perimetre());
  }

  private charger(niveau: Niveau, periode: string | null): Observable<Chargement> {
    const module = this.module();
    const params = this.params();
    const perimetre = this.perimetre();
    const vide: Chargement = { groupes: null, employes: [], totalEmployes: 0, portee: porteeDe(perimetre) };

    if (niveau === 'EMPLOYES') {
      this.page = 0;
      return this.employeeService
        .search(module.critereEmployes(params, porteeDe(perimetre)), { page: 0, size: TAILLE_PAGE, sort: 'nomPrenom,asc' })
        .pipe(map((page) => ({ ...vide, employes: page.content, totalEmployes: page.page.totalElements })));
    }

    if (niveau === 'PERIODE') {
      return this.paieService.rechercherPeriodes(module.criterePaie(params, vide.portee, null)).pipe(
        map((periodes) => ({ ...vide, groupes: this.groupesMois(periodes) }))
      );
    }

    const dimension = niveau as Dimension;
    const catalogue = module.catalogue;
    const autresRestreintes = DIMENSIONS.some((d) => d !== module.dimension && perimetre[cleIds(d)].length > 0);
    // Le référentiel du module est exhaustif au niveau de sa dimension tant qu'aucune autre dimension ne restreint le périmètre.
    const exhaustif = !!catalogue && module.dimension === dimension && !autresRestreintes && etapeChoisie(perimetre, dimension) === null;
    const chargerCatalogue = !!catalogue && (exhaustif || catalogue.filtreActif(params) || module.dimension === dimension);
    const catalogue$: Observable<ItemCatalogue[] | null> = chargerCatalogue ? catalogue!.charger(params) : of(null);

    return catalogue$.pipe(
      switchMap((items) => {
        const portee = this.porteeAvecCatalogue(perimetre, items, catalogue?.filtreActif(params) ?? false, module.dimension);
        if (porteeVide(portee)) {
          return of<Chargement>({ ...vide, portee, groupes: [] });
        }
        // Une source en panne n'efface pas les autres : ses chiffres manquent simplement sur les cartes.
        const fiches$ = this.fichesDansCartes() ? this.employeeService.regrouper(module.critereEmployes(params, portee), dimension).pipe(catchError(() => of(null))) : of(null);
        const paie$ = this.voitPaie() && periode ? this.paieService.analyser(module.criterePaie(params, portee, periode)).pipe(catchError(() => of(null))) : of(null);
        const moisPrecedent = periode ? periodePrecedente(periode) : null;
        const precedente$ = this.voitPaie() && moisPrecedent && this.mois().includes(moisPrecedent)
          ? this.paieService.analyser(module.criterePaie(params, portee, moisPrecedent)).pipe(catchError(() => of(null)))
          : of(null);
        return forkJoin([fiches$, paie$, precedente$]).pipe(
          map(([fiches, paie, precedente]) => ({
            ...vide,
            portee,
            groupes: fusionnerGroupes(dimension, {
              catalogue: items,
              exhaustif,
              fiches,
              paie: paie ? lignesPaie(dimension, paie) : null,
              paiePrecedente: precedente ? lignesPaie(dimension, precedente) : null,
              lien: catalogue && module.dimension === dimension ? (id: number) => catalogue.lien(id) : null
            })
          }))
        );
      })
    );
  }

  /** Les mois de paie du périmètre, du plus récent au plus ancien, chacun comparé au mois contigu quand celui-ci existe. */
  private groupesMois(periodes: PaiePeriodeResume[]): GroupeCarte[] {
    const chiffres = (p: PaiePeriodeResume) => ({ effectif: p.nombreBulletins, masse: p.masse, stc: p.stc, stcMontant: p.stcMontant });
    return [...periodes]
      .sort((a, b) => b.periode.localeCompare(a.periode))
      .map((p) => ({
        id: 0,
        code: p.periode,
        libelle: libellePeriode(p.periode),
        detail: `${p.nombreChantiers} chantier${p.nombreChantiers > 1 ? 's' : ''}`,
        statut: null,
        lien: null,
        fiches: null,
        paie: chiffres(p),
        precedent: (() => {
          const precedent = periodes.find((autre) => autre.periode === periodePrecedente(p.periode));
          return precedent ? chiffres(precedent) : null;
        })()
      }));
  }

  /** La portée d'API : les étapes du périmètre, et les éléments du référentiel quand ses filtres propres le restreignent. */
  private porteeAvecCatalogue(perimetre: ReturnType<typeof lirePerimetre>, items: ItemCatalogue[] | null, filtreActif: boolean, dimension: Dimension | null): Portee {
    const portee = porteeDe(perimetre);
    if (dimension && items && filtreActif && perimetre[cleIds(dimension)].length === 0) {
      portee[cleIds(dimension)] = items.map((item) => item.id);
    }
    return portee;
  }

  private naviguer(parametres: Params): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: parametres, queryParamsHandling: 'merge' });
  }

  /** Charge le libellé des étapes qu'on ne connaît pas encore (lien direct, retour navigateur) ; en cas d'échec, un libellé neutre. */
  private nommerEtapes(): void {
    for (const { dimension, id } of this.etapes()) {
      const cle = `${dimension}-${id}`;
      if (this.noms()[cle] || (dimension === 'EQUIPE' && id === 0)) {
        continue;
      }
      const source =
        dimension === 'CHANTIER'
          ? this.chantiers.fetchById(id).pipe(map((c) => c.code))
          : dimension === 'EQUIPE'
            ? this.equipes.fetchById(id).pipe(map((e) => e.code))
            : this.fonctions.fetchById(id).pipe(map((f) => f.libelle));
      source.pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe((libelle) => {
        if (libelle) {
          this.noms.update((noms) => ({ ...noms, [cle]: libelle }));
        }
      });
    }
  }
}
