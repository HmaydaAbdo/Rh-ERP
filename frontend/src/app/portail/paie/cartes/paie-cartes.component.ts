import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounce, form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, finalize, forkJoin, merge, Observable, of, Subject, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { Page } from '../../../shared/models/page.model';
import { contient } from '../../../shared/text/recherche';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { lireFiltres, PaieFiltres, versCriteres } from '../filtres/paie-filtres';
import { Paie, PaieAnalytique, PaieChantierPeriode, PaiePeriodeComparaison, PaiePeriodeResume, PaieSearchCriteria } from '../models/paie.model';
import { formaterMontant, formaterPart, formaterVariation, libellePeriode, periodePrecedente } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { NotificationService } from '@shared/feedback/feedback.service';

const DEBOUNCE_RECHERCHE_MS = 300;
const DELAI_CASCADE_MS = 50;
const DELAI_CASCADE_MAX_RANG = 12;
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

type IndicateurPaie = 'masse' | 'effectif' | 'stcMontant' | 'stc';

interface IndicateurAffiche {
  cle: IndicateurPaie;
  libelle: string;
  valeur: number;
  unite: string;
  comparaison: string | null;
}

const LIBELLES_INDICATEURS: Record<IndicateurPaie, string> = {
  masse: 'Masse salariale (DH)',
  effectif: 'Bulletins / employés payés (personnes)',
  stcMontant: 'Montant des STC / sorties (DH)',
  stc: 'STC / sorties (personnes)'
};

/** Résumé du mois affiché en carte et du mois contigu pour calculer les quatre comparaisons. */
interface CarteMois {
  resume: PaiePeriodeResume;
  precedent: PaiePeriodeResume | null;
}

interface CarteChantier {
  chantier: PaieChantierPeriode;
  /** Part de la masse du mois, en pourcentage. */
  part: number;
}

/** Résumé d'une équipe ; `equipeId` est nul pour les bulletins sans équipe. */
interface LigneEquipe {
  equipeId: number | null;
  code: string;
  libelle: string;
  effectif: number;
  masse: number;
  stc: number;
  stcMontant: number;
  moisPrecedent: PaiePeriodeComparaison | null;
}

/** Une suppression en groupe en attente de confirmation : ce qui sera supprimé, décrit pour l'utilisateur. */
interface Suppression {
  /** Le groupe visé, en une ligne (« Mois : août 2026 », « Chantier C168 · Nador »…). */
  cible: string;
  criteres: PaieSearchCriteria;
  /** Nombre de bulletins que la carte comptait : celui que l'utilisateur doit retaper, et que le serveur revérifie. */
  nombre: number;
  /** Les filtres qui restreignent le groupe, un par ligne. */
  filtres: string[];
  /** Vrai quand le groupe est le chantier ouvert (niveau 3) : une fois supprimé, on remonte aux chantiers. */
  remonterApres: boolean;
}

/**
 * Vue « Cartes » de la paie, en quatre niveaux de descente : mois, vue d'ensemble, chantier et équipe.
 * **Descendre, c'est filtrer** : le niveau se déduit des filtres de la barre commune
 * (voir `filtres/paie-filtres.ts`) — sans mois, les mois ; avec un mois, les chantiers ; avec un mois et un seul chantier,
 * ses équipes — et cliquer une carte pose le filtre correspondant dans l'URL. Retour navigateur, lien direct et barre de
 * filtres restent donc toujours d'accord. Les autres filtres (nom, CIN, fonctions, équipes, chantiers) restreignent les
 * bulletins comptés à chaque niveau. Aucune donnée propre : tout vient de `/paie/periodes/search` et
 * `/paie/chantiers/search` (voir docs/paie/README.md, « Vue Cartes »). Chaque carte (mois, chantier, équipe) propose aussi de
 * **supprimer d'un coup** les bulletins qu'elle compte, après une confirmation qui demande de retaper leur nombre.
 */
@Component({
  selector: 'app-paie-cartes',
  imports: [
    FormField,
    RouterLink,
    IconComponent,
    ButtonComponent,
    DialogComponent
  ],
  templateUrl: './paie-cartes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-cartes.component.scss'
})
export class PaieCartesComponent {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(NotificationService);

