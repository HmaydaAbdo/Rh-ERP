import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { EmployeeFiltres, lireFiltres, versCriteres, versParametres } from '../filtres/employee-filtres';
import { DimensionEmployes, Employee, EmployeeRegroupement } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

/** Niveau affiché : des groupes (par chantier, équipe ou fonction) ou les employés eux-mêmes. */
export type NiveauCartes = DimensionEmployes | 'EMPLOYES';

/** Ordre de descente proposé ; l'utilisateur peut en choisir un autre à tout moment (`?par=`). */
const ORDRE: DimensionEmployes[] = ['CHANTIER', 'EQUIPE', 'FONCTION'];
const LIBELLES: Record<NiveauCartes, string> = { CHANTIER: 'Chantier', EQUIPE: 'Équipe', FONCTION: 'Fonction', EMPLOYES: 'Employés' };
const PARAMETRE_PAR: Record<NiveauCartes, string> = { CHANTIER: 'chantier', EQUIPE: 'equipe', FONCTION: 'fonction', EMPLOYES: 'employes' };
const TAILLE_PAGE = 24;

/** La clé de filtre d'une dimension. */
function cle(dimension: DimensionEmployes): 'chantierIds' | 'equipeIds' | 'fonctionIds' {
  return dimension === 'CHANTIER' ? 'chantierIds' : dimension === 'EQUIPE' ? 'equipeIds' : 'fonctionIds';
}

/** Une dimension est « choisie » quand le filtre de l'URL porte exactement une valeur : c'est une étape du fil. */
function choisie(filtres: EmployeeFiltres, dimension: DimensionEmployes): number | null {
  const ids = filtres[cle(dimension)];
  return ids.length === 1 ? ids[0] : null;
}

/**
 * Vue Cartes des employés (lecture seule) : on descend dans l'effectif en choisissant soi-même par quoi regrouper — chantier,
 * équipe, fonction, dans l'ordre proposé ou dans un autre — jusqu'aux employés. Tout vit dans l'URL : les étapes sont les
 * filtres de la barre (une valeur par dimension), le regroupement courant est `?par=`. À tout moment, « Voir la liste »
 * ouvre la vue Tabulaire sur le même périmètre.
 */
