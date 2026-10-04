import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { EMPTY, Observable, debounceTime, finalize, switchMap, tap } from 'rxjs';

import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';
import { PaieFiltres, lireFiltres, versCriteres } from '../filtres/paie-filtres';
import { PaieChantierPeriode, PaiePeriodeResume } from '../models/paie.model';
import { formaterMontant, formaterPart, formaterVariation, libellePeriode, periodePrecedente } from '../paie-format';
import { PaieService } from '../services/paie.service';

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

/**
 * Vue « Cartes » de la paie, en trois niveaux de descente : cartes par mois, puis cartes par chantier du mois, puis
 * tableau des équipes du chantier. **Descendre, c'est filtrer** : le niveau se déduit des filtres de la barre commune
 * (voir `filtres/paie-filtres.ts`) — sans mois, les mois ; avec un mois, les chantiers ; avec un mois et un seul chantier,
 * ses équipes — et cliquer une carte pose le filtre correspondant dans l'URL. Retour navigateur, lien direct et barre de
 * filtres restent donc toujours d'accord. Les autres filtres (nom, CIN, fonctions, équipes, chantiers) restreignent les
 * bulletins comptés à chaque niveau. Aucune donnée propre : tout vient de `/paie/periodes/search` et
 * `/paie/chantiers/search` (voir docs/paie/README.md, « Vue Cartes »).
 */
@Component({
  selector: 'app-paie-cartes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, TableModule, ColumnChooserComponent, CountUpDirective],
  templateUrl: './paie-cartes.component.html',
  styleUrl: './paie-cartes.component.scss'
})
export class PaieCartesComponent implements OnInit {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly columns = new ColumnState([
    { field: 'code', header: 'Équipe', cellClass: 'font-semibold' },
    { field: 'libelle', header: 'Libellé' },
    { field: 'effectif', header: 'Effectif', align: 'text-right' },
    { field: 'masse', header: 'Masse (DH)', align: 'text-right', cellClass: 'font-bold' },
    { field: 'part', header: 'Part du chantier', align: 'text-right' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  @ViewChild(Table) private table?: Table;

  readonly filtres = signal<PaieFiltres>(lireFiltres(this.route.snapshot.queryParamMap));
  /** Sens du dernier changement de niveau : oriente le glissement de l'animation (vers l'avant en descendant). */
  readonly sens = signal<'avant' | 'arriere'>('avant');
  readonly chargement = signal(true);
  readonly periodes = signal<PaiePeriodeResume[]>([]);
  readonly chantiers = signal<PaieChantierPeriode[]>([]);

  readonly rechercheEquipe = new FormControl('', { nonNullable: true });

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

  /** Aucun mois (niveau 1) ou aucun chantier (niveaux 2 et 3) ne correspond aux filtres. */
  readonly aucunResultat = computed(() => !this.chargement() && (this.niveau() === 1 ? this.periodes().length === 0 : this.chantiers().length === 0));
  readonly chantierIntrouvable = computed(() => this.niveau() === 3 && !this.chargement() && !this.aucunResultat() && this.chantier() === null);

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;
  readonly formaterVariation = formaterVariation;
  readonly formaterPart = formaterPart;

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(
        tap((params) => {
          const niveauPrecedent = this.niveau();
          this.filtres.set(lireFiltres(params));
          this.sens.set(this.niveau() >= niveauPrecedent ? 'avant' : 'arriere');
          this.rechercheEquipe.setValue('', { emitEvent: false });
        }),
        switchMap(() => (this.niveau() === 1 ? this.chargerMois() : this.chargerChantiers())),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.rechercheEquipe.valueChanges
      .pipe(debounceTime(DEBOUNCE_RECHERCHE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((terme) => this.table?.filterGlobal(terme, 'contains'));
  }

  /** Clic (ou Entrée) sur une équipe : ouvre la vue tabulaire avec les mêmes filtres, plus cette équipe. Les bulletins sans
   * équipe ne s'ouvrent pas : l'API ne sait pas filtrer sur l'absence d'équipe. */
  ouvrirBulletins(ligne: LigneEquipe): void {
    if (ligne.equipeId !== null) {
      void this.router.navigate(['/paie'], { queryParams: { equipeIds: String(ligne.equipeId) }, queryParamsHandling: 'merge' });
    }
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
