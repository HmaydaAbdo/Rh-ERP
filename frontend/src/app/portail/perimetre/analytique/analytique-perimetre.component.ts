import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import { catchError, combineLatest, distinctUntilChanged, finalize, forkJoin, map, Observable, of, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { LazySelectPage, LazySelectSource } from '../../../shared/components/lazy-select/lazy-select.model';
import { ChartComponent, ChartSelection } from '../../../shared/ui/chart/chart.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { PdfExportButtonComponent } from '../../../shared/components/pdf-export-button/pdf-export-button.component';
import { PdfImpressionDocument } from '../../../shared/services/pdf-impression.service';
import { jeton, valeursSurPoints } from '../../../shared/ui/chart/chart-theme';
import { EmployeeAnalytique, EmployeeRegroupement } from '../../employee/models/employee.model';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaieEffectifMois, PaieSearchCriteria } from '../../paie/models/paie.model';
import { couleurEvolution, libelleEvolutionMesure, MesureEvolution } from '../../paie/analytique/paie-chart-theme';
import { formaterMontant, formaterVariation, libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { HeuresSuppService } from '../../heures-supp/services/heures-supp.service';
import { HeuresSuppAnalytique } from '../../heures-supp/models/heures-supp.model';
import {
  cleIds, DIMENSIONS, Dimension, etapeChoisie, LIBELLES_DIMENSIONS, lirePerimetre, Portee, porteeDe, porteeVide
} from '../perimetre';
import { LIBELLE_EQUIPE_ORPHELINE, lignesHeuresSupp, lignesPaie, LignePaie, nomGroupe } from '../perimetre-groupes';
import { ItemCatalogue, ModulePerimetre } from '../perimetre-module';
import { hauteurPourLignes, libelleTranche, libelleTrancheTotal, optionsBarres, optionsLigne } from './graphiques-perimetre';

interface Graphique<T extends ChartType> { data: ChartData<T>; options: ChartOptions<T> }
type MesureRepartition = 'masse' | 'effectif';
type OptionEquipeEvolution = SelectOption<number>;

/** Source recherchable et paginée du sélecteur de suivi, depuis les groupes déjà autorisés et chargés pour l'analyse. */
class OptionEquipeEvolutionSource implements LazySelectSource<OptionEquipeEvolution> {
  constructor(private readonly options: OptionEquipeEvolution[], private readonly nomDimension: string) {}

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<OptionEquipeEvolution>> {
    const terme = search.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const options = this.options.filter((option) => !terme || `${option.code ?? ''} ${option.label}`.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(terme));
    return of({ items: options.slice(page * size, (page + 1) * size), totalRecords: options.length });
  }

  fetchById(id: number | string): Observable<OptionEquipeEvolution> {
    const choisi = this.options.find((option) => option.value === Number(id));
    return of(choisi ?? { value: Number(id), label: Number(id) === 0 ? LIBELLE_EQUIPE_ORPHELINE : this.nomDimension });
  }
}

/** La répartition montre les plus grands groupes ; le reste est dans le tableau de données. */
const NOMBRE_BARRES = 12;
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const MESURES_EVOLUTION: MesureEvolution[] = ['effectif', 'masse', 'stc', 'stcMontant'];

interface Tuile {
  libelle: string;
  valeur: string;
  variation: string | null;
}

interface Donnees {
  paie: PaieAnalytique | null;
  qualitePaie: PaieAnalytique | null;
  fiches: EmployeeAnalytique | null;
  mouvements: PaieEffectifMois[];
  catalogueVide: boolean;
  equipesCatalogue: ItemCatalogue[];
  evolutionEquipe: PaieAnalytique['evolution'];
  chantiersCatalogue: PaieAnalytique['parChantier'];
  heuresSupp: HeuresSuppAnalytique | null;
}

/**
 * Vues Analytique des modules (lecture seule) — **tableau de bord graphique** d'un périmètre : côté Paie, les chiffres du mois
 * avec leur variation, l'évolution mensuelle (une mesure à la fois, un seul axe), la répartition en barres par une autre
 * dimension (un clic sur une barre approfondit le périmètre) et les tranches de total ; côté fiches Employé, les chiffres clés,
 * la pyramide des âges, l'ancienneté, la répartition en poste / sortis et les mouvements tirés de la paie. Un module peut
 * remplacer ces blocs par une projection d'effectif dédiée à sa dimension. Chaque graphique a son tableau de données. Une source
 * n'est lue qu'avec son droit (`PAIE_READ`, `EMPLOYEE_READ`). Le périmètre est celui des Cartes (voir `perimetre.ts`) : les
 * filtres propres au module le bornent, les étapes l'approfondissent.
 */
@Component({
  selector: 'app-analytique-perimetre',
  imports: [DecimalPipe, NgTemplateOutlet, RouterLink, ChartComponent, IconComponent, SelectComponent, LazySelectComponent, ButtonComponent, MessageComponent, PdfExportButtonComponent],
  templateUrl: './analytique-perimetre.component.html',
  styleUrl: './analytique-perimetre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalytiquePerimetreComponent {
  readonly module = input.required<ModulePerimetre>();

  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly heuresSuppService = inject(HeuresSuppService);
  private readonly authService = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly chantiers = inject(ChantierReferenceService);
  private readonly equipes = inject(EquipeReferenceService);
  private readonly fonctions = inject(FunctionReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly libelles = LIBELLES_DIMENSIONS;
  protected readonly libelleDimensionVueMaj = computed(() => LIBELLES_DIMENSIONS[this.module().dimension ?? 'EQUIPE']);
  protected readonly libelleDimensionVue = computed(() => this.libelleDimensionVueMaj().toLocaleLowerCase('fr'));
  protected readonly mesuresEvolution = MESURES_EVOLUTION;
  protected readonly libelleEvolutionMesure = libelleEvolutionMesure;
  protected readonly libellePeriode = libellePeriode;
  protected readonly libelleTranche = libelleTranche;
  protected readonly libelleTrancheTotal = libelleTrancheTotal;
  protected readonly formaterMontant = formaterMontant;
  protected readonly hauteurPourLignes = hauteurPourLignes;

  protected readonly voitPaie = computed(() => this.authService.hasPermission('PAIE_READ') && (this.module().sourcesAnalytique?.includes('PAIE') ?? true));
  protected readonly voitEmployes = computed(() => this.authService.hasPermission('EMPLOYEE_READ') && (this.module().sourcesAnalytique?.includes('EMPLOYEE') ?? true));
  protected readonly voitHeuresSupp = computed(() => this.authService.hasPermission('HEURES_SUP_READ') && !!this.module().critereHeuresSupp && (this.module().sourcesAnalytique?.includes('HEURES_SUP') ?? false));

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly perimetre = computed(() => lirePerimetre(this.params()));
  protected readonly ordreSources = computed(() => this.module().ordreAnalytique ?? ['PAIE', 'EMPLOYEE'] as const);
  protected readonly mois = signal<string[]>([]);
  protected readonly moisCharges = signal(false);
  /** Le mois courant : toujours le plus récent pour un module à période fixe, sinon celui de l'URL ou le plus récent. */
  protected readonly periode = computed(() => ((this.voitPaie() || this.voitHeuresSupp())
    ? (this.module().periodePaieRecenteFixe ? this.mois()[0] ?? null : this.perimetre().periode ?? this.mois()[0] ?? null)
    : null));

  protected readonly etapes = computed(() =>
    this.module().ordre
      .filter((dimension) => etapeChoisie(this.perimetre(), dimension) !== null)
      .map((dimension) => ({ dimension, id: etapeChoisie(this.perimetre(), dimension)! }))
  );
  protected readonly noms = signal<Record<string, string>>({});

  protected readonly donnees = signal<Donnees>({ paie: null, qualitePaie: null, fiches: null, mouvements: [], catalogueVide: false, equipesCatalogue: [], evolutionEquipe: [], chantiersCatalogue: [], heuresSupp: null });
  protected readonly chargement = signal(false);
  protected readonly erreurMois = signal<string | null>(null);
  protected readonly erreursChargement = signal<string[]>([]);
  protected readonly erreurRepartition = signal(false);
  protected readonly chargementRepartition = signal(false);
  protected readonly erreurQualite = signal(false);
  private readonly relance = signal(0);
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
  protected readonly heuresSupp = computed(() => this.donnees().heuresSupp);
  protected readonly groupesHeuresSupp = computed(() => lignesHeuresSupp(this.dimension(), this.heuresSupp()));
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
  protected readonly equipesEffectif = computed(() => {
    const dimension = this.module().dimension ?? this.module().ordre[0];
    const valeurs = new Map(lignesPaie(dimension, this.paie()).map((groupe) => [groupe.id, groupe]));
    const ids = this.perimetre()[cleIds(dimension)];
    const groupes = this.donnees().equipesCatalogue
      .filter((equipe) => ids.length === 0 || ids.includes(equipe.id))
      .map((equipe) => ({ id: equipe.id, code: equipe.code, libelle: equipe.libelle, ...(valeurs.get(equipe.id) ?? { effectif: 0, masse: 0, stc: 0, stcMontant: 0 }) }));
    const orphelins = valeurs.get(0);
    if (dimension === 'EQUIPE' && orphelins && orphelins.effectif > 0 && (ids.length === 0 || ids.includes(0))) {
      groupes.push({ ...orphelins, id: 0, code: null, libelle: LIBELLE_EQUIPE_ORPHELINE });
    }
    return groupes;
  });
  protected readonly chantiersEquipe = computed(() => this.donnees().chantiersCatalogue);
  protected readonly qualiteChantierIds = computed(() => this.idsQualite(this.params().get('qualiteChantierIds')));
  protected readonly qualiteFonctionIds = computed(() => this.idsQualite(this.params().get('qualiteFonctionIds')));
  protected readonly sourcesQualiteChantiers: LazySelectSource<ChantierReference>[] = this.authService.hasPermission('CHANTIER_READ') ? [this.chantiers] : [];
  protected readonly sourcesQualiteFonctions: LazySelectSource<FunctionReference>[] = this.authService.hasPermission('FUNCTION_READ') ? [this.fonctions] : [];
  protected readonly sourcesFiltresEquipes = this.authService.hasPermission('EQUIPE_READ') ? [this.equipes] : [];
  protected readonly sourcesFiltresFonctions = this.authService.hasPermission('FUNCTION_READ') ? [this.fonctions] : [];
  protected readonly filtresEquipeIds = computed(() => this.perimetre().equipeIds);
  protected readonly filtresFonctionIds = computed(() => this.perimetre().fonctionIds);
  protected readonly qualitePaie = computed(() => this.donnees().qualitePaie);
  protected readonly bulletinsAvecEquipe = computed(() => Math.max(0, (this.qualitePaie()?.kpis.effectif ?? 0) - (this.qualitePaie()?.qualite.sansEquipe ?? 0)));
  protected readonly graphiqueQualiteOrphelins = computed<Graphique<'doughnut'>>(() => {
    this.theme.theme();
    const analyse = this.qualitePaie();
    const orphelins = analyse?.qualite.sansEquipe ?? 0;
    const avecEquipe = Math.max(0, (analyse?.kpis.effectif ?? 0) - orphelins);
    const repartition = [
      { libelle: 'Avec équipe', valeur: avecEquipe, couleur: jeton('--color-primary') },
      { libelle: 'Orphelins', valeur: orphelins, couleur: jeton('--color-danger') }
    ].filter((part) => part.valeur > 0);
    return {
      data: { labels: repartition.map((part) => part.libelle), datasets: [{ data: repartition.map((part) => part.valeur), backgroundColor: repartition.map((part) => part.couleur), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'bottom' } } }
    };
  });
  protected readonly chantierSelectionne = computed<number | null>(() => {
    const id = Number(this.params().get('chantierIds'));
    return Number.isInteger(id) && id > 0 ? id : null;
  });
  protected readonly selectionEquipeEvolution = signal<number | null>(null);
  protected readonly equipeEvolutionId = computed(() => {
    const equipes = this.optionsEquipesEvolution();
    const choisi = this.selectionEquipeEvolution();
    return choisi !== null && equipes.some((equipe) => equipe.value === choisi) ? choisi : (equipes[0]?.value ?? null);
  });
  protected readonly evolutionEquipe = computed(() => this.donnees().evolutionEquipe);
  protected readonly mesureRepartitionEquipe = signal<MesureEvolution[]>(['effectif']);
  protected readonly mesureEvolutionEquipe = signal<MesureEvolution[]>(['effectif']);
  protected readonly libelleMesureEquipe = (mesure: MesureEvolution): string => {
    switch (mesure) {
      case 'effectif': return 'Effectif (personnes)';
      case 'masse': return 'Masse salariale (DH)';
      case 'stc': return 'STC (personnes)';
      case 'stcMontant': return 'STC (DH)';
    }
  };
  protected readonly optionsMesuresEquipe: SelectOption<MesureEvolution>[] = MESURES_EVOLUTION.map((value) => ({ value, label: this.libelleMesureEquipe(value) }));
  protected readonly optionsChantiersEquipe = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Tous les chantiers' },
    ...this.chantiersEquipe().map((chantier) => ({ value: chantier.id, label: chantier.libelle || chantier.code, code: chantier.code }))
  ]);
  protected readonly optionsEquipesEvolution = computed<SelectOption<number>[]>(() => {
    const dimension = this.module().dimension ?? 'EQUIPE';
    const ids = this.perimetre()[cleIds(dimension)];
    const lignes = this.equipesEffectif();
    const ordonnees = dimension === 'CHANTIER'
      ? [...lignes].sort((a, b) => b.masse - a.masse || b.effectif - a.effectif || a.libelle.localeCompare(b.libelle, 'fr'))
      : lignes;
    const groupes: SelectOption<number>[] = ordonnees.map((equipe) => ({ value: equipe.id, label: equipe.id === 0 ? 'Orphelins (sans équipe)' : equipe.libelle, code: this.donnees().equipesCatalogue.find((item) => item.id === equipe.id)?.code ?? undefined }));
    if (dimension === 'EQUIPE' && (ids.length === 0 || ids.includes(0)) && !groupes.some((equipe) => equipe.value === 0)) {
      groupes.push({ value: 0, label: 'Orphelins (sans équipe)' });
    }
    return groupes;
  });
  protected readonly sourcesEquipesEvolution = computed<LazySelectSource<OptionEquipeEvolution>[]>(() => [new OptionEquipeEvolutionSource(this.optionsEquipesEvolution(), this.libelleDimensionVueMaj())]);
  protected readonly optionsPeriodes = computed<SelectOption<string>[]>(() => this.mois().map((periode) => ({ value: periode, label: libellePeriode(periode) })));
  protected readonly tableauEquipes = computed(() => {
    const mesure = this.mesureRepartitionEquipe()[0] ?? 'effectif';
    return this.equipesEffectif().slice().sort((a, b) => b[mesure] - a[mesure]);
  });
  protected readonly graphiquesRepartitionEquipe = computed<(Graphique<'bar'> & { mesure: MesureEvolution })[]>(() => {
    this.theme.theme();
    return this.mesureRepartitionEquipe().map((mesure) => {
      const groupes = this.tableauEquipes().filter((groupe) => groupe[mesure] > 0).sort((a, b) => b[mesure] - a[mesure] || a.libelle.localeCompare(b.libelle, 'fr'));
      return {
        mesure,
        data: { labels: groupes.map((groupe) => groupe.libelle), datasets: [{ label: this.libelleMesureEquipe(mesure), data: groupes.map((groupe) => groupe[mesure]), backgroundColor: couleurEvolution(mesure), borderRadius: 4 }] },
        options: optionsBarres({ indexAxis: 'y', montants: mesure === 'masse' || mesure === 'stcMontant' })
      };
    });
  });
  protected readonly graphiquesEvolutionEquipe = computed<(Graphique<'line'> & { mesure: MesureEvolution })[]>(() => {
    this.theme.theme();
    const evolution = this.evolutionEquipe();
    return this.mesureEvolutionEquipe().map((mesure) => {
      const couleur = couleurEvolution(mesure);
      return {
        mesure,
        data: { labels: evolution.map((mois) => libellePeriode(mois.periode)), datasets: [{ label: this.libelleMesureEquipe(mesure), data: evolution.map((mois) => mois[mesure]), borderColor: couleur, backgroundColor: couleur, tension: 0.25 }] },
        options: optionsLigne(mesure === 'masse' || mesure === 'stcMontant')
      };
    });
  });

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
      ['Mois', 'Masse (DH)', 'Effectif payé', 'STC (personnes)', 'STC (DH)'],
      evolution.map((ligne) => [libellePeriode(ligne.periode), formaterMontant(ligne.masse), ligne.effectif, ligne.stc, formaterMontant(ligne.stcMontant)]));
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

  protected documentRepartitionEquipe(): PdfImpressionDocument {
    return this.documentPdf(`Situation de paie par ${this.libelleDimensionVue()}`,
      [this.libelleDimensionVueMaj(), 'Effectif (personnes)', 'Masse salariale (DH)', 'STC (personnes)', 'STC (DH)'],
      this.tableauEquipes().map((equipe) => [equipe.libelle, equipe.effectif, formaterMontant(equipe.masse), equipe.stc, formaterMontant(equipe.stcMontant)]),
      `${this.contexteEquipe(true)} · Indicateurs affichés : ${this.mesureRepartitionEquipe().map((mesure) => this.libelleMesureEquipe(mesure)).join(', ') || 'aucun'}`);
  }

  protected documentEvolutionEquipe(): PdfImpressionDocument {
    const equipe = this.optionsEquipesEvolution().find((valeur) => valeur.value === this.equipeEvolutionId());
    return this.documentPdf(`Évolution mensuelle de la paie par ${this.libelleDimensionVue()}`,
      ['Mois', 'Effectif (personnes)', 'Masse salariale (DH)', 'STC (personnes)', 'STC (DH)'],
      this.evolutionEquipe().map((mois) => [libellePeriode(mois.periode), mois.effectif, formaterMontant(mois.masse), mois.stc, formaterMontant(mois.stcMontant)]),
      `${this.contexteEquipe(false)} · Indicateurs affichés : ${this.mesureEvolutionEquipe().map((mesure) => this.libelleMesureEquipe(mesure)).join(', ') || 'aucun'} · Période couverte : ${this.evolutionEquipe().length ? `${libellePeriode(this.evolutionEquipe()[0].periode)} à ${libellePeriode(this.evolutionEquipe()[this.evolutionEquipe().length - 1].periode)}` : 'aucune'}${equipe ? ` · ${this.libelleDimensionVueMaj()} : ${equipe.label}` : ''}`);
  }

  protected documentQualiteOrphelins(): PdfImpressionDocument {
    const analyse = this.qualitePaie();
    return {
      titre: 'Qualité des rattachements des bulletins de paie',
      contexte: `${this.module().libellePluriel} · Paie de ${analyse ? libellePeriode(analyse.periode) : ''}`,
      colonnes: ['Rattachement', 'Bulletins'],
      lignes: [['Avec équipe', this.bulletinsAvecEquipe()], ['Sans équipe (orphelins)', analyse?.qualite.sansEquipe ?? 0]]
    };
  }

  private documentPdf(titre: string, colonnes: string[], lignes: (string | number)[][], contexte?: string): PdfImpressionDocument {
    return { titre, contexte: contexte ?? this.contextePerimetre(), colonnes, lignes };
  }

  private contextePerimetre(): string {
    const contexte = [`Domaine : ${this.module().libellePluriel}`];
    const periode = this.periode();
    if (periode) contexte.push(`Période de référence : ${libellePeriode(periode)}`);
    for (const dimension of DIMENSIONS) {
      const ids = this.perimetre()[cleIds(dimension)];
      if (ids.length) contexte.push(`${this.libelles[dimension]} : ${ids.map((id) => this.nom(dimension, id)).join(', ')}`);
    }
    const filtres = this.params();
    for (const [cle, libelle] of [['nom', 'Nom'], ['cin', 'CIN'], ['code', 'Code'], ['libelle', 'Libellé'], ['designation', 'Désignation']] as const) {
      const valeur = filtres.get(cle)?.trim();
      if (valeur) contexte.push(`${libelle} : ${valeur}`);
    }
    const statut = filtres.get('statut');
    if (statut === 'ACTIF' || statut === 'INACTIF') contexte.push(`Statut des fiches : ${statut === 'ACTIF' ? 'En poste' : 'Sorti'} (ne filtre pas la paie)`);
    return contexte.join(' · ');
  }

  private contexteEquipe(avecPeriode: boolean): string {
    const contexte = [`Domaine : ${this.libelleDimensionVueMaj()}`];
    const periode = this.periode();
    if (avecPeriode && periode) contexte.push(`Période de référence : ${libellePeriode(periode)}`);
    const ids = this.perimetre().chantierIds;
    const chantiersDisponibles = this.module().dimension === 'CHANTIER' ? this.donnees().equipesCatalogue : this.chantiersEquipe();
    const chantiers = chantiersDisponibles.filter((chantier) => ids.includes(chantier.id));
    contexte.push(ids.length ? `Chantier : ${chantiers.map((chantier) => chantier.libelle || chantier.code).join(', ') || ids.join(', ')}` : 'Chantier : tous');
    if (this.module().dimension === 'CHANTIER') {
      const fonctions = this.perimetre().fonctionIds;
      const equipes = this.perimetre().equipeIds;
      contexte.push(fonctions.length ? `Fonctions : ${fonctions.map((id) => this.nom('FONCTION', id)).join(', ')}` : 'Fonctions : toutes');
      contexte.push(equipes.length ? `Équipes : ${equipes.map((id) => this.nom('EQUIPE', id)).join(', ')}` : 'Équipes : toutes');
    }
    return contexte.join(' · ');
  }

  constructor() {
    this.chargerMois();

    // Module dont la barre exige un mois (Paie) : le plus récent est ouvert et inscrit dans la barre.
    effect(() => {
      const plusRecent = this.mois()[0];
      if (this.module().niveauPeriode && this.perimetre().periode === null && plusRecent) {
        untracked(() => this.naviguer({ periode: plusRecent }, true));
      }
    });

    const requete = computed(() => ({
      params: this.params(), periode: this.periode(), module: this.module(), pret: this.moisCharges(), equipeId: this.equipeEvolutionId(), relance: this.relance()
    }));
    toObservable(requete)
      .pipe(
        distinctUntilChanged((a, b) => a.relance === b.relance && a.module === b.module && a.pret === b.pret && a.periode === b.periode && a.equipeId === b.equipeId && a.params.keys.length === b.params.keys.length && a.params.keys.every((k) => a.params.get(k) === b.params.get(k))),
        switchMap((r) => {
          if (!r.pret) {
            return of(null);
          }
          this.chargement.set(true);
          this.erreursChargement.set([]);
          this.nommerEtapes();
          return this.charger(r.periode, r.equipeId).pipe(catchError(() => {
            this.erreursChargement.update((erreurs) => [...erreurs, 'Le périmètre analysé n’a pas pu être chargé.']);
            return of(null);
          }));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((resultat) => {
        this.chargement.set(false);
        if (resultat) {
          this.portee.set(resultat.portee);
          this.donnees.set(resultat.donnees);
        } else if (this.erreursChargement().length) {
          this.donnees.set({ paie: null, qualitePaie: null, fiches: null, mouvements: [], catalogueVide: false, equipesCatalogue: [], evolutionEquipe: [], chantiersCatalogue: [], heuresSupp: null });
        }
      });

    // La répartition des fiches suit la dimension choisie sans relancer le reste.
    combineLatest([toObservable(this.portee), toObservable(this.dimension), toObservable(this.relance)])
      .pipe(
        switchMap(([portee, dimension]) => {
          this.erreurRepartition.set(false);
          this.repartitionFiches.set([]);
          if (!this.voitEmployes() || porteeVide(portee)) {
            return of<EmployeeRegroupement[]>([]);
          }
          this.chargementRepartition.set(true);
          return this.employeeService.regrouper(this.module().critereEmployes(this.params(), portee), dimension).pipe(catchError(() => {
            this.erreurRepartition.set(true);
            return of<EmployeeRegroupement[]>([]);
          }), finalize(() => this.chargementRepartition.set(false)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((groupes) => this.repartitionFiches.set(groupes));
  }

  protected recharger(): void {
    this.chargerMois();
    this.relance.update((valeur) => valeur + 1);
  }

  private chargerMois(): void {
    this.erreurMois.set(null);
    if (this.voitHeuresSupp() && !this.voitPaie()) {
      this.moisCharges.set(false);
      this.heuresSuppService.periodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (periodes) => { this.mois.set(periodes); this.moisCharges.set(true); },
        error: () => { this.mois.set([]); this.erreurMois.set('Les périodes d’heures supplémentaires n’ont pas pu être chargées.'); this.moisCharges.set(true); }
      });
      return;
    }
    if (!this.authService.hasPermission('PAIE_READ')) {
      this.moisCharges.set(true);
      return;
    }
    this.moisCharges.set(false);
    this.paieService.listerPeriodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (periodes) => {
        this.mois.set(periodes.map((p) => p.periode));
        this.moisCharges.set(true);
      },
      error: () => {
        this.mois.set([]);
        this.erreurMois.set('Les périodes de paie n’ont pas pu être chargées.');
        this.moisCharges.set(true);
      }
    });
  }

  private suivreSource<T>(source: Observable<T>, message: string, repli: T): Observable<T> {
    return source.pipe(catchError(() => {
      this.erreursChargement.update((erreurs) => [...new Set([...erreurs, message])]);
      return of(repli);
    }));
  }

  protected choisirDimension(dimension: Dimension): void {
    this.choixDimension.set(dimension);
  }

  protected choisirEquipeEvolution(value: unknown): void {
    this.selectionEquipeEvolution.set(typeof value === 'number' ? value : null);
  }

  protected modifierMesureRepartitionEquipe(value: unknown): void {
    this.mesureRepartitionEquipe.set(Array.isArray(value) ? value as MesureEvolution[] : []);
  }

  protected modifierMesureEvolutionEquipe(value: unknown): void {
    this.mesureEvolutionEquipe.set(Array.isArray(value) ? value as MesureEvolution[] : []);
  }

  protected choisirChantierEquipe(value: unknown): void {
    this.naviguer({ chantierIds: typeof value === 'number' ? String(value) : null });
  }

  protected choisirFiltresEquipes(value: unknown): void {
    this.naviguer({ equipeIds: this.versIdsDimension(value, true) });
  }

  protected choisirFiltresFonctions(value: unknown): void {
    this.naviguer({ fonctionIds: this.versIdsDimension(value, false) });
  }

  protected choisirFiltresQualiteChantier(value: unknown): void {
    this.naviguer({ qualiteChantierIds: this.versIdsQualite(value) });
  }

  protected choisirFiltresQualiteFonction(value: unknown): void {
    this.naviguer({ qualiteFonctionIds: this.versIdsQualite(value) });
  }

  protected nom(dimension: Dimension, id: number): string {
    return this.noms()[`${dimension}-${id}`] ?? (dimension === 'EQUIPE' && id === 0 ? LIBELLE_EQUIPE_ORPHELINE : `${LIBELLES_DIMENSIONS[dimension]} choisi`);
  }

  protected changerPeriode(value: unknown): void {
    this.naviguer({ periode: typeof value === 'string' && value ? value : null });
  }

  protected retirer(dimension: Dimension): void {
    this.naviguer({ [cleIds(dimension)]: null });
  }

  protected toutRetirer(): void {
    this.naviguer({ chantierIds: null, equipeIds: null, fonctionIds: null, qualiteChantierIds: null, qualiteFonctionIds: null });
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

  private idsQualite(value: string | null): number[] {
    return (value ?? '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
  }

  private versIdsQualite(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    const ids = value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    return ids.length ? ids.join(',') : null;
  }

  private versIdsDimension(value: unknown, avecOrphelins: boolean): string | null {
    if (!Array.isArray(value)) return null;
    const ids = value.map(Number).filter((id) => Number.isInteger(id) && (avecOrphelins ? id >= 0 : id > 0));
    return ids.length ? [...new Set(ids)].join(',') : null;
  }

  private analyserQualitePaie(params: ParamMap, portee: Portee, periode: string): Observable<PaieAnalytique | null> {
    this.erreurQualite.set(false);
    if (!this.module().afficherQualiteOrphelins) return of(null);
    const criteres = this.module().criterePaie(params, portee, periode);
    const chantiers = this.qualiteChantierIds();
    const fonctions = this.qualiteFonctionIds();
    const chantierIds = this.intersectionQualite(criteres.chantierIds, chantiers);
    const fonctionIds = this.intersectionQualite(criteres.fonctionIds, fonctions);
    if ((chantiers.length > 0 && chantierIds?.length === 0) || (fonctions.length > 0 && fonctionIds?.length === 0)) return of(null);
    const filtre: PaieSearchCriteria = { ...criteres, chantierIds, fonctionIds };
    return this.suivreSource<PaieAnalytique | null>(this.paieService.analyser(filtre), 'La qualité des rattachements n’a pas pu être chargée.', null)
      .pipe(map((analyse) => { this.erreurQualite.set(analyse === null); return analyse; }));
  }

  private intersectionQualite(base: number[] | undefined, selection: number[]): number[] | undefined {
    if (selection.length === 0) return base;
    return base?.length ? base.filter((id) => selection.includes(id)) : selection;
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

  private charger(periode: string | null, equipeEvolutionId: number | null): Observable<{ portee: Portee; donnees: Donnees }> {
    const module = this.module();
    const params = this.params();
    const perimetre = this.perimetre();
    const catalogue = module.catalogue;
    const filtreActif = !!catalogue && catalogue.filtreActif(params);
    const catalogue$: Observable<ItemCatalogue[] | null> = filtreActif || module.vueEffectifParDimension ? catalogue!.charger(params) : of(null);

    return catalogue$.pipe(
      switchMap((items) => {
        const portee = porteeDe(perimetre);
        const dimension = module.dimension;
        if (dimension && items && perimetre[cleIds(dimension)].length === 0) {
          portee[cleIds(dimension)] = dimension === 'EQUIPE' ? [0, ...items.map((item) => item.id)] : items.map((item) => item.id);
        }
        const vide: Donnees = { paie: null, qualitePaie: null, fiches: null, mouvements: [], catalogueVide: false, equipesCatalogue: [], evolutionEquipe: [], chantiersCatalogue: [], heuresSupp: null };
        if (porteeVide(portee)) {
          return of({ portee, donnees: { ...vide, catalogueVide: true } });
        }
        if (module.vueEffectifParDimension) {
          const equipesCatalogue = (items ?? []).filter((equipe) => !dimension || perimetre[cleIds(dimension)].length === 0 || perimetre[cleIds(dimension)].includes(equipe.id));
          const avecCatalogue = { ...vide, equipesCatalogue, catalogueVide: !!catalogue && filtreActif && equipesCatalogue.length === 0 };
          if (!this.voitPaie() || !periode) {
            return of({ portee, donnees: avecCatalogue });
          }
          const paie$ = this.suivreSource<PaieAnalytique | null>(this.paieService.analyser(module.criterePaie(params, portee, periode)), 'Les indicateurs de paie n’ont pas pu être chargés.', null);
          const qualitePaie$ = this.analyserQualitePaie(params, portee, periode);
          const evolution$ = equipeEvolutionId === null
            ? of<PaieAnalytique | null>(null)
            : this.suivreSource<PaieAnalytique | null>(this.paieService.analyser(module.criterePaie(params, { ...portee, [cleIds(dimension ?? 'EQUIPE')]: [equipeEvolutionId] }, periode)), 'L’évolution mensuelle n’a pas pu être chargée.', null);
          const chantiers$ = dimension === 'CHANTIER' ? of<PaieAnalytique | null>(null)
            : this.suivreSource<PaieAnalytique | null>(this.paieService.analyser(module.criterePaie(params, { ...portee, chantierIds: undefined }, periode)), 'La liste des chantiers de l’analyse n’a pas pu être chargée.', null);
          return forkJoin([paie$, evolution$, chantiers$, qualitePaie$]).pipe(map(([paie, evolution, catalogueChantiers, qualitePaie]) => ({
            portee,
            donnees: { ...avecCatalogue, paie, qualitePaie, evolutionEquipe: evolution?.evolution ?? [], chantiersCatalogue: catalogueChantiers?.parChantier ?? [] }
          })));
        }
        // Une source en panne n'efface pas les autres : son bloc reste simplement vide.
        const paie$ = this.voitPaie() && periode ? this.suivreSource<PaieAnalytique | null>(this.paieService.analyser(module.criterePaie(params, portee, periode)), 'Les indicateurs de paie n’ont pas pu être chargés.', null) : of(null);
        const fiches$ = this.voitEmployes() ? this.suivreSource<EmployeeAnalytique | null>(this.employeeService.analyser(module.critereEmployes(params, portee)), 'Les indicateurs des fiches Employé n’ont pas pu être chargés.', null) : of(null);
        const mouvements$ = this.voitPaie() ? this.suivreSource(this.paieService.effectifs(module.criterePaie(params, portee, null)), 'Les mouvements mensuels n’ont pas pu être chargés.', [] as PaieEffectifMois[]) : of<PaieEffectifMois[]>([]);
        const heuresSupp$ = this.voitHeuresSupp() && periode && module.critereHeuresSupp
          ? this.suivreSource(this.heuresSuppService.analyser(module.critereHeuresSupp(params, portee, periode)), 'Les indicateurs Heures supplémentaires n’ont pas pu être chargés.', null)
          : of<HeuresSuppAnalytique | null>(null);
        return forkJoin([paie$, fiches$, mouvements$, heuresSupp$]).pipe(map(([paie, fiches, mouvements, heuresSupp]) => ({ portee, donnees: { ...vide, paie, fiches, mouvements, heuresSupp } })));
      })
    );
  }

  private nommerEtapes(): void {
    for (const { dimension, id } of DIMENSIONS.flatMap((dimension) => this.perimetre()[cleIds(dimension)].map((id) => ({ dimension, id })))) {
      const cle = `${dimension}-${id}`;
      if (this.noms()[cle] || (dimension === 'EQUIPE' && id === 0)) {
        continue;
      }
      if (!this.authService.hasPermission(dimension === 'FONCTION' ? 'FUNCTION_READ' : `${dimension}_READ`)) continue;
      const source =
        dimension === 'CHANTIER'
          ? this.chantiers.fetchById(id).pipe(map((c) => c.code))
          : dimension === 'EQUIPE'
            ? this.equipes.fetchById(id).pipe(map((e) => e.libelle || e.code))
            : this.fonctions.fetchById(id).pipe(map((f) => f.libelle));
      source.pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe((libelle) => {
        if (libelle) {
          this.noms.update((noms) => ({ ...noms, [cle]: libelle }));
        }
      });
    }
  }
}
