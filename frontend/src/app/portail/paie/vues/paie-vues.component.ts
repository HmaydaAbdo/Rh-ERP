import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { AUCUN_FILTRE, PaieFiltres, lireFiltres, versParametres } from '../filtres/paie-filtres';
import { ModeBarre, PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { PaieService } from '../services/paie.service';
import { PaieVueSwitcherComponent } from '../vue-switcher/paie-vue-switcher.component';
import { VueId, annonceChangementDeVue } from './paie-vues-annonce';

/** Durée d'affichage de la phrase qui explique le changement de vue. */
const DUREE_ANNONCE_MS = 8000;

/**
 * Coque des trois vues de la paie (tabulaire, cartes, analytique) : le titre, le sélecteur de vue et la barre de contexte,
 * une seule fois pour toutes. Les filtres sont dans l'URL (voir `filtres/paie-filtres.ts`) : la barre les écrit, chaque
 * vue les lit — ce composant ne garde aucun état partagé de plus. La barre s'adapte à la vue (navigation à valeurs uniques
 * dans les cartes, filtres multiples ailleurs) et, quand on change de vue, une phrase explique ce que le contexte devient.
 * Les écrans de saisie (`/paie/new`, `/paie/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-paie-vues',
  standalone: true,
  imports: [RouterOutlet, PaieVueSwitcherComponent, PaieFiltresComponent],
  templateUrl: './paie-vues.component.html',
  styleUrl: './paie-vues.component.scss'
})
export class PaieVuesComponent {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Mois qui contiennent de la paie, pour griser les autres dans la barre. */
  readonly periodes = signal<string[]>([]);
  readonly filtres = signal<PaieFiltres>(AUCUN_FILTRE);
  readonly vue = signal<VueId>('tabulaire');
  readonly annonce = signal<string | null>(null);

  readonly mode = computed<ModeBarre>(() => (this.vue() === 'cartes' ? 'navigation' : 'filtres'));
  /** L'analytique a besoin d'un mois : la barre ne propose pas de l'effacer. */
  readonly moisRequis = computed(() => this.vue() === 'analytique');

  private vuePrecedente: VueId | null = null;
  private minuteur: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltres(params)));
    this.destroyRef.onDestroy(() => clearTimeout(this.minuteur));
  }

  /** Les filtres deviennent l'URL de la vue courante (sans empiler l'historique à chaque saisie) ; ce sont les vues qui réagissent. */
  appliquer(filtres: PaieFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: versParametres(filtres) });
  }

  /** À chaque changement de vue : un import a pu ajouter un mois depuis la dernière fois, et le contexte se traduit — on l'explique. */
  surActivation(): void {
    const vue = (this.route.firstChild?.snapshot.data['vue'] as VueId | undefined) ?? 'tabulaire';
    const precedente = this.vuePrecedente;
    this.vuePrecedente = vue;
    this.vue.set(vue);
    this.paieService.listerPeriodes().subscribe((periodes) => this.periodes.set(periodes.map((p) => p.periode)));
    if (precedente !== null) {
      this.annoncer(annonceChangementDeVue(precedente, vue, this.filtres()));
    }
  }

  private annoncer(phrase: string | null): void {
    clearTimeout(this.minuteur);
    this.annonce.set(phrase);
    if (phrase) {
      this.minuteur = setTimeout(() => this.annonce.set(null), DUREE_ANNONCE_MS);
    }
  }
}
