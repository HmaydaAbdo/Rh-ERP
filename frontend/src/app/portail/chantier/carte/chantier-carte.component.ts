import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { MessageComponent } from '@shared/ui/message/message.component';
import { Map as CarteMapLibre, NavigationControl } from 'maplibre-gl';

import { ThemeService } from '../../../core/theme/theme.service';
import { CARTE_CONFIG } from './carte.config';
import { SOURCE_DU_FOND, creerStyle, optionsDeVue, preparerMapLibre } from './fond-de-carte';

let compteur = 0;

/**
 * Carte du Maroc : le fond seulement, sans donnée de chantier pour l'instant. Composant « bête » : il ne connaît ni la page,
 * ni les droits, ni l'origine des chantiers. Il crée la carte quand son conteneur existe, la redessine au changement de thème,
 * la suit quand son conteneur change de taille, signale un fond introuvable et détruit la carte à sa destruction.
 *
 * Styles sans encapsulation : MapLibre crée ses propres éléments (contrôles, mention légale) hors du gabarit Angular.
 */
@Component({
  selector: 'app-chantier-carte',
  imports: [MessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './chantier-carte.component.html',
  styleUrl: './chantier-carte.component.scss'
})
export class ChantierCarteComponent {
  private readonly config = inject(CARTE_CONFIG);
  private readonly theme = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly conteneur = viewChild.required<ElementRef<HTMLElement>>('conteneur');

  private carte?: CarteMapLibre;
  private themeAffiche = this.theme.theme();

  protected readonly idAide = `chantier-carte-aide-${compteur++}`;
  /** Vrai quand l'archive du fond est introuvable ou illisible : la carte reste vide et le dit. */
  readonly fondIndisponible = signal(false);

  constructor() {
    afterNextRender(() => this.creerCarte());

    effect(() => {
      const theme = this.theme.theme();
      if (this.carte && theme !== this.themeAffiche) {
        this.themeAffiche = theme;
        this.carte.setStyle(creerStyle(this.config, theme, this.document.baseURI));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.observateur?.disconnect();
      this.carte?.remove();
    });
  }

  private observateur?: ResizeObserver;

  private creerCarte(): void {
    const base = this.document.baseURI;
    preparerMapLibre(base);

    const carte = new CarteMapLibre({
      container: this.conteneur().nativeElement,
      style: creerStyle(this.config, this.themeAffiche, base),
      attributionControl: { compact: true },
      ...optionsDeVue(this.config)
    });
    carte.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    carte.on('error', (evenement) => {
      if ((evenement as { sourceId?: string }).sourceId === SOURCE_DU_FOND) {
        this.fondIndisponible.set(true);
      }
    });
    carte.on('sourcedata', (evenement) => {
      if (evenement.sourceId === SOURCE_DU_FOND && evenement.isSourceLoaded) {
        this.fondIndisponible.set(false);
      }
    });

    // MapLibre suit la fenêtre ; la page, elle, peut changer la taille du conteneur sans changer celle de la fenêtre (menu, panneau).
    this.observateur = new ResizeObserver(() => carte.resize());
    this.observateur.observe(this.conteneur().nativeElement);
    this.carte = carte;
  }
}
