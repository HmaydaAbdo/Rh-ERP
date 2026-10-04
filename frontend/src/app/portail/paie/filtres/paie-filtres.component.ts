import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { debounceTime } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { MonthPickerComponent } from '../../../shared/components/month-picker/month-picker.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { libellePeriode } from '../paie-format';
import { AUCUN_FILTRE, PaieFiltres } from './paie-filtres';

const DEBOUNCE_FILTRES_MS = 300;

/**
 * Barre de filtres commune aux trois vues de la paie (tabulaire, cartes, analytique) : le mois (facultatif — vide, « tous
 * les mois » — avec des flèches vers le mois précédent / suivant qui contient de la paie et une grille de mois dans un
 * panneau), nom et prénom, CIN, chantiers, fonctions et équipes. Le composant n'a pas d'état propre : la valeur vient de
 * l'extérieur (`value`), chaque changement est émis (`valueChange`, les saisies après un court délai) — c'est la page qui
 * décide quoi en faire (ici, la mettre dans l'URL).
 */
@Component({
  selector: 'app-paie-filtres',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, OverlayPanelModule, MonthPickerComponent, LazySelectComponent],
  templateUrl: './paie-filtres.component.html',
  styleUrl: './paie-filtres.component.scss'
})
export class PaieFiltresComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly chantierReferenceService = inject(ChantierReferenceService);
  readonly functionReferenceService = inject(FunctionReferenceService);
  readonly equipeReferenceService = inject(EquipeReferenceService);

  readonly periode = signal<string | null>(null);
  readonly disponibles = signal<string[]>([]);

  /** Mois qui contiennent de la paie, du plus récent au plus ancien. */
  @Input() set periodes(periodes: string[]) {
    this.disponibles.set(periodes);
  }

  @Input() set value(filtres: PaieFiltres) {
    this.periode.set(filtres.periode);
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

  @Output() readonly valueChange = new EventEmitter<PaieFiltres>();

  readonly formulaire = this.fb.group({
    nomPrenom: [''],
    cin: [''],
    chantierIds: [[] as number[]],
    fonctionIds: [[] as number[]],
    equipeIds: [[] as number[]]
  });

  readonly libelle = computed(() => libellePeriode(this.periode()) || 'Tous les mois');
  readonly plusRecent = computed(() => this.voisin(-1));
  readonly plusAncien = computed(() => this.voisin(1));

  ngOnInit(): void {
    this.formulaire.valueChanges.pipe(debounceTime(DEBOUNCE_FILTRES_MS), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.emettre());
  }

  /** Choisit un mois ; `null` revient à « tous les mois ». */
  choisir(periode: string | null): void {
    this.periode.set(periode);
    this.emettre();
  }

  reinitialiser(): void {
    this.formulaire.reset({ ...AUCUN_FILTRE }, { emitEvent: false });
    this.periode.set(null);
    this.emettre();
  }

  aDesFiltres(): boolean {
    const valeur = this.formulaire.getRawValue();
    return (
      this.periode() !== null ||
      Boolean(valeur.nomPrenom?.trim()) ||
      Boolean(valeur.cin?.trim()) ||
      [valeur.chantierIds, valeur.fonctionIds, valeur.equipeIds].some((ids) => (ids?.length ?? 0) > 0)
    );
  }

  /** Le mois contigu dans la liste des mois disponibles (`decalage` 1 : plus ancien, -1 : plus récent), ou `null`. */
  private voisin(decalage: number): string | null {
    const periodes = this.disponibles();
    const indice = periodes.indexOf(this.periode() ?? '');
    return indice < 0 ? null : (periodes[indice + decalage] ?? null);
  }

  private emettre(): void {
    const valeur = this.formulaire.getRawValue();
    this.valueChange.emit({
      periode: this.periode(),
      nomPrenom: valeur.nomPrenom ?? '',
      cin: valeur.cin ?? '',
      chantierIds: valeur.chantierIds ?? [],
      fonctionIds: valeur.fonctionIds ?? [],
      equipeIds: valeur.equipeIds ?? []
    });
  }
}
