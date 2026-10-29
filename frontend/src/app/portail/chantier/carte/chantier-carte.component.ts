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
  input,
  signal,
  viewChild
} from '@angular/core';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { MessageComponent } from '@shared/ui/message/message.component';
import {
  Map as CarteMapLibre,
  LngLatBounds,
  Popup,
  Marker,
  type MapLayerMouseEvent,
  type MapMouseEvent
} from 'maplibre-gl';
import { ChantierCarte, NATURE_CHANTIER_LIBELLES } from '../models/chantier.model';

import { CARTE_CONFIG } from './carte.config';
import {
  AFFICHAGE_PAR_DEFAUT,
  SOURCE_DU_FOND,
  SOURCE_DU_RELIEF,
  SOURCE_SATELLITE,
  TUILE_ABSENTE,
  creerStyle,
  lirePalettePlan,
  optionsDeVue,
  preparerMapLibre,
  type Affichage,
  type TypeDeFond
} from './fond-de-carte';

let compteur = 0;

/** Couches dont un élément nommé peut être désigné : un clic ouvre une fiche avec son nom. */
const COUCHES_NOMMEES = ['pois', 'places_locality', 'places_subplace', 'places_region', 'water_label_lakes', 'earth_label_islands'];

/** Inclinaison au-delà de laquelle la vue est considérée en 3D (les gestes laissent souvent quelques degrés). */
const SEUIL_VUE_3D = 5;

const SVG = 'http://www.w3.org/2000/svg';

/** Hauteur de l'épingle (voir `.chantier-carte__epingle`) : la fiche s'ouvre au-dessus de sa tête, pas sur sa pointe. */
const HAUTEUR_EPINGLE_PX = 40;

/** Message affiché pour chaque source indisponible, du plus grave au moins grave. */
const MESSAGES_SOURCE: Readonly<Record<string, string>> = {
  [SOURCE_DU_FOND]: "Le fond de carte n'est pas disponible pour le moment. Prévenez l'administrateur de l'application.",
  [SOURCE_SATELLITE]: "L'imagerie satellite n'est pas disponible pour le moment. Le plan reste utilisable.",
  [SOURCE_DU_RELIEF]: "Le relief n'est pas disponible pour le moment. Prévenez l'administrateur de l'application."
};