@Component({
  selector: 'app-employee-cartes',
  imports: [RouterLink, BadgeComponent, ButtonComponent, IconComponent],
  templateUrl: './employee-cartes.component.html',
  styleUrl: './employee-cartes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeCartesComponent {
  private readonly employeeService = inject(EmployeeService);
  private readonly chantiers = inject(ChantierReferenceService);
  private readonly equipes = inject(EquipeReferenceService);
  private readonly fonctions = inject(FunctionReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ordre = ORDRE;
  protected readonly libelles = LIBELLES;

  private readonly parametres = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly filtres = computed(() => lireFiltres(this.parametres()));

  /** Le niveau demandé par `?par=` s'il est possible, sinon la première dimension pas encore choisie, sinon les employés. */
  protected readonly niveau = computed<NiveauCartes>(() => {
    const filtres = this.filtres();
    const demande = (Object.keys(PARAMETRE_PAR) as NiveauCartes[]).find((n) => PARAMETRE_PAR[n] === this.parametres().get('par'));
    if (demande && (demande === 'EMPLOYES' || choisie(filtres, demande) === null)) {
      return demande;
    }
    return ORDRE.find((d) => choisie(filtres, d) === null) ?? 'EMPLOYES';
  });

  /** Les étapes du fil : chaque dimension choisie, avec son libellé lisible. */
  protected readonly etapes = computed(() =>
    ORDRE.filter((d) => choisie(this.filtres(), d) !== null).map((d) => ({ dimension: d, id: choisie(this.filtres(), d)! }))
  );

  protected readonly groupes = signal<EmployeeRegroupement[] | null>(null);
  protected readonly employes = signal<Employee[]>([]);
  protected readonly totalEmployes = signal(0);
  protected readonly chargement = signal(false);
  private page = 0;

  /** Libellés des étapes du fil (« C168 », « Équipe OP »…), chargés une fois par valeur. */
  protected readonly noms = signal<Record<string, string>>({});

  protected readonly total = computed(() => (this.groupes() ?? []).reduce((somme, g) => somme + g.effectif, 0));
  protected readonly actifs = computed(() => (this.groupes() ?? []).reduce((somme, g) => somme + g.actifs, 0));

  constructor() {
    this.route.queryParamMap
      .pipe(
        map(() => ({ filtres: this.filtres(), niveau: this.niveau() })),
        switchMap(({ filtres, niveau }) => {
          this.chargement.set(true);
          this.nommerEtapes();
          if (niveau === 'EMPLOYES') {
            this.page = 0;
            return this.employeeService.search(versCriteres(filtres), { page: 0, size: TAILLE_PAGE, sort: 'nomPrenom,asc' }).pipe(
              map((page) => ({ groupes: null, page }))
            );
          }
          return this.employeeService.regrouper(versCriteres(filtres), niveau).pipe(map((groupes) => ({ groupes, page: null })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ groupes, page }) => {
        this.chargement.set(false);
        this.groupes.set(groupes);
        this.employes.set(page?.content ?? []);
        this.totalEmployes.set(page?.page.totalElements ?? 0);
      });
  }

  protected nom(dimension: DimensionEmployes, id: number): string {
    return this.noms()[`${dimension}-${id}`] ?? (dimension === 'EQUIPE' && id === 0 ? 'Sans équipe' : `${LIBELLES[dimension]} choisi`);
  }

  protected possible(dimension: DimensionEmployes): boolean {
    return choisie(this.filtres(), dimension) === null;
  }

  /** Regrouper autrement à ce niveau, sans perdre les étapes déjà choisies. */
  protected regrouperPar(niveau: NiveauCartes): void {
    this.naviguer({ par: PARAMETRE_PAR[niveau] });
  }

  /** Ouvrir un groupe : il devient une étape du fil, et l'on descend à la dimension suivante. */
  protected ouvrir(groupe: EmployeeRegroupement): void {
    const niveau = this.niveau() as DimensionEmployes;
    this.noms.update((noms) => ({ ...noms, [`${niveau}-${groupe.id}`]: this.libelleGroupe(niveau, groupe) }));
    this.naviguer({ [cle(niveau)]: String(groupe.id), par: null });
  }

  /** Retirer une étape du fil (les autres restent). */
  protected retirer(dimension: DimensionEmployes): void {
    this.naviguer({ [cle(dimension)]: null, par: null });
  }

  protected toutRetirer(): void {
    this.naviguer({ chantierIds: null, equipeIds: null, fonctionIds: null, par: null });
  }

  /** Les paramètres de la vue Tabulaire : le même périmètre, sans le regroupement. */
  protected readonly parametresListe = computed<Params>(() => versParametres(this.filtres()));

  protected afficherPlus(): void {
    this.page++;
    this.employeeService
      .search(versCriteres(this.filtres()), { page: this.page, size: TAILLE_PAGE, sort: 'nomPrenom,asc' })
      .subscribe((page) => this.employes.update((employes) => [...employes, ...page.content]));
  }

  protected libelleGroupe(dimension: DimensionEmployes, groupe: EmployeeRegroupement): string {
    if (dimension === 'EQUIPE' && groupe.id === 0) {
      return 'Sans équipe';
    }
    return groupe.code ?? groupe.libelle;
  }

  protected part(groupe: EmployeeRegroupement): number {
    return this.total() > 0 ? Math.round((groupe.effectif / this.total()) * 100) : 0;
  }

  protected initiales(employe: Employee): string {
    return employe.nomPrenom.split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0].toUpperCase()).join('');
  }

  private naviguer(parametres: Params): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: parametres, queryParamsHandling: 'merge', replaceUrl: false });
  }

  /** Charge le libellé des étapes qu'on ne connaît pas encore (lien direct, retour navigateur) ; en cas d'échec, un libellé neutre. */
  private nommerEtapes(): void {
    for (const { dimension, id } of this.etapes()) {
      const cleNom = `${dimension}-${id}`;
      if (this.noms()[cleNom] || (dimension === 'EQUIPE' && id === 0)) {
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
          this.noms.update((noms) => ({ ...noms, [cleNom]: libelle }));
        }
      });
    }
  }
}
