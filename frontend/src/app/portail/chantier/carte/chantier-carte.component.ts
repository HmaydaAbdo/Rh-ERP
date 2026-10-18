import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { MessageComponent } from '@shared/ui/message/message.component';
import {
  Map as CarteMapLibre,
  FullscreenControl,
  GeolocateControl,
  NavigationControl,
  Popup,
  ScaleControl,
  type IControl,
  type MapLayerMouseEvent
} from 'maplibre-gl';

import { ThemeService, type Theme } from '../../../core/theme/theme.service';
import { CARTE_CONFIG } from './carte.config';
import {
  AFFICHAGE_PAR_DEFAUT,
  SOURCE_DU_FOND,
  SOURCE_DU_RELIEF,
  SOURCE_SATELLITE,
  TUILE_ABSENTE,
  creerStyle,
  optionsDeVue,
  preparerMapLibre,
  territoire,
  type Affichage,
  type TypeDeFond
} from './fond-de-carte';

let compteur = 0;

/** Couches dont un élément nommé peut être désigné : un clic ouvre une fiche avec son nom. */
const COUCHES_NOMMEES = ['pois', 'places_locality', 'places_subplace', 'places_region', 'water_label_lakes', 'earth_label_islands'];

/** Inclinaison au-delà de laquelle la vue est considérée en 3D (les gestes laissent souvent quelques degrés). */
const SEUIL_VUE_3D = 5;

/** Message affiché pour chaque source indisponible, du plus grave au moins grave. */
const MESSAGES_SOURCE: Readonly<Record<string, string>> = {
  [SOURCE_DU_FOND]: "Le fond de carte n'est pas disponible pour le moment. Prévenez l'administrateur de l'application.",
  [SOURCE_SATELLITE]: "L'imagerie satellite n'est pas disponible pour le moment. Le plan reste utilisable.",
  [SOURCE_DU_RELIEF]: "Le relief n'est pas disponible pour le moment. Prévenez l'administrateur de l'application."
};

/** Contrôle MapLibre dont le contenu est un élément du gabarit Angular (ses liaisons restent actives une fois déplacé). */
class ControleDuGabarit implements IControl {
  constructor(private readonly element: HTMLElement) {}

  onAdd(): HTMLElement {
    return this.element;
  }

  onRemove(): void {
    this.element.remove();
  }
}

/**
 * Carte du monde, ouverte sur le Maroc : le fond seulement, sans donnée de chantier pour l'instant. Composant « bête » : il ne connaît ni la page,
 * ni les droits, ni l'origine des chantiers. Il crée la carte quand son conteneur existe, la redessine au changement de thème
 * ou d'affichage (plan ou satellite, relief), suit son conteneur quand il change de taille, signale une source introuvable et
 * détruit la carte à sa destruction.
 *
 * Styles sans encapsulation : MapLibre crée ses propres éléments (contrôles, mention légale, fiches) hors du gabarit Angular.
 */