  readonly filtres = signal<PaieFiltres>(lireFiltres(this.route.snapshot.queryParamMap));
  /** Sens du dernier changement de niveau : oriente le glissement de l'animation (vers l'avant en descendant). */
  readonly sens = signal<'avant' | 'arriere'>('avant');
  readonly chargement = signal(true);
  readonly periodes = signal<PaiePeriodeResume[]>([]);
  readonly chantiers = signal<PaieChantierPeriode[]>([]);
  readonly analytique = signal<PaieAnalytique | null>(null);
  readonly pageEmployes = signal<Page<Paie> | null>(null);
  readonly employesEnChargement = signal(false);

  private readonly saisieRecherche = signal({ terme: '' });
  readonly rechercheForm = form(this.saisieRecherche, (chemin) => debounce(chemin.terme, DEBOUNCE_RECHERCHE_MS));

  readonly suppression = signal<Suppression | null>(null);
  readonly suppressionEnCours = signal(false);
  private readonly saisieConfirmation = signal({ nombre: '' });
  readonly confirmationForm = form(this.saisieConfirmation);
  /** La suppression n'est possible qu'une fois son nombre de bulletins retapé à l'identique. */
  readonly confirmationValide = computed(() => {
    const suppression = this.suppression();
    return suppression !== null && this.saisieConfirmation().nombre.trim() === String(suppression.nombre);
  });

  /** Demande de rechargement du niveau affiché (après une suppression), sans changement d'URL. */
  private readonly rechargement = new Subject<void>();

  /** Réponses déjà reçues, par filtres : revenir sur une même vue ne relance aucun appel. */
  private readonly cachePeriodes = new Map<string, PaiePeriodeResume[]>();
  private readonly cacheChantiers = new Map<string, PaieChantierPeriode[]>();
  private readonly cacheAnalytique = new Map<string, PaieAnalytique>();

  readonly periode = computed(() => this.filtres().periode);
  readonly niveau = computed<1 | 2 | 3 | 4>(() => {
    const filtres = this.filtres();
    if (filtres.periode === null) return 1;
    if (filtres.chantierIds.length !== 1) return 2;
    return filtres.equipeIds.length === 1 ? 4 : 3;
  });
  readonly chantier = computed(() => this.chantiers().find((c) => c.id === this.filtres().chantierIds[0]) ?? null);
  readonly equipe = computed(() => this.chantier()?.equipes.find((e) => e.id === this.filtres().equipeIds[0]) ?? null);

  readonly cartesMois = computed<CarteMois[]>(() => {
    const periodes = this.periodes();
    return periodes.map((resume) => {
      const precedent = periodes.find((p) => p.periode === periodePrecedente(resume.periode));
      return { resume, precedent: precedent ?? null };
    });
  });

  /** Le mois, résumé à partir de ses chantiers (après filtres) : les tuiles du niveau « chantiers ». */
  readonly resumeMois = computed(() => {
    const chantiers = this.chantiers();
    return {
      masse: this.analytique()?.kpis.masse ?? chantiers.reduce((somme, c) => somme + c.masse, 0),
      effectif: this.analytique()?.kpis.effectif ?? chantiers.reduce((somme, c) => somme + c.effectif, 0),
      stc: this.analytique()?.kpis.stc ?? chantiers.reduce((somme, c) => somme + c.stc, 0),
      stcMontant: this.analytique()?.kpis.stcMontant ?? chantiers.reduce((somme, c) => somme + c.stcMontant, 0),
      chantiers: this.analytique()?.kpis.nombreChantiers ?? chantiers.length
    };
  });

  readonly cartesChantier = computed<CarteChantier[]>(() => {
    const masseTotale = this.resumeMois().masse;
    return this.chantiers().map((chantier) => ({ chantier, part: masseTotale > 0 ? (chantier.masse / masseTotale) * 100 : 0 }));
  });

