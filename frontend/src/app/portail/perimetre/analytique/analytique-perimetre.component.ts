import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { catchError, combineLatest, distinctUntilChanged, forkJoin, map, Observable, of, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ChartComponent, ChartSelection } from '../../../shared/ui/chart/chart.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { PdfExportButtonComponent } from '../../../shared/components/pdf-export-button/pdf-export-button.component';
import { PdfImpressionDocument } from '../../../shared/services/pdf-impression.service';
import { jeton, valeursSurPoints } from '../../../shared/ui/chart/chart-theme';
import { EmployeeAnalytique, EmployeeRegroupement } from '../../employee/models/employee.model';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaieEffectifMois } from '../../paie/models/paie.model';
import { couleurEvolution, libelleEvolutionMesure, MesureEvolution } from '../../paie/analytique/paie-chart-theme';
import { formaterMontant, formaterVariation, libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import {
  cleIds, DIMENSIONS, Dimension, etapeChoisie, LIBELLES_DIMENSIONS, lirePerimetre, Portee, porteeDe, porteeVide
} from '../perimetre';
import { lignesPaie, LignePaie, nomGroupe } from '../perimetre-groupes';
import { ItemCatalogue, ModulePerimetre } from '../perimetre-module';
import { hauteurPourLignes, libelleTranche, libelleTrancheTotal, optionsBarres, optionsLigne } from './graphiques-perimetre';

type Graphique<T extends 'bar' | 'line'> = { data: ChartData<T>; options: ChartOptions<T> };
type MesureRepartition = 'masse' | 'effectif';

/** La répartition montre les plus grands groupes ; le reste est dans le tableau de données. */
const NOMBRE_BARRES = 12;
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const MESURES_EVOLUTION: MesureEvolution[] = ['masse', 'effectif', 'stc', 'stcMontant'];

interface Tuile {
  libelle: string;
  valeur: string;
  variation: string | null;
}

interface Donnees {
  paie: PaieAnalytique | null;
  fiches: EmployeeAnalytique | null;
  mouvements: PaieEffectifMois[];
  catalogueVide: boolean;
}

/**
 * Vues Analytique des modules (lecture seule) — **tableau de bord graphique** d'un périmètre : côté Paie, les chiffres du mois
 * avec leur variation, l'évolution mensuelle (une mesure à la fois, un seul axe), la répartition en barres par une autre
 * dimension (un clic sur une barre approfondit le périmètre) et les tranches de total ; côté fiches Employé, les chiffres clés,
 * la pyramide des âges, l'ancienneté, la répartition en poste / sortis et les mouvements tirés de la paie. Chaque graphique a son
 * tableau de données. Une source n'est lue qu'avec son droit (`PAIE_READ`, `EMPLOYEE_READ`). Le périmètre est celui des Cartes
 * (voir `perimetre.ts`) : les filtres propres au module le bornent, les étapes l'approfondissent.
 */
@Component({
  selector: 'app-analytique-perimetre',
  imports: [DecimalPipe, NgTemplateOutlet, RouterLink, ChartComponent, IconComponent, PdfExportButtonComponent],
  templateUrl: './analytique-perimetre.component.html',
  styleUrl: './analytique-perimetre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalytiquePerimetreComponent {
  readonly module = input.required<ModulePerimetre>();

  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly chantiers = inject(ChantierReferenceService);
  private readonly equipes = inject(EquipeReferenceService);
  private readonly fonctions = inject(FunctionReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly libelles = LIBELLES_DIMENSIONS;
  protected readonly mesuresEvolution = MESURES_EVOLUTION;
  protected readonly libelleEvolutionMesure = libelleEvolutionMesure;
  protected readonly libellePeriode = libellePeriode;
  protected readonly libelleTranche = libelleTranche;
  protected readonly libelleTrancheTotal = libelleTrancheTotal;
  protected readonly formaterMontant = formaterMontant;
  protected readonly hauteurPourLignes = hauteurPourLignes;

  protected readonly voitPaie = computed(() => this.authService.hasPermission('PAIE_READ'));
  protected readonly voitEmployes = computed(() => this.authService.hasPermission('EMPLOYEE_READ'));

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly perimetre = computed(() => lirePerimetre(this.params()));
  protected readonly ordreSources = computed(() => this.module().ordreAnalytique ?? ['PAIE', 'EMPLOYEE'] as const);
  protected readonly mois = signal<string[]>([]);
  protected readonly moisCharges = signal(false);
  /** Le mois analysé : celui de l'URL, à défaut le plus récent. */
  protected readonly periode = computed(() => (this.voitPaie() ? (this.perimetre().periode ?? this.mois()[0] ?? null) : null));

  protected readonly etapes = computed(() =>
    this.module().ordre
      .filter((dimension) => etapeChoisie(this.perimetre(), dimension) !== null)
      .map((dimension) => ({ dimension, id: etapeChoisie(this.perimetre(), dimension)! }))
  );
  protected readonly noms = signal<Record<string, string>>({});

  protected readonly donnees = signal<Donnees>({ paie: null, fiches: null, mouvements: [], catalogueVide: false });
  protected readonly chargement = signal(false);
  protected readonly repartitionFiches = signal<EmployeeRegroupement[]>([]);

  /** Les dimensions qu'on peut encore utiliser pour répartir : celles qui ne sont pas déjà une étape. */
  protected readonly dimensionsPossibles = computed(() => DIMENSIONS.filter((d) => etapeChoisie(this.perimetre(), d) === null));
  private readonly choixDimension = signal<Dimension | null>(null);
  protected readonly dimension = computed<Dimension>(() => {
    const possibles = this.dimensionsPossibles();
    const choix = this.choixDimension();
    return choix && possibles.includes(choix) ? choix : (this.module().ordre.find((d) => possibles.includes(d)) ?? this.module().ordre[0]);
  });
  protected readonly mesureEvolution = signal<MesureEvolution>('masse');
  protected readonly mesureRepartition = signal<MesureRepartition>('masse');

  private readonly portee = signal<Portee>({});

  protected readonly paie = computed(() => this.donnees().paie);
  protected readonly aucunePaie = computed(() => this.paie()?.kpis.effectif === 0);
  protected readonly perimetreVide = computed(() => this.donnees().catalogueVide);

  protected readonly tuiles = computed<Tuile[]>(() => {
    const analyse = this.paie();
    if (!analyse) {
      return [];
    }
    const { kpis, moisPrecedent } = analyse;
    const pourcent = (courant: number | null, precedent: number | null | undefined): string | null =>
      moisPrecedent && courant !== null && precedent ? formaterVariation(((courant - precedent) / precedent) * 100) : null;
    const absolu = (courant: number, precedent: number | undefined): string | null =>
      moisPrecedent && precedent !== undefined ? `${courant - precedent > 0 ? '+' : ''}${FORMAT_ENTIER.format(courant - precedent)}` : null;
    const tuiles: Tuile[] = [
      { libelle: 'Masse salariale', valeur: `${formaterMontant(kpis.masse)} DH`, variation: pourcent(kpis.masse, moisPrecedent?.masse) },
      { libelle: 'Effectif payé', valeur: String(kpis.effectif), variation: absolu(kpis.effectif, moisPrecedent?.effectif) },
      { libelle: 'Coût moyen par personne', valeur: kpis.coutMoyen === null ? '—' : `${formaterMontant(kpis.coutMoyen)} DH`, variation: pourcent(kpis.coutMoyen, moisPrecedent?.coutMoyen) },
      { libelle: 'Soldes de tout compte', valeur: `${kpis.stc} · ${formaterMontant(kpis.stcMontant)} DH`, variation: absolu(kpis.stc, moisPrecedent?.stc) }
    ];
    if (etapeChoisie(this.perimetre(), 'CHANTIER') === null) {
      tuiles.push({ libelle: 'Chantiers concernés', valeur: String(kpis.nombreChantiers), variation: absolu(kpis.nombreChantiers, moisPrecedent?.nombreChantiers) });
    }
    return tuiles;
  });

  /** Les groupes de paie de la dimension de répartition, du plus grand au plus petit, sans catégorie nulle. */
  protected readonly repartitionPaie = computed<LignePaie[]>(() => {
    const mesure = this.mesureRepartition();
    return lignesPaie(this.dimension(), this.paie())
      .filter((ligne) => ligne[mesure] > 0)
      .sort((a, b) => b[mesure] - a[mesure]);
  });
  protected readonly lignesRepartitionPaie = computed(() => lignesPaie(this.dimension(), this.paie()).sort((a, b) => b.masse - a.masse));
  protected readonly mouvements = computed(() => this.donnees().mouvements);
  protected readonly fiches = computed(() => this.donnees().fiches);
  protected readonly noteMouvements = computed(() => this.module().noteMouvements?.(this.params()) ?? null);

  protected readonly graphiqueEvolution = computed<Graphique<'line'> & { plugins: ReturnType<typeof valeursSurPoints>[] }>(() => {
    this.theme.theme();
    const mesure = this.mesureEvolution();
    const evolution = this.paie()?.evolution ?? [];
    const couleur = couleurEvolution(mesure);
    const montants = mesure === 'masse' || mesure === 'stcMontant';
    const analyse = this.periode();
    return {
      data: {
        labels: evolution.map((e) => libellePeriode(e.periode)),
        datasets: [{
          label: libelleEvolutionMesure(mesure),
          data: evolution.map((e) => e[mesure]),
          borderColor: couleur,
          backgroundColor: couleur,
          borderWidth: 2,
          cubicInterpolationMode: 'monotone',
          pointRadius: evolution.map((e) => (e.periode === analyse ? 7 : 4)),
          pointBorderColor: jeton('--color-surface'),
          pointBorderWidth: 2
        }]
      },
      options: optionsLigne(montants),
      plugins: [valeursSurPoints((v) => (montants ? formaterMontant(v) : FORMAT_ENTIER.format(v)))]
    };
  });

  protected readonly graphiqueRepartitionPaie = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const mesure = this.mesureRepartition();
    const lignes = this.repartitionPaie().slice(0, NOMBRE_BARRES);
    return {
      data: {
        labels: lignes.map((l) => nomGroupe(this.dimension(), l)),
        datasets: [{
          label: mesure === 'masse' ? 'Masse (DH)' : 'Effectif payé',
          data: lignes.map((l) => l[mesure]),
          backgroundColor: jeton(mesure === 'masse' ? '--chart-1' : '--chart-2'),
          borderRadius: 4
        }]
      },
      options: optionsBarres({ indexAxis: 'y', montants: mesure === 'masse' })
    };
  });

  protected readonly graphiqueTranches = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const tranches = this.paie()?.tranches ?? [];
    return {
      data: {
        labels: tranches.map((t) => libelleTrancheTotal(t)),
        datasets: [{ label: 'Bulletins', data: tranches.map((t) => t.effectif), backgroundColor: jeton('--chart-3'), borderRadius: 4 }]
      },
      options: optionsBarres({})
    };
  });

  protected readonly graphiqueAges = computed(() => this.barresTranches(this.fiches()?.parAge ?? [], 'age', '--chart-1'));
  protected readonly graphiqueAnciennete = computed(() => this.barresTranches(this.fiches()?.parAnciennete ?? [], 'anciennete', '--chart-2'));

  protected readonly graphiqueRepartitionFiches = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const groupes = this.repartitionFiches().slice(0, NOMBRE_BARRES);
    return {
      data: {
        labels: groupes.map((g) => nomGroupe(this.dimension(), g)),
        datasets: [
          { label: 'En poste', data: groupes.map((g) => g.actifs), backgroundColor: jeton('--chart-1'), borderRadius: 4, stack: 'effectif' },
          { label: 'Sortis', data: groupes.map((g) => g.effectif - g.actifs), backgroundColor: jeton('--chart-4'), borderRadius: 4, stack: 'effectif' }
        ]
      },
      options: optionsBarres({ indexAxis: 'y', empile: true, legende: true })
    };
  });

  protected readonly graphiqueEffectifPaye = computed<Graphique<'line'>>(() => {
    this.theme.theme();
    const mois = this.mouvements();
    const couleur = jeton('--chart-1');
    return {
      data: {
        labels: mois.map((m) => libellePeriode(m.periode)),
        datasets: [{ label: 'Employés payés', data: mois.map((m) => m.effectif), borderColor: couleur, backgroundColor: couleur, borderWidth: 2, cubicInterpolationMode: 'monotone', pointRadius: 4, pointBorderColor: jeton('--color-surface'), pointBorderWidth: 2 }]
      },
      options: optionsLigne(false)
    };
  });

  protected readonly graphiqueMouvements = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const mois = this.mouvements().slice(1);
    return {
      data: {
        labels: mois.map((m) => libellePeriode(m.periode)),
        datasets: [
          { label: 'Entrées', data: mois.map((m) => m.entrees ?? 0), backgroundColor: jeton('--chart-3'), borderRadius: 4 },
          { label: 'Sorties', data: mois.map((m) => m.sorties), backgroundColor: jeton('--chart-4'), borderRadius: 4 },
          { label: 'Mutations', data: mois.map((m) => m.mutations ?? 0), backgroundColor: jeton('--chart-2'), borderRadius: 4 }
        ]
      },
      options: optionsBarres({ legende: true })
    };
  });

  protected documentKpis(): PdfImpressionDocument {
    return this.documentPdf('Indicateurs clés · Paie', ['Indicateur', 'Valeur', 'Variation'],
      this.tuiles().map((tuile) => [tuile.libelle, tuile.valeur, tuile.variation ?? '']));
  }

  protected documentEvolution(): PdfImpressionDocument {
    const evolution = this.paie()?.evolution ?? [];
    const mesure = this.mesureEvolution();
    return this.documentPdf(`Évolution mensuelle · ${libelleEvolutionMesure(mesure)}`,
      ['Mois', libelleEvolutionMesure(mesure)],
      evolution.map((ligne) => [libellePeriode(ligne.periode), ligne[mesure]]));
  }

  protected documentRepartitionPaie(): PdfImpressionDocument {
    return this.documentPdf(`Répartition Paie · ${this.libelles[this.dimension()]} · ${this.libellePeriode(this.periode() ?? '')}`,
      [this.libelles[this.dimension()], 'Payés', 'Masse (DH)', 'STC', 'Montant STC (DH)'],
      this.lignesRepartitionPaie().map((ligne) => [this.nomLigne(ligne), ligne.effectif, ligne.masse, ligne.stc, ligne.stcMontant]));
  }

  protected documentTranchesPaie(): PdfImpressionDocument {
    return this.documentPdf('Bulletins par tranche de total', ['Tranche', 'Bulletins'],
      (this.paie()?.tranches ?? []).map((tranche) => [libelleTrancheTotal(tranche), tranche.effectif]));
  }

  protected documentMouvementsPaye(): PdfImpressionDocument {
    return this.documentPdf('Effectif payé · évolution mensuelle', ['Mois', 'Employés payés'],
      this.mouvements().map((mois) => [libellePeriode(mois.periode), mois.effectif]));
  }

  protected documentMouvements(): PdfImpressionDocument {
    return this.documentPdf('Entrées, sorties et mutations', ['Mois', 'Entrées', 'Sorties', 'Mutations'],
      this.mouvements().slice(1).map((mois) => [libellePeriode(mois.periode), mois.entrees ?? '—', mois.sorties, mois.mutations ?? '—']));
  }

  protected documentKpisFiches(): PdfImpressionDocument {
    const f = this.fiches();
    return this.documentPdf('Indicateurs clés · Employés', ['Indicateur', 'Valeur'], f ? [
      ['Effectif', f.effectif], ['En poste', f.actifs], ['Sortis', f.inactifs], ['Âge moyen (ans)', f.ageMoyen ?? '—'],
      ['Ancienneté moyenne (ans)', f.ancienneteMoyenne ?? '—'], ['Embauches sur 12 mois', f.embauchesDouzeMois]
    ] : []);
  }

  protected documentAges(): PdfImpressionDocument {
    return this.documentPdf('Pyramide des âges', ['Âge', 'Employés'],
      (this.fiches()?.parAge ?? []).map((tranche) => [libelleTranche(tranche, 'age'), tranche.effectif]));
  }

  protected documentAnciennete(): PdfImpressionDocument {
    return this.documentPdf('Ancienneté', ['Ancienneté', 'Employés'],
      (this.fiches()?.parAnciennete ?? []).map((tranche) => [libelleTranche(tranche, 'anciennete'), tranche.effectif]));
  }

  protected documentRepartitionFiches(): PdfImpressionDocument {
    return this.documentPdf(`Employés par ${this.libelles[this.dimension()].toLowerCase()}`,
      [this.libelles[this.dimension()], 'Employés', 'En poste'],
      this.repartitionFiches().map((groupe) => [this.nomLigne(groupe), groupe.effectif, groupe.actifs]));
  }

  private documentPdf(titre: string, colonnes: string[], lignes: (string | number)[][]): PdfImpressionDocument {
    const periode = this.periode();
    return { titre, contexte: `${this.module().libellePluriel}${periode ? ` · ${libellePeriode(periode)}` : ''}`, colonnes, lignes };
  }

  constructor() {
    if (this.voitPaie()) {
      this.paieService.listerPeriodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((periodes) => {
        this.mois.set(periodes.map((p) => p.periode));
        this.moisCharges.set(true);
      });
    } else {
      this.moisCharges.set(true);
    }

    // Module dont la barre exige un mois (Paie) : le plus récent est ouvert et inscrit dans la barre.
    effect(() => {
      const plusRecent = this.mois()[0];
      if (this.module().niveauPeriode && this.perimetre().periode === null && plusRecent) {
        untracked(() => this.naviguer({ periode: plusRecent }, true));
      }
    });

    const requete = computed(() => ({ params: this.params(), periode: this.periode(), module: this.module(), pret: this.moisCharges() }));
    toObservable(requete)
      .pipe(
        distinctUntilChanged((a, b) => a.module === b.module && a.pret === b.pret && a.periode === b.periode && a.params.keys.length === b.params.keys.length && a.params.keys.every((k) => a.params.get(k) === b.params.get(k))),
        switchMap((r) => {
          if (!r.pret) {
            return of(null);
          }
          this.chargement.set(true);
          this.nommerEtapes();
          return this.charger(r.periode).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((resultat) => {
        this.chargement.set(false);
        if (resultat) {
          this.portee.set(resultat.portee);
          this.donnees.set(resultat.donnees);
        }
      });

    // La répartition des fiches suit la dimension choisie sans relancer le reste.
    combineLatest([toObservable(this.portee), toObservable(this.dimension)])
      .pipe(
        switchMap(([portee, dimension]) => {
          if (!this.voitEmployes() || porteeVide(portee)) {
            return of<EmployeeRegroupement[]>([]);
          }
          return this.employeeService.regrouper(this.module().critereEmployes(this.params(), portee), dimension).pipe(catchError(() => of<EmployeeRegroupement[]>([])));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((groupes) => this.repartitionFiches.set(groupes));
  }

  protected choisirDimension(dimension: Dimension): void {
    this.choixDimension.set(dimension);
  }

  protected nom(dimension: Dimension, id: number): string {
    return this.noms()[`${dimension}-${id}`] ?? (dimension === 'EQUIPE' && id === 0 ? 'Sans équipe' : `${LIBELLES_DIMENSIONS[dimension]} choisi`);
  }

  protected changerPeriode(event: Event): void {
    this.naviguer({ periode: (event.target as HTMLSelectElement).value || null });
  }

  protected retirer(dimension: Dimension): void {
    this.naviguer({ [cleIds(dimension)]: null });
  }

  protected toutRetirer(): void {
    this.naviguer({ chantierIds: null, equipeIds: null, fonctionIds: null });
  }

  /** Un clic sur une barre de la répartition de la paie approfondit le périmètre : le groupe devient une étape. */
  protected approfondirDepuisBarre(selection: ChartSelection): void {
    const ligne = this.repartitionPaie()[selection.index];
    if (ligne) {
      this.approfondir(ligne);
    }
  }

  protected approfondirDepuisFiches(selection: ChartSelection): void {
    const groupe = this.repartitionFiches()[selection.index];
    if (groupe) {
      this.approfondir(groupe);
    }
  }

  protected approfondir(groupe: { id: number; code: string | null; libelle: string }): void {
    const dimension = this.dimension();
    this.noms.update((noms) => ({ ...noms, [`${dimension}-${groupe.id}`]: nomGroupe(dimension, groupe) }));
    this.naviguer({ [cleIds(dimension)]: String(groupe.id) });
  }

  protected nomLigne(groupe: { id: number; code: string | null; libelle: string }): string {
    return nomGroupe(this.dimension(), groupe);
  }

  private naviguer(parametres: Params, remplacer = false): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: parametres, queryParamsHandling: 'merge', replaceUrl: remplacer });
  }

  private barresTranches(tranches: { min: number; max: number | null; effectif: number }[], mesure: 'age' | 'anciennete', couleur: string): Graphique<'bar'> {
    this.theme.theme();
    return {
      data: {
        labels: tranches.map((t) => libelleTranche(t, mesure)),
        datasets: [{ label: 'Employés', data: tranches.map((t) => t.effectif), backgroundColor: jeton(couleur), borderRadius: 4 }]
      },
      options: optionsBarres({})
    };
  }

  private charger(periode: string | null): Observable<{ portee: Portee; donnees: Donnees }> {
    const module = this.module();
    const params = this.params();
    const perimetre = this.perimetre();
    const catalogue = module.catalogue;
    const filtreActif = !!catalogue && catalogue.filtreActif(params);
    const catalogue$: Observable<ItemCatalogue[] | null> = filtreActif ? catalogue!.charger(params) : of(null);

    return catalogue$.pipe(
      switchMap((items) => {
        const portee = porteeDe(perimetre);
        const dimension = module.dimension;
        if (dimension && items && perimetre[cleIds(dimension)].length === 0) {
          portee[cleIds(dimension)] = items.map((item) => item.id);
        }
        const vide: Donnees = { paie: null, fiches: null, mouvements: [], catalogueVide: false };
        if (porteeVide(portee)) {
          return of({ portee, donnees: { ...vide, catalogueVide: true } });
        }
        // Une source en panne n'efface pas les autres : son bloc reste simplement vide.
        const paie$ = this.voitPaie() && periode ? this.paieService.analyser(module.criterePaie(params, portee, periode)).pipe(catchError(() => of(null))) : of(null);
        const fiches$ = this.voitEmployes() ? this.employeeService.analyser(module.critereEmployes(params, portee)).pipe(catchError(() => of(null))) : of(null);
        const mouvements$ = this.voitPaie() ? this.paieService.effectifs(portee).pipe(catchError(() => of<PaieEffectifMois[]>([]))) : of<PaieEffectifMois[]>([]);
        return forkJoin([paie$, fiches$, mouvements$]).pipe(map(([paie, fiches, mouvements]) => ({ portee, donnees: { ...vide, paie, fiches, mouvements } })));
      })
    );
  }

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
