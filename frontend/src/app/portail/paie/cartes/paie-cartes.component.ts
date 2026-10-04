import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { debounceTime, finalize } from 'rxjs';

import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';
import { PaieChantierPeriode, PaiePeriodeResume } from '../models/paie.model';
import { formaterMontant, libellePeriode, periodePrecedente } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { PaieVueSwitcherComponent } from '../vue-switcher/paie-vue-switcher.component';

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

/** Une ligne du tableau des équipes d'un chantier ; `code` vaut `-` pour les bulletins sans équipe. */
interface LigneEquipe {
  code: string;
  libelle: string;
  effectif: number;
  masse: number;
  /** Part de la masse du chantier, en pourcentage. */
  part: number;
}

/**
 * Vue « Cartes » de la paie, en trois niveaux de descente : cartes par mois, puis cartes par chantier du mois, puis
 * tableau des équipes du chantier. Le niveau courant est porté par l'URL (`?periode=2026-08&chantier=C168`) : retour
 * navigateur et lien direct fonctionnent. Aucune donnée propre : tout vient de `/paie/periodes` et
 * `/paie/chantiers` (voir docs/paie/README.md, « Vue Cartes »).
 */
@Component({
  selector: 'app-paie-cartes',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TableModule,
    ColumnChooserComponent,
    CountUpDirective,
    PaieVueSwitcherComponent
  ],
  templateUrl: './paie-cartes.component.html',
  styleUrl: './paie-cartes.component.scss'
})
export class PaieCartesComponent implements OnInit {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
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

  readonly periodes = signal<PaiePeriodeResume[]>([]);
  readonly periodesEnCours = signal(true);
  readonly periode = signal<string | null>(null);
  readonly chantierCode = signal<string | null>(null);
  readonly chantiers = signal<PaieChantierPeriode[]>([]);
  readonly chantiersEnCours = signal(false);
  readonly termeChantier = signal('');
  /** Sens du dernier changement de niveau : oriente le glissement de l'animation (vers l'avant en descendant). */
  readonly sens = signal<'avant' | 'arriere'>('avant');

  readonly rechercheChantier = new FormControl('', { nonNullable: true });
  readonly rechercheEquipe = new FormControl('', { nonNullable: true });

  /** Chantiers déjà chargés par mois : revenir sur un mois ne relance aucun appel. */
  private readonly chantiersParPeriode = new Map<string, PaieChantierPeriode[]>();

  readonly resume = computed(() => this.periodes().find((p) => p.periode === this.periode()) ?? null);
  readonly chantier = computed(() => this.chantiers().find((c) => c.code === this.chantierCode()) ?? null);

  readonly niveau = computed<1 | 2 | 3>(() => (this.periode() === null ? 1 : this.chantierCode() === null ? 2 : 3));

  readonly cartesMois = computed<CarteMois[]>(() => {
    const periodes = this.periodes();
    return periodes.map((resume) => {
      const precedent = periodes.find((p) => p.periode === periodePrecedente(resume.periode));
      const variation = precedent && precedent.masse > 0 ? ((resume.masse - precedent.masse) / precedent.masse) * 100 : null;
      return { resume, variation };
    });
  });

  readonly cartesChantier = computed<CarteChantier[]>(() => {
    const masseTotale = this.chantiers().reduce((somme, c) => somme + c.masse, 0);
    const terme = this.termeChantier().trim().toLowerCase();
    return this.chantiers()
      .filter((c) => !terme || c.code.toLowerCase().includes(terme) || (c.libelle ?? '').toLowerCase().includes(terme))
      .map((chantier) => ({ chantier, part: masseTotale > 0 ? (chantier.masse / masseTotale) * 100 : 0 }));
  });

  /** Part de la masse du mois portée par le chantier ouvert, en pourcentage. */
  readonly partDuMois = computed(() => {
    const masseTotale = this.chantiers().reduce((somme, c) => somme + c.masse, 0);
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
      code: e.code,
      libelle: e.libelle,
      effectif: e.effectif,
      masse: e.masse,
      part: part(e.masse)
    }));
    const effectifSansEquipe = chantier.effectif - chantier.equipes.reduce((somme, e) => somme + e.effectif, 0);
    if (effectifSansEquipe > 0) {
      const masseSansEquipe = chantier.masse - chantier.equipes.reduce((somme, e) => somme + e.masse, 0);
      lignes.push({ code: '-', libelle: 'Sans équipe', effectif: effectifSansEquipe, masse: masseSansEquipe, part: part(masseSansEquipe) });
    }
    return lignes;
  });

  readonly periodeIntrouvable = computed(() => !this.periodesEnCours() && this.periode() !== null && this.resume() === null);
  readonly chantierIntrouvable = computed(
    () => this.niveau() === 3 && !this.chantiersEnCours() && !this.periodeIntrouvable() && this.chantier() === null
  );

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;

  ngOnInit(): void {
    this.paieService
      .listerPeriodes()
      .pipe(finalize(() => this.periodesEnCours.set(false)))
      .subscribe((periodes) => this.periodes.set(periodes));

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const niveauPrecedent = this.niveau();
      this.periode.set(params.get('periode'));
      this.chantierCode.set(params.get('chantier'));
      this.sens.set(this.niveau() >= niveauPrecedent ? 'avant' : 'arriere');
      this.rechercheChantier.setValue('', { emitEvent: false });
      this.termeChantier.set('');
      this.rechercheEquipe.setValue('', { emitEvent: false });
      this.chargerChantiers();
    });

    this.rechercheChantier.valueChanges
      .pipe(debounceTime(DEBOUNCE_RECHERCHE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((terme) => this.termeChantier.set(terme));

    this.rechercheEquipe.valueChanges
      .pipe(debounceTime(DEBOUNCE_RECHERCHE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe((terme) => this.table?.filterGlobal(terme, 'contains'));
  }

  /** Variation affichée avec son signe et sa virgule française : `+3,1 %`, `-0,8 %`. */
  formaterVariation(variation: number): string {
    const arrondie = Math.round(variation * 10) / 10;
    return `${arrondie > 0 ? '+' : ''}${arrondie.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  }

  /** Délai d'apparition d'un élément dans la cascade ; plafonné pour que la dernière carte d'une longue liste ne tarde pas. */
  delaiCascade(indice: number): number {
    return Math.min(indice, DELAI_CASCADE_MAX_RANG) * DELAI_CASCADE_MS;
  }

  formaterPart(part: number): string {
    return `${part.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  }

  effectifTotalEquipes(): number {
    return this.lignesEquipes().reduce((somme, l) => somme + l.effectif, 0);
  }

  masseTotaleEquipes(): number {
    return this.lignesEquipes().reduce((somme, l) => somme + l.masse, 0);
  }

  private chargerChantiers(): void {
    const periode = this.periode();
    if (!periode) {
      this.chantiers.set([]);
      return;
    }
    const enCache = this.chantiersParPeriode.get(periode);
    if (enCache) {
      this.chantiers.set(enCache);
      return;
    }
    this.chantiers.set([]);
    this.chantiersEnCours.set(true);
    this.paieService
      .listerChantiersDeLaPeriode(periode)
      .pipe(
        finalize(() => {
          if (this.periode() === periode) {
            this.chantiersEnCours.set(false);
          }
        })
      )
      .subscribe((chantiers) => {
        this.chantiersParPeriode.set(periode, chantiers);
        if (this.periode() === periode) {
          this.chantiers.set(chantiers);
        }
      });
  }
}
