import { DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, Observable, Subscription } from 'rxjs';

import { NotificationService } from '../../shared/ui/feedback/feedback.service';
import { telechargerFichier } from '../../shared/utils/telecharger-fichier';
import { lireMouvementFiltres, moisCourant, MouvementFiltres, MouvementRequete, versParametresMouvement, versRequete } from './mouvement-filtres';

/**
 * État du mois d'un domaine de mouvements (entrants ou sorties), partagé par ses trois vues : le mois et les filtres viennent de
 * l'URL, la liste du mois est chargée une seule fois par la coque (`<domaine>-vues.component.ts`, qui le fournit) puis lue par
 * les vues Tabulaire, Cartes et Analytique, et l'export PDF reprend les mêmes filtres que ce que l'écran montre. Changer d'onglet
 * ne recharge donc rien ; changer de mois ou de filtre recharge une fois pour les trois vues.
 */
export abstract class EtatMouvement<R> {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);
  private requete: Subscription | null = null;

  readonly filtres = signal<MouvementFiltres>(lireMouvementFiltres(this.route.snapshot.queryParamMap, moisCourant()));
  readonly resultat = signal<R | null>(null);
  readonly chargement = signal(false);
  readonly exportEnCours = signal(false);

  /** Clé du filtre propre au domaine dans la requête : `types` (entrants) ou `motifs` (sorties). */
  protected abstract readonly cleFiltre: 'types' | 'motifs';
  protected abstract readonly messageErreurChargement: string;
  protected abstract readonly messageErreurPdf: string;
  protected abstract appeler(requete: MouvementRequete): Observable<R>;
  protected abstract appelerPdf(requete: MouvementRequete): Observable<Blob>;
  protected abstract nomPdf(periode: string): string;

  /** À appeler une fois par le constructeur de la classe fille : suit l'URL, et recharge à chaque changement de mois ou de filtre. */
  protected suivreUrl(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const filtres = lireMouvementFiltres(params, moisCourant());
      this.filtres.set(filtres);
      this.charger(filtres);
    });
    this.destroyRef.onDestroy(() => this.requete?.unsubscribe());
  }

  /** Le mois et les filtres deviennent l'URL de l'écran ; c'est son changement qui recharge la liste. */
  appliquer(filtres: MouvementFiltres, remplacer = true): void {
    void this.router.navigate([], { replaceUrl: remplacer, queryParams: versParametresMouvement(filtres), queryParamsHandling: 'merge' });
  }

  exporter(): void {
    const filtres = this.filtres();
    this.exportEnCours.set(true);
    this.appelerPdf(versRequete(filtres, this.cleFiltre))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.exportEnCours.set(false))
      )
      .subscribe({
        next: (pdf) => telechargerFichier(pdf, this.nomPdf(filtres.periode)),
        error: () => this.notifications.add({ severity: 'error', summary: this.messageErreurPdf })
      });
  }

  private charger(filtres: MouvementFiltres): void {
    this.requete?.unsubscribe();
    this.chargement.set(true);
    this.requete = this.appeler(versRequete(filtres, this.cleFiltre))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.chargement.set(false))
      )
      .subscribe({
        next: (resultat) => this.resultat.set(resultat),
        error: () => {
          this.resultat.set(null);
          this.notifications.add({ severity: 'error', summary: this.messageErreurChargement });
        }
      });
  }
}