@Component({
  selector: 'app-chantier-carte',
  imports: [IconComponent, MessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './chantier-carte.component.html',
  styleUrl: './chantier-carte.component.scss'
})
export class ChantierCarteComponent {
  private readonly config = inject(CARTE_CONFIG);
  private readonly theme = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly conteneur = viewChild.required<ElementRef<HTMLElement>>('conteneur');
  private readonly outils = viewChild.required<ElementRef<HTMLElement>>('outils');

  private carte?: CarteMapLibre;
  private observateur?: ResizeObserver;
  /** Thème et affichage du style en place : un changement de l'un ou de l'autre redessine la carte. */
  private styleAffiche?: { theme: Theme; affichage: Affichage };

  protected readonly idAide = `chantier-carte-aide-${compteur++}`;

  /** Ce que l'utilisateur a choisi d'afficher. */
  readonly affichage = signal<Affichage>(AFFICHAGE_PAR_DEFAUT);
  /** Vrai quand la carte est inclinée. */
  readonly vue3d = signal(false);
  /** Sources introuvables ou illisibles ; la carte affiche le reste et le dit. */
  readonly sourcesIndisponibles = signal<ReadonlySet<string>>(new Set());
  /** Message de la source indisponible la plus grave, s'il y en a une. */
  protected readonly messageErreur = computed(() => {
    const indisponibles = this.sourcesIndisponibles();
    const source = Object.keys(MESSAGES_SOURCE).find((id) => indisponibles.has(id));
    return source ? MESSAGES_SOURCE[source] : undefined;
  });

  constructor() {
    afterNextRender(() => this.creerCarte());

    effect(() => {
      const theme = this.theme.theme();
      const affichage = this.affichage();
      if (this.carte && (theme !== this.styleAffiche?.theme || affichage !== this.styleAffiche.affichage)) {
        this.styleAffiche = { theme, affichage };
        this.carte.setStyle(creerStyle(this.config, theme, this.document.baseURI, affichage));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.observateur?.disconnect();
      this.carte?.remove();
    });
  }

  protected choisirFond(fond: TypeDeFond): void {
    this.affichage.update((affichage) => (affichage.fond === fond ? affichage : { ...affichage, fond }));
  }

  protected basculerRelief(): void {
    this.affichage.update((affichage) => ({ ...affichage, relief: !affichage.relief }));
    this.oublier(SOURCE_DU_RELIEF);
  }

  /** Incline la carte (relief et bâtiments en volume) ou la remet à plat, vue du nord. */
  protected basculerVue3d(): void {
    if (this.vue3d()) {
      this.carte?.easeTo({ pitch: 0, bearing: 0 });
    } else {
      this.carte?.easeTo({ pitch: this.config.inclinaison3d });
    }
  }

  /** Revient au Maroc entier, à plat. */
  protected vueDEnsemble(): void {
    this.carte?.fitBounds(territoire(this.config), { padding: this.config.margeDeVuePx, pitch: 0, bearing: 0 });
  }

  private creerCarte(): void {
    const base = this.document.baseURI;
    preparerMapLibre(this.config, base);

    this.styleAffiche = { theme: this.theme.theme(), affichage: this.affichage() };
    const carte = new CarteMapLibre({
      container: this.conteneur().nativeElement,
      style: creerStyle(this.config, this.styleAffiche.theme, base, this.styleAffiche.affichage),
      attributionControl: { compact: true },
      // Le fondu des libellés retarde la perception du premier rendu ; les tuiles restent chargées par le worker.
      fadeDuration: 0,
      ...optionsDeVue(this.config)
    });
    carte.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    carte.addControl(new ControleDuGabarit(this.outils().nativeElement), 'top-right');
    carte.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, fitBoundsOptions: { maxZoom: 16 } }), 'top-right');
    carte.addControl(new FullscreenControl({ container: this.hote.nativeElement }), 'top-right');
    carte.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');

    carte.on('error', (evenement) => {
      const source = (evenement as { sourceId?: string }).sourceId;
      // Une tuile absente de l'archive n'est pas une panne : MapLibre affiche la tuile parente (voir TUILE_ABSENTE).
      if (source && source in MESSAGES_SOURCE && evenement.error?.message !== TUILE_ABSENTE) {
        this.sourcesIndisponibles.update((sources) => new Set(sources).add(source));
      }
    });
    carte.on('sourcedata', (evenement) => {
      if (evenement.isSourceLoaded) {
        this.oublier(evenement.sourceId);
      }
    });
    carte.on('pitchend', () => this.vue3d.set(carte.getPitch() > SEUIL_VUE_3D));

    for (const couche of COUCHES_NOMMEES) {
      carte.on('click', couche, (evenement) => this.ouvrirFiche(carte, evenement));
      carte.on('mouseenter', couche, () => (carte.getCanvas().style.cursor = 'pointer'));
      carte.on('mouseleave', couche, () => (carte.getCanvas().style.cursor = ''));
    }

    // MapLibre suit la fenêtre ; la page, elle, peut changer la taille du conteneur sans changer celle de la fenêtre (menu, panneau).
    this.observateur = new ResizeObserver(() => carte.resize());
    this.observateur.observe(this.conteneur().nativeElement);
    this.carte = carte;
  }

  private oublier(source: string): void {
    if (this.sourcesIndisponibles().has(source)) {
      this.sourcesIndisponibles.update((sources) => {
        const restantes = new Set(sources);
        restantes.delete(source);
        return restantes;
      });
    }
  }

  /** Fiche d'un lieu : son nom, en texte (jamais en HTML : le nom vient d'OpenStreetMap). */
  private ouvrirFiche(carte: CarteMapLibre, evenement: MapLayerMouseEvent): void {
    const lieu = evenement.features?.[0];
    const nom = lieu?.properties[`name:${this.config.langue}`] ?? lieu?.properties['name'];
    if (!lieu || typeof nom !== 'string') {
      return;
    }
    const fiche = this.document.createElement('p');
    fiche.className = 'chantier-carte__fiche';
    fiche.textContent = nom;
    new Popup({ closeButton: false, maxWidth: '18rem', offset: 12 }).setLngLat(evenement.lngLat).setDOMContent(fiche).addTo(carte);
  }
}