  /** Équipes du chantier, plus une ligne « Sans équipe » déduite : le total du tableau égale ainsi celui du chantier. */
  readonly lignesEquipes = computed<LigneEquipe[]>(() => {
    const chantier = this.chantier();
    if (!chantier) {
      return [];
    }
    const lignes: LigneEquipe[] = chantier.equipes.map((e) => ({
      equipeId: e.id,
      code: e.code,
      libelle: e.libelle,
      effectif: e.effectif,
      masse: e.masse,
      stc: e.stc,
      stcMontant: e.stcMontant,
      moisPrecedent: e.moisPrecedent ?? null
    }));
    const effectifSansEquipe = chantier.effectif - chantier.equipes.reduce((somme, e) => somme + e.effectif, 0);
    if (effectifSansEquipe > 0) {
      const masseSansEquipe = chantier.masse - chantier.equipes.reduce((somme, e) => somme + e.masse, 0);
      const stcSansEquipe = chantier.stc - chantier.equipes.reduce((somme, e) => somme + e.stc, 0);
      const stcMontantSansEquipe = chantier.stcMontant - chantier.equipes.reduce((somme, e) => somme + e.stcMontant, 0);
      const comparaisonSansEquipe = chantier.sansEquipeMoisPrecedent ?? null;
      lignes.push({ equipeId: null, code: '-', libelle: 'Sans équipe', effectif: effectifSansEquipe, masse: masseSansEquipe, stc: stcSansEquipe, stcMontant: stcMontantSansEquipe, moisPrecedent: comparaisonSansEquipe });
    }
    return lignes;
  });

  /** Les équipes dont le code ou le libellé contient la recherche (insensible à la casse et aux accents). */
  readonly equipesAffichees = computed(() => this.lignesEquipes().filter((ligne) => contient(ligne.code, this.saisieRecherche().terme) || contient(ligne.libelle, this.saisieRecherche().terme)));

  readonly indicateursVue = computed(() => {
    const analytique = this.analytique();
    return analytique ? this.construireIndicateurs(analytique.kpis, analytique.moisPrecedent) : [];
  });

  readonly aucunResultat = computed(() => !this.chargement() && (this.niveau() === 1
    ? this.periodes().length === 0
    : (this.analytique()?.kpis.effectif ?? 0) === 0));
  readonly chantierIntrouvable = computed(() => this.niveau() >= 3 && !this.chargement() && !this.aucunResultat() && this.chantier() === null);
  readonly equipeIntrouvable = computed(() => this.niveau() === 4 && !this.chargement() && this.chantier() !== null && this.equipe() === null);

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;
  readonly formaterVariation = formaterVariation;
  readonly formaterPart = formaterPart;
  indicateursDeCarte(carte: CarteMois): IndicateurAffiche[] {
    return this.construireIndicateurs(
      { masse: carte.resume.masse, effectif: carte.resume.nombreBulletins, stcMontant: carte.resume.stcMontant, stc: carte.resume.stc },
      carte.precedent ? { masse: carte.precedent.masse, effectif: carte.precedent.nombreBulletins, stcMontant: carte.precedent.stcMontant, stc: carte.precedent.stc } : null
    );
  }

  indicateursDeChantier(chantier: PaieChantierPeriode): IndicateurAffiche[] {
    return this.construireIndicateurs(
      { masse: chantier.masse, effectif: chantier.effectif, stcMontant: chantier.stcMontant, stc: chantier.stc },
      chantier.moisPrecedent ?? null
    );
  }

  indicateursDeLigneEquipe(ligne: LigneEquipe): IndicateurAffiche[] {
    return this.construireIndicateurs(
      { masse: ligne.masse, effectif: ligne.effectif, stcMontant: ligne.stcMontant, stc: ligne.stc },
      ligne.moisPrecedent
    );
  }

  formaterValeur(indicateur: IndicateurAffiche): string {
    return indicateur.cle === 'masse' || indicateur.cle === 'stcMontant'
      ? formaterMontant(indicateur.valeur)
      : FORMAT_ENTIER.format(indicateur.valeur);
  }

