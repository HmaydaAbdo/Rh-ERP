import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { AUCUN_FILTRE, PaieFiltres, lireFiltres, versParametres } from '../filtres/paie-filtres';
import { PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { PaieService } from '../services/paie.service';
import { PaieVueSwitcherComponent } from '../vue-switcher/paie-vue-switcher.component';

/**
 * Coque des trois vues de la paie (tabulaire, cartes, analytique) : le titre, le sélecteur de vue et la barre de filtres,
 * une seule fois pour toutes. Les filtres sont dans l'URL (voir `filtres/paie-filtres.ts`) : la barre les écrit, chaque
 * vue les lit — ce composant ne garde aucun état partagé de plus. Les écrans de saisie (`/paie/new`, `/paie/:id`…) ne
 * passent pas par lui.
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

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltres(params)));
  }

  /** Les filtres deviennent l'URL de la vue courante (sans empiler l'historique à chaque saisie) ; ce sont les vues qui réagissent. */
  appliquer(filtres: PaieFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: versParametres(filtres) });
  }

  /** À chaque changement de vue : un import a pu ajouter un mois depuis la dernière fois. */
  chargerPeriodes(): void {
    this.paieService.listerPeriodes().subscribe((periodes) => this.periodes.set(periodes.map((p) => p.periode)));
  }
}