/**
 * Carte du monde, initialisée sur le Maroc puis cadrée sur les points qualifiés reçus en entrée. Composant « bête » : il ne connaît ni la page,
 * ni les droits, ni l'origine des chantiers. Il crée la carte quand son conteneur existe, conserve son style sombre malgré
 * le thème applicatif, la redessine au changement d'affichage (plan ou satellite, relief), suit son conteneur quand il change de taille, signale une source introuvable et
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
  readonly chantiers = input<readonly ChantierCarte[]>([]);
  private marqueurs: Marker[] = [];
  private readonly config = inject(CARTE_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly conteneur = viewChild.required<ElementRef<HTMLElement>>('conteneur');
  private readonly commandes = viewChild.required<ElementRef<HTMLElement>>('commandes');

  private carte?: CarteMapLibre;
  private observateur?: ResizeObserver;
  /** Affichage du style en place ; le thème cartographique reste sombre et indépendant du thème applicatif. */
  private styleAffiche?: Affichage;

  protected readonly idAide = `chantier-carte-aide-${compteur++}`;

  /** Ce que l'utilisateur a choisi d'afficher. */
  readonly affichage = signal<Affichage>(AFFICHAGE_PAR_DEFAUT);
  /** Vrai quand la carte est inclinée. */
  readonly vue3d = signal(false);
  readonly messageLocalisation = signal('');
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
      const affichage = this.affichage();
      if (this.carte && affichage !== this.styleAffiche) {
        this.styleAffiche = affichage;
        this.carte.setStyle(creerStyle(this.config, this.document.baseURI, affichage, lirePalettePlan(this.document.documentElement)));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.marqueurs.forEach((marqueur) => marqueur.remove());
      this.observateur?.disconnect();
      this.carte?.remove();
    });
    effect(() => this.afficherChantiers(this.chantiers()));
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

  /** Reprend le cadrage du filtre courant : les quatre extrêmes réels déterminent la fenêtre. */
  protected vueDEnsemble(): void {
    this.recentrerSurChantiers(this.chantiers());
  }

  protected zoomer(delta: number): void {
    const carte = this.carte;
    if (carte) { carte.zoomTo(Math.min(carte.getMaxZoom(), Math.max(carte.getMinZoom(), carte.getZoom() + delta))); }
  }

  protected orienterAuNord(): void {
    this.carte?.easeTo({ bearing: 0, pitch: 0 });
  }

  protected localiser(): void {
    this.messageLocalisation.set('');
    const geolocalisation = this.document.defaultView?.navigator.geolocation;
    if (!geolocalisation || !this.carte) {
      this.messageLocalisation.set('La localisation est indisponible sur cet appareil.');
      return;
    }
    geolocalisation.getCurrentPosition(
      ({ coords }) => this.carte?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14, pitch: 0 }),
      () => this.messageLocalisation.set('Autorisez la localisation pour centrer la carte sur votre position.'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  private creerCarte(): void {
    const base = this.document.baseURI;
    preparerMapLibre(this.config, base);

    this.styleAffiche = this.affichage();
    const carte = new CarteMapLibre({
      container: this.conteneur().nativeElement,
      style: creerStyle(this.config, base, this.styleAffiche, lirePalettePlan(this.document.documentElement)),
      attributionControl: { compact: true, customAttribution: [] },
      maplibreLogo: false,
      // Le fondu des libellés retarde la perception du premier rendu ; les tuiles restent chargées par le worker.
      fadeDuration: 0,
      ...optionsDeVue(this.config)
    });

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
    carte.on('click', (evenement) => this.ouvrirFicheVoie(carte, evenement));

    // MapLibre suit la fenêtre ; la page, elle, peut changer la taille du conteneur sans changer celle de la fenêtre (menu, panneau).
    this.observateur = new ResizeObserver(() => carte.resize());
    this.observateur.observe(this.conteneur().nativeElement);
    this.carte = carte;
    this.afficherChantiers(this.chantiers());
  }

  private afficherChantiers(chantiers: readonly ChantierCarte[]): void {
    if (!this.carte) { return; }
    this.marqueurs.forEach((marqueur) => marqueur.remove());
    // Plusieurs chantiers peuvent partager exactement le même site : une fiche les présente tous.
    const sites = new Map<string, ChantierCarte[]>();
    chantiers.forEach((chantier) => {
      const cle = `${chantier.longitude},${chantier.latitude}`;
      sites.set(cle, [...(sites.get(cle) ?? []), chantier]);
    });
    this.marqueurs = [...sites.values()].map((site) => {
      const bouton = this.document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'chantier-carte__marqueur';
      const detailSites = site.map((chantier) => `${chantier.code} · ${chantier.nom || chantier.designation}\n${NATURE_CHANTIER_LIBELLES[chantier.nature]}`).join('\n\n');
      bouton.setAttribute('aria-label', `Afficher ${detailSites.replaceAll('\n', ', ')}`);
      bouton.setAttribute('data-tooltip', detailSites);
      bouton.append(this.creerEpingle());
      const fiche = this.document.createElement('div');
      site.forEach((chantier) => {
        const code = this.document.createElement('strong');
        code.className = 'chantier-carte__fiche-code';
        code.textContent = chantier.code;
        const nom = this.document.createElement('span');
        nom.className = 'chantier-carte__fiche-nom';
        nom.textContent = chantier.nom || chantier.designation;
        const nature = this.document.createElement('p');
        nature.className = 'chantier-carte__fiche-nature';
        nature.textContent = NATURE_CHANTIER_LIBELLES[chantier.nature];
        const article = this.document.createElement('article');
        article.className = 'chantier-carte__fiche-chantier';
        article.append(code, nom, nature);
        fiche.append(article);
      });
      // La pointe de l'épingle (bas de l'élément) désigne le site, quel que soit le zoom.
      const marqueur = new Marker({ element: bouton, anchor: 'bottom' })
        .setLngLat([site[0].longitude, site[0].latitude])
        .setPopup(new Popup({ closeButton: true, offset: HAUTEUR_EPINGLE_PX }).setDOMContent(fiche))
        .addTo(this.carte!);
      return marqueur;
    });
    this.recentrerSurChantiers(chantiers);
  }

  private recentrerSurChantiers(chantiers: readonly ChantierCarte[]): void {
    const carte = this.carte;
    if (!carte || chantiers.length === 0) { return; }
    const emplacements = new Map<string, [number, number]>();
    chantiers.forEach(({ longitude, latitude }) => emplacements.set(`${longitude},${latitude}`, [longitude, latitude]));
    const points = [...emplacements.values()];
    const padding = this.margeDesCommandes();
    if (points.length === 1) {
      carte.easeTo({
        center: points[0], zoom: Math.min(14, Math.max(12, carte.getZoom())), bearing: 0, pitch: 0, padding,
        duration: this.mouvementReduit() ? 0 : 600
      });
      return;
    }
    const limites = new LngLatBounds();
    points.forEach((point) => limites.extend(point));
    carte.fitBounds(limites, { padding, maxZoom: 14, bearing: 0, pitch: 0, duration: this.mouvementReduit() ? 0 : 600 });
  }

  private mouvementReduit(): boolean {
    return this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  /** Réserve le départ de la colonne et sa largeur, sans coupler la carte au gabarit de la page. */
  private margeDesCommandes(): { top: number; right: number; bottom: number; left: number } {
    const cadre = this.conteneur().nativeElement.getBoundingClientRect();
    const commandes = this.commandes().nativeElement.getBoundingClientRect();
    const espace = 24;
    return {
      top: Math.max(this.config.margeDeVuePx, commandes.top - cadre.top + espace),
      right: this.config.margeDeVuePx,
      bottom: this.config.margeDeVuePx,
      left: Math.max(this.config.margeDeVuePx, commandes.right - cadre.left + espace)
    };
  }

  /** Épingle de localisation (tracé de l'icône Lucide `map-pin`, pleine), construite en SVG sans HTML injecté. */
  private creerEpingle(): SVGSVGElement {
    const svg = this.document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'chantier-carte__epingle');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const contour = this.document.createElementNS(SVG, 'path');
    contour.setAttribute('class', 'chantier-carte__epingle-corps');
    contour.setAttribute('d', 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0');
    const centre = this.document.createElementNS(SVG, 'circle');
    centre.setAttribute('class', 'chantier-carte__epingle-centre');
    centre.setAttribute('cx', '12');
    centre.setAttribute('cy', '10');
    centre.setAttribute('r', '3');
    svg.append(contour, centre);
    return svg;
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

  /** Les rues restent consultables même si MapLibre masque leur étiquette pour éviter les collisions. */
  private ouvrirFicheVoie(carte: CarteMapLibre, evenement: MapMouseEvent): void {
    const entites = carte.queryRenderedFeatures(evenement.point);
    const lieuNomme = entites.some((entite) => {
      if (!COUCHES_NOMMEES.includes(entite.layer.id)) { return false; }
      const nom = entite.properties?.[`name:${this.config.langue}`] ?? entite.properties?.['name'];
      return typeof nom === 'string';
    });
    if (lieuNomme) { return; }
    const voie = entites.find((entite) => {
      if (entite.layer.type !== 'line' || !entite.layer.id.startsWith('roads_')) { return false; }
      const nom = entite.properties?.[`name:${this.config.langue}`] ?? entite.properties?.['name'];
      const reference = entite.properties?.['ref'];
      return typeof nom === 'string' || typeof reference === 'string';
    });
    if (!voie) { return; }
    const nom = voie.properties[`name:${this.config.langue}`] ?? voie.properties['name'];
    const reference = voie.properties['ref'];
    const fiche = this.document.createElement('p');
    fiche.className = 'chantier-carte__fiche';
    fiche.textContent = [typeof nom === 'string' ? nom : undefined, typeof reference === 'string' ? reference : undefined]
      .filter(Boolean).join(' · ');
    new Popup({ closeButton: false, maxWidth: '18rem', offset: 12 }).setLngLat(evenement.lngLat).setDOMContent(fiche).addTo(carte);
  }
}