  changerPageEmployes(page: number): void {
    const actuel = this.pageEmployes();
    if (!actuel || page < 0 || page >= actuel.page.totalPages) return;
    this.employesEnChargement.set(true);
    this.paieService.search(versCriteres(this.filtres()), { page, size: actuel.page.size, sort: 'employee.nomPrenom,asc' })
      .pipe(finalize(() => this.employesEnChargement.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe((resultat) => this.pageEmployes.set(resultat));
  }

  constructor() {
    const parametres$ = this.route.queryParamMap.pipe(
      tap((params) => {
        const niveauPrecedent = this.niveau();
        this.filtres.set(lireFiltres(params));
        this.sens.set(this.niveau() >= niveauPrecedent ? 'avant' : 'arriere');
        this.reinitialiserRecherche();
      })
    );
    merge(parametres$, this.rechargement)
      .pipe(
        switchMap(() => this.chargerVue()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

  }

  reinitialiserRecherche(): void {
    this.rechercheForm().reset({ terme: '' });
  }

  private construireIndicateurs(
    courant: { masse: number; effectif: number; stcMontant: number; stc: number },
    precedent: { masse: number; effectif: number; stcMontant: number; stc: number } | null
  ): IndicateurAffiche[] {
    return (['masse', 'effectif', 'stcMontant', 'stc'] as const).map((cle) => ({
      cle,
      libelle: LIBELLES_INDICATEURS[cle],
      valeur: courant[cle],
      unite: cle === 'masse' || cle === 'stcMontant' ? 'DH' : 'personnes',
      comparaison: precedent ? this.formaterEcart(courant[cle], precedent[cle], cle) : null
    }));
  }

  private formaterEcart(courant: number, precedent: number, mesure: IndicateurPaie): string {
    const difference = courant - precedent;
    const signe = difference > 0 ? '+' : difference < 0 ? '−' : '';
    const valeur = mesure === 'masse' || mesure === 'stcMontant'
      ? formaterMontant(Math.abs(difference))
      : FORMAT_ENTIER.format(Math.abs(difference));
    const unite = mesure === 'masse' || mesure === 'stcMontant' ? 'DH' : Math.abs(difference) === 1 ? 'personne' : 'personnes';
    const pourcentage = (mesure === 'masse' || mesure === 'stcMontant') && precedent > 0
      ? ` (${formaterVariation((difference / precedent) * 100)})`
      : '';
    return `${signe}${valeur} ${unite}${pourcentage}`;
  }

  /** La suppression en groupe a sa permission propre : supprimer un bulletin (PAIE_DELETE) ne suffit pas. */
  canPurge(): boolean {
    return this.authService.hasPermission('PAIE_PURGE');
  }

  /** Suppression d'un mois : les bulletins de ce mois que comptait la carte, filtres de la barre compris (sauf le mois, qui est le sien). */
  demanderSuppressionMois(carte: CarteMois): void {
    this.demander(
      `Mois : ${libellePeriode(carte.resume.periode)}`,
      { ...versCriteres(this.filtres(), false), periode: carte.resume.periode },
      carte.resume.nombreBulletins,
      false
    );
  }

  /** Suppression d'un chantier du mois : les bulletins que comptait sa carte (ou, au niveau 3, le chantier ouvert). */
  demanderSuppressionChantier(chantier: PaieChantierPeriode): void {
    const nom = chantier.libelle ? `${chantier.code} · ${chantier.libelle}` : chantier.code;
    this.demander(
      `Chantier ${nom}, ${libellePeriode(this.periode())}`,
      { ...versCriteres(this.filtres()), chantierIds: [chantier.id] },
      chantier.effectif,
      this.niveau() === 3
    );
  }

  /** Suppression d'une équipe du chantier ouvert. Les bulletins sans équipe ne se suppriment pas ainsi : l'API ne sait pas les cibler. */
  demanderSuppressionEquipe(ligne: LigneEquipe): void {
    const chantier = this.chantier();
    if (ligne.equipeId === null || !chantier) {
      return;
    }
    this.demander(
      `Équipe ${ligne.code} · ${ligne.libelle}, chantier ${chantier.code}, ${libellePeriode(this.periode())}`,
      { ...versCriteres(this.filtres()), equipeIds: [ligne.equipeId] },
      ligne.effectif,
      false
    );
  }

  annulerSuppression(): void {
    if (!this.suppressionEnCours()) {
      this.suppression.set(null);
      this.viderConfirmation();
    }
  }

  confirmerSuppression(): void {
    const suppression = this.suppression();
    if (!suppression || !this.confirmationValide() || this.suppressionEnCours()) {
      return;
    }
    this.suppressionEnCours.set(true);
    this.paieService
      .supprimerGroupe({ criteres: suppression.criteres, nombreAttendu: suppression.nombre })
      .pipe(finalize(() => this.suppressionEnCours.set(false)))
      .subscribe({
        next: (resultat) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Bulletins supprimés',
            detail: `${resultat.supprimes} bulletin(s) supprimé(s) — ${suppression.cible}`,
            life: 6000
          });
          this.suppression.set(null);
          this.viderConfirmation();
          this.apresSuppression(suppression);
        }
      });
  }

  /** Délai d'apparition d'un élément dans la cascade ; plafonné pour que la dernière carte d'une longue liste ne tarde pas. */
  delaiCascade(indice: number): number {
    return Math.min(indice, DELAI_CASCADE_MAX_RANG) * DELAI_CASCADE_MS;
  }

  private viderConfirmation(): void {
    this.confirmationForm().reset({ nombre: '' });
  }

  private demander(cible: string, criteres: PaieSearchCriteria, nombre: number, remonterApres: boolean): void {
    this.viderConfirmation();
    this.suppression.set({ cible, criteres, nombre, filtres: this.decrireFiltres(criteres), remonterApres });
  }

  /** Les filtres qui restreignent le groupe, hors le mois et le groupe visé eux-mêmes — à relire avant de confirmer. */
  private decrireFiltres(criteres: PaieSearchCriteria): string[] {
    const lignes: string[] = [];
    if (criteres.nomPrenom) {
      lignes.push(`Nom et prénom contient « ${criteres.nomPrenom} »`);
    }
    if (criteres.cin) {
      lignes.push(`CIN contient « ${criteres.cin} »`);
    }
    const nombre = (ids: number[] | undefined): number => ids?.length ?? 0;
    if (nombre(criteres.fonctionIds) > 0) {
      lignes.push(`${nombre(criteres.fonctionIds)} fonction(s) sélectionnée(s)`);
    }
    if (nombre(criteres.chantierIds) > 1) {
      lignes.push(`${nombre(criteres.chantierIds)} chantiers sélectionnés`);
    }
    if (nombre(criteres.equipeIds) > 1) {
      lignes.push(`${nombre(criteres.equipeIds)} équipes sélectionnées`);
    }
    return lignes;
  }

  /** Les réponses gardées ne valent plus rien : on les vide et on recharge ; le chantier ouvert supprimé, on remonte aux chantiers. */
  private apresSuppression(suppression: Suppression): void {
    this.cachePeriodes.clear();
    this.cacheChantiers.clear();
    this.cacheAnalytique.clear();
    if (suppression.remonterApres) {
      const queryParams = this.niveau() === 4 ? { equipeIds: null } : { chantierIds: null, equipeIds: null };
      void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
    } else {
      this.rechargement.next();
    }
  }

  private chargerVue(): Observable<unknown> {
    if (this.niveau() === 1) {
      this.analytique.set(null);
      this.chantiers.set([]);
      this.pageEmployes.set(null);
      return this.chargerMois();
    }

    const criteres = versCriteres(this.filtres());
    const cle = JSON.stringify(criteres);
    const analytique$ = this.cacheAnalytique.has(cle)
      ? of(this.cacheAnalytique.get(cle)!)
      : this.paieService.analyser(criteres);
    const chantiers$ = this.cacheChantiers.has(cle)
      ? of(this.cacheChantiers.get(cle)!)
      : this.paieService.rechercherChantiers(criteres);
    const pageVide: Page<Paie> = { content: [], page: { size: 12, number: 0, totalElements: 0, totalPages: 0 } };
    const employes$ = this.niveau() === 4
      ? this.paieService.search(criteres, { page: 0, size: 12, sort: 'employee.nomPrenom,asc' })
      : of(pageVide);

    this.chargement.set(true);
    return forkJoin({ analytique: analytique$, chantiers: chantiers$, employes: employes$ }).pipe(
      tap(({ analytique, chantiers, employes }) => {
        this.cacheAnalytique.set(cle, analytique);
        this.cacheChantiers.set(cle, chantiers);
        this.analytique.set(analytique);
        this.chantiers.set(chantiers);
        this.pageEmployes.set(this.niveau() === 4 ? employes : null);
      }),
      finalize(() => this.chargement.set(false))
    );
  }

  /** Niveau 1 : les mois qui ont de la paie sur le périmètre filtré (le mois des filtres n'a pas de sens ici). */
  private chargerMois(): Observable<unknown> {
    const criteres = versCriteres(this.filtres(), false);
    const cle = JSON.stringify(criteres);
    const enCache = this.cachePeriodes.get(cle);
    if (enCache) {
      this.periodes.set(enCache);
      this.chargement.set(false);
      return EMPTY;
    }
    this.chargement.set(true);
    return this.paieService.rechercherPeriodes(criteres).pipe(
      tap((periodes) => {
        this.cachePeriodes.set(cle, periodes);
        this.periodes.set(periodes);
      }),
      finalize(() => this.chargement.set(false))
    );
  }

}
