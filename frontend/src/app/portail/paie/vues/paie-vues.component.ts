import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { PaieActionsComponent } from '../actions/paie-actions.component';
import { AUCUN_FILTRE, lireFiltres, PaieFiltres, versParametres } from '../filtres/paie-filtres';
import { PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { PaieService } from '../services/paie.service';
import { PaieVueSwitcherComponent } from '../vue-switcher/paie-vue-switcher.component';

/**
 * Coque des trois vues de la paie (tabulaire, cartes, analytique) : le titre, le sélecteur de vue, les actions (Exporter,
 * Importer, Nouveau bulletin — à droite, au niveau du titre et des onglets) et la barre de filtres,
 * une seule fois pour toutes — la même barre, entièrement visible, dans les trois vues (les Cartes y ajoutent leur fil de
 * navigation). Les filtres sont dans l'URL (voir `filtres/paie-filtres.ts`) : la barre les écrit, chaque vue les lit — ce composant ne garde aucun état partagé de plus. Le sélecteur de vue
 * conserve les paramètres d'URL pour garder le même périmètre entre Cartes, Tabulaire et Analytique. Les écrans de saisie
 * (`/paie/new`, `/paie/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-paie-vues',
  imports: [RouterOutlet, PaieVueSwitcherComponent, PaieActionsComponent, PaieFiltresComponent],
  templateUrl: './paie-vues.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-vues.component.scss'
})
export class PaieVuesComponent {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Mois qui contiennent de la paie, pour griser les autres dans la barre. */
  protected readonly periodes = signal<string[]>([]);
  protected readonly filtres = signal<PaieFiltres>(AUCUN_FILTRE);
  /** L'analytique a besoin d'un mois : la barre ne propose pas de l'effacer. */
  protected readonly moisRequis = signal(false);
  /** Les Cartes ajoutent à la barre un fil de navigation (mois, chantier). */
  protected readonly cartes = signal(false);
  /** Faux le temps d'un tour d'écran pour recréer la vue affichée (voir `rafraichirVue`). */
  protected readonly vueAffichee = signal(true);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltres(params)));
  }

  /** Les filtres deviennent l'URL de la vue courante (sans empiler l'historique à chaque saisie) ; ce sont les vues qui réagissent. */
  protected appliquer(filtres: PaieFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: versParametres(filtres) });
  }

  /** Après un import : la vue affichée est recréée, elle recharge donc ses données (et les mois de la barre, voir
   * `surActivation`) sans que chaque vue ait à écouter l'import. */
  protected rafraichirVue(): void {
    this.vueAffichee.set(false);
    setTimeout(() => this.vueAffichee.set(true));
  }

  /** À chaque changement de vue : un import a pu ajouter un mois depuis la dernière fois. */
  protected surActivation(): void {
    const vue = this.route.firstChild?.snapshot.data['vue'];
    this.moisRequis.set(vue === 'analytique');
    this.cartes.set(vue === 'cartes');
    this.paieService.listerPeriodes().subscribe((periodes) => this.periodes.set(periodes.map((p) => p.periode)));
  }
}
