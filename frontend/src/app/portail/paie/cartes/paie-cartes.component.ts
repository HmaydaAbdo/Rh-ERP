import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, EMPTY, finalize, merge, Observable, Subject, switchMap, tap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import { ColumnState } from '../../../shared/table/table-columns';
import { contient } from '../../../shared/text/recherche';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { TableCellDirective, TableComponent, TableFooterDirective, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { lireFiltres, PaieFiltres, versCriteres } from '../filtres/paie-filtres';
import { PaieChantierPeriode, PaiePeriodeResume, PaieSearchCriteria } from '../models/paie.model';
import { formaterMontant, formaterPart, formaterVariation, libellePeriode, periodePrecedente } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { NotificationService } from '@shared/feedback/feedback.service';

const DEBOUNCE_RECHERCHE_MS = 300;
const DELAI_CASCADE_MS = 50;
const DELAI_CASCADE_MAX_RANG = 12;

/** Un mois affiché en carte, avec l'évolution de sa masse par rapport au mois contigu (absente si ce mois n'a pas de paie). */
interface CarteMois {
  resume: PaiePeriodeResume;
  variation: number | null;
}

interface CarteChantier {
  chantier: PaieChantierPeriode;
  /** Part de la masse du mois, en pourcentage. */
  part: number;
}

/** Une ligne du tableau des équipes d'un chantier ; `code` vaut `-` et `equipeId` est nul pour les bulletins sans équipe. */
interface LigneEquipe {
  equipeId: number | null;
  code: string;
  libelle: string;
  effectif: number;
  masse: number;
  /** Part de la masse du chantier, en pourcentage. */
  part: number;
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
 * Vue « Cartes » de la paie, en trois niveaux de descente : cartes par mois, puis cartes par chantier du mois, puis
 * tableau des équipes du chantier. **Descendre, c'est filtrer** : le niveau se déduit des filtres de la barre commune
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
    ReactiveFormsModule,
    RouterLink,
    ColumnChooserComponent,
    CountUpDirective,
    IconComponent,
    ButtonComponent,
    DialogComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective,
    TableFooterDirective
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

  readonly columns = new ColumnState([
    { field: 'code', header: 'Équipe', cellClass: 'font-semibold' },
    { field: 'libelle', header: 'Libellé' },
    { field: 'effectif', header: 'Effectif', align: 'text-right' },
    { field: 'masse', header: 'Masse (DH)', align: 'text-right', cellClass: 'font-bold' },
    { field: 'part', header: 'Part du chantier', align: 'text-right' }
  ]);

  readonly filtres = signal<PaieFiltres>(lireFiltres(this.route.snapshot.queryParamMap));
  /** Sens du dernier changement de niveau : oriente le glissement de l'animation (vers l'avant en descendant). */
  readonly sens = signal<'avant' | 'arriere'>('avant');
  readonly chargement = signal(true);
  readonly periodes = signal<PaiePeriodeResume[]>([]);
  readonly chantiers = signal<PaieChantierPeriode[]>([]);

  readonly rechercheEquipe = new FormControl('', { nonNullable: true });
  private readonly termeEquipe = signal('');

  readonly suppression = signal<Suppression | null>(null);
  readonly suppressionEnCours = signal(false);
  readonly confirmation = new FormControl('', { nonNullable: true });
  private readonly confirmationSaisie = signal('');
  /** La suppression n'est possible qu'une fois son nombre de bulletins retapé à l'identique. */
  readonly confirmationValide = computed(() => {
    const suppression = this.suppression();
    return suppression !== null && this.confirmationSaisie().trim() === String(suppression.nombre);
  });

  /** Demande de rechargement du niveau affiché (après une suppression), sans changement d'URL. */
  private readonly rechargement = new Subject<void>();

  /** Réponses déjà reçues, par filtres : revenir sur une même vue ne relance aucun appel. */
  private readonly cachePeriodes = new Map<string, PaiePeriodeResume[]>();
  private readonly cacheChantiers = new Map<string, PaieChantierPeriode[]>();

  readonly periode = computed(() => this.filtres().periode);
  readonly niveau = computed<1 | 2 | 3>(() => (this.periode() === null ? 1 : this.filtres().chantierIds.length === 1 ? 3 : 2));
  readonly chantier = computed(() => this.chantiers().find((c) => c.id === this.filtres().chantierIds[0]) ?? null);

  readonly cartesMois = computed<CarteMois[]>(() => {
    const periodes = this.periodes();
    return periodes.map((resume) => {
      const precedent = periodes.find((p) => p.periode === periodePrecedente(resume.periode));
      const variation = precedent && precedent.masse > 0 ? ((resume.masse - precedent.masse) / precedent.masse) * 100 : null;
      return { resume, variation };
    });
  });

  /** Le mois, résumé à partir de ses chantiers (après filtres) : les tuiles du niveau « chantiers ». */
  readonly resumeMois = computed(() => {
    const chantiers = this.chantiers();
    return {
      masse: chantiers.reduce((somme, c) => somme + c.masse, 0),
      bulletins: chantiers.reduce((somme, c) => somme + c.effectif, 0),
      chantiers: chantiers.length
    };
  });

  readonly cartesChantier = computed<CarteChantier[]>(() => {
    const masseTotale = this.resumeMois().masse;
    return this.chantiers().map((chantier) => ({ chantier, part: masseTotale > 0 ? (chantier.masse / masseTotale) * 100 : 0 }));
  });

  /** Part de la masse du mois portée par le chantier ouvert, en pourcentage. */
  readonly partDuMois = computed(() => {
    const masseTotale = this.resumeMois().masse;
    return masseTotale > 0 ? ((this.chantier()?.masse ?? 0) / masseTotale) * 100 : 0;
  });

  /** Équipes du chantier, plus une ligne « Sans équipe » déduite : le total du tableau égale ainsi celui du chantier. */
  readonly lignesEquipes = computed<LigneEquipe[]>(() => {
    const chantier = this.chantier();
    if (!chantier) {
      return [];
    }
    const part = (masse: number): number => (chantier.masse > 0 ? (masse / chantier.masse) * 100 : 0);
    const lignes: LigneEquipe[] = chantier.equipes.map((e) => ({
      equipeId: e.id,
      code: e.code,
      libelle: e.libelle,
      effectif: e.effectif,
      masse: e.masse,
      part: part(e.masse)
    }));
    const effectifSansEquipe = chantier.effectif - chantier.equipes.reduce((somme, e) => somme + e.effectif, 0);
    if (effectifSansEquipe > 0) {
      const masseSansEquipe = chantier.masse - chantier.equipes.reduce((somme, e) => somme + e.masse, 0);
      lignes.push({ equipeId: null, code: '-', libelle: 'Sans équipe', effectif: effectifSansEquipe, masse: masseSansEquipe, part: part(masseSansEquipe) });
    }
    return lignes;
  });

  /** Les équipes dont le code ou le libellé contient la recherche (insensible à la casse et aux accents). */
  readonly equipesAffichees = computed(() => this.lignesEquipes().filter((ligne) => contient(ligne.code, this.termeEquipe()) || contient(ligne.libelle, this.termeEquipe())));

  /** Aucun mois (niveau 1) ou aucun chantier (niveaux 2 et 3) ne correspond aux filtres. */
  readonly aucunResultat = computed(() => !this.chargement() && (this.niveau() === 1 ? this.periodes().length === 0 : this.chantiers().length === 0));
  readonly chantierIntrouvable = computed(() => this.niveau() === 3 && !this.chargement() && !this.aucunResultat() && this.chantier() === null);

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;
  readonly formaterVariation = formaterVariation;
  readonly formaterPart = formaterPart;

  constructor() {
    const parametres$ = this.route.queryParamMap.pipe(
      tap((params) => {
        const niveauPrecedent = this.niveau();
        this.filtres.set(lireFiltres(params));
        this.sens.set(this.niveau() >= niveauPrecedent ? 'avant' : 'arriere');
        this.rechercheEquipe.setValue('', { emitEvent: false });
      })
    );
    merge(parametres$, this.rechargement)
      .pipe(
        switchMap(() => (this.niveau() === 1 ? this.chargerMois() : this.chargerChantiers())),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.confirmation.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((saisie) => this.confirmationSaisie.set(saisie));

    this.rechercheEquipe.valueChanges
      .pipe(debounceTime(DEBOUNCE_RECHERCHE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((terme) => this.termeEquipe.set(terme));
  }

  /** Seule une équipe réelle s'ouvre : « Sans équipe » n'a pas d'identifiant, l'API ne sait pas filtrer sur son absence. */
  readonly ligneCliquable = (ligne: LigneEquipe): boolean => ligne.equipeId !== null;
  readonly titreLigne = (ligne: LigneEquipe): string | null => (ligne.equipeId !== null ? 'Voir les bulletins de cette équipe' : null);

  /** Clic (ou Entrée) sur une équipe : ouvre la vue tabulaire avec les mêmes filtres, plus cette équipe. Les bulletins sans
   * équipe ne s'ouvrent pas : l'API ne sait pas filtrer sur l'absence d'équipe. */
  ouvrirBulletins(ligne: LigneEquipe): void {
    if (ligne.equipeId !== null) {
      void this.router.navigate(['/paie'], { queryParams: { equipeIds: String(ligne.equipeId) }, queryParamsHandling: 'merge' });
    }
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
      this.confirmation.setValue('');
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
          this.confirmation.setValue('');
          this.apresSuppression(suppression);
        }
      });
  }

  /** Délai d'apparition d'un élément dans la cascade ; plafonné pour que la dernière carte d'une longue liste ne tarde pas. */
  delaiCascade(indice: number): number {
    return Math.min(indice, DELAI_CASCADE_MAX_RANG) * DELAI_CASCADE_MS;
  }

  effectifTotalEquipes(): number {
    return this.lignesEquipes().reduce((somme, l) => somme + l.effectif, 0);
  }

  masseTotaleEquipes(): number {
    return this.lignesEquipes().reduce((somme, l) => somme + l.masse, 0);
  }

  private demander(cible: string, criteres: PaieSearchCriteria, nombre: number, remonterApres: boolean): void {
    this.confirmation.setValue('');
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
    if (suppression.remonterApres) {
      void this.router.navigate([], { queryParams: { chantierIds: null }, queryParamsHandling: 'merge' });
    } else {
      this.rechargement.next();
    }
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

  /** Niveaux 2 et 3 : les chantiers du mois, avec leurs équipes, sur le périmètre filtré. */
  private chargerChantiers(): Observable<unknown> {
    const criteres = versCriteres(this.filtres());
    const cle = JSON.stringify(criteres);
    const enCache = this.cacheChantiers.get(cle);
    if (enCache) {
      this.chantiers.set(enCache);
      this.chargement.set(false);
      return EMPTY;
    }
    this.chargement.set(true);
    return this.paieService.rechercherChantiers(criteres).pipe(
      tap((chantiers) => {
        this.cacheChantiers.set(cle, chantiers);
        this.chantiers.set(chantiers);
      }),
      finalize(() => this.chargement.set(false))
    );
  }
}
