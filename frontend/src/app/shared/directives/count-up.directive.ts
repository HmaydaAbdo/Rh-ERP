import { Directive, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';

const DUREE_MS = 700;

/**
 * Affiche un nombre en l'animant depuis sa valeur précédente (0 au premier affichage) — ex. les chiffres d'un
 * résumé qui apparaissent quand on choisit un mois. Le format est celui de l'application (`fr-FR`, séparateur
 * d'espace). L'animation est supprimée si l'utilisateur a demandé moins de mouvement dans son système.
 */
@Directive({ selector: '[appCountUp]', standalone: true })
export class CountUpDirective implements OnChanges, OnDestroy {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  private affiche = 0;
  private image: number | null = null;

  @Input({ required: true }) appCountUp = 0;

  ngOnChanges(): void {
    const cible = this.appCountUp ?? 0;
    this.arreter();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.ecrire(cible);
      return;
    }
    const depart = this.affiche;
    const debut = performance.now();
    const etape = (maintenant: number): void => {
      const avancement = Math.min(1, (maintenant - debut) / DUREE_MS);
      this.ecrire(depart + (cible - depart) * (1 - Math.pow(1 - avancement, 3)));
      this.image = avancement < 1 ? requestAnimationFrame(etape) : null;
    };
    this.image = requestAnimationFrame(etape);
  }

  ngOnDestroy(): void {
    this.arreter();
  }

  private ecrire(valeur: number): void {
    this.affiche = valeur;
    this.element.nativeElement.textContent = this.format.format(Math.round(valeur));
  }

  private arreter(): void {
    if (this.image !== null) {
      cancelAnimationFrame(this.image);
      this.image = null;
    }
  }
}
