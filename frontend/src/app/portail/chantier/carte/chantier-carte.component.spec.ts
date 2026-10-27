import { TestBed } from '@angular/core/testing';
import { Map as CarteMapLibre } from 'maplibre-gl';

import { ThemeService } from '../../../core/theme/theme.service';
import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT } from './carte.config';
import { ChantierCarteComponent } from './chantier-carte.component';
import { SOURCE_DU_FOND, SOURCE_SATELLITE } from './fond-de-carte';

/** Fond volontairement absent : aucun test ne dépend du réseau ni du dossier `carte-fond`. */
const CONFIG_SANS_FOND = {
  ...CARTE_CONFIG_PAR_DEFAUT,
  fond: { ...CARTE_CONFIG_PAR_DEFAUT.fond, archive: 'carte/fond/archive-inexistante.pmtiles' }
};

async function attendre(condition: () => boolean, delaiMs = 8000): Promise<void> {
  const debut = Date.now();
  while (!condition()) {
    if (Date.now() - debut > delaiMs) {
      throw new Error('Condition non atteinte dans le délai');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('ChantierCarteComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: CARTE_CONFIG, useValue: CONFIG_SANS_FOND }] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('staport-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('présente ensemble les chantiers du même point et retire les marqueurs lors du retrait des données', async () => {
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    fixture.componentRef.setInput('chantiers', [
      { id: 1, code: 'GEO1', nom: 'Site A', designation: 'Test', nature: 'AO', localisation: 'https://www.google.com/maps?q=10,20', latitude: 10, longitude: 20 },
      { id: 2, code: 'GEO2', nom: 'Site B', designation: 'Test', nature: 'CONCASSAGE', localisation: 'https://www.google.com/maps?q=10,20', latitude: 10, longitude: 20 }
    ]);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.chantier-carte__marqueur')).toHaveLength(1);
    const marqueur = element.querySelector<HTMLButtonElement>('.chantier-carte__marqueur')!;
    expect(marqueur.textContent).toBe('');
    expect(marqueur.querySelector('svg.chantier-carte__epingle')).not.toBeNull();
    // MapLibre seul positionne la racine du marqueur, ancrée sur la pointe de l'épingle.
    expect(marqueur.classList).toContain('maplibregl-marker');
    expect(marqueur.classList).toContain('maplibregl-marker-anchor-bottom');
    expect(marqueur.getAttribute('data-tooltip')).toContain('GEO1 · Site A');
    expect(marqueur.getAttribute('data-tooltip')).toContain('AO');
    expect(marqueur.getAttribute('data-tooltip')).toContain('GEO2 · Site B');
    expect(marqueur.getAttribute('aria-label')).toContain('GEO1 · Site A');
    marqueur.click();
    await fixture.whenStable();
    expect(element.querySelector('.maplibregl-popup')?.textContent).toContain('Site A');
    expect(element.querySelector('.maplibregl-popup')?.textContent).toContain('Site B');
    expect(element.querySelector('.maplibregl-popup')?.textContent).not.toContain('Google Maps');
    fixture.componentRef.setInput('chantiers', []);
    await fixture.whenStable();
    expect(element.querySelectorAll('.chantier-carte__marqueur')).toHaveLength(0);
  });

  it('dessine une carte MapLibre dans une région nommée, décrite pour le clavier', async () => {
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    const region = element.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe('Carte des chantiers');
    expect(element.querySelector('canvas.maplibregl-canvas')).not.toBeNull();
    const aide = element.querySelector(`#${region?.getAttribute('aria-describedby')}`);
    expect(aide?.textContent).toContain('Flèches du clavier');
    expect(aide?.textContent).toContain('pivoter et');
    expect(element.querySelector('button.maplibregl-ctrl-zoom-in')).not.toBeNull();
    expect(element.querySelector('.maplibregl-ctrl-compass')).not.toBeNull();
    expect(element.querySelector('.maplibregl-ctrl-geolocate')).not.toBeNull();
    expect(element.querySelector('.maplibregl-ctrl-fullscreen')).not.toBeNull();
    expect(element.querySelector('.maplibregl-ctrl-scale')).not.toBeNull();
  });

  it('passe du plan au satellite et retire le relief, en redessinant la carte', async () => {
    const setStyle = vi.spyOn(CarteMapLibre.prototype, 'setStyle');
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const bouton = (nom: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('.chantier-carte__calques button')].find((b) => b.textContent?.trim() === nom)!;
    expect(bouton('Plan').getAttribute('aria-pressed')).toBe('true');
    expect(bouton('Relief').getAttribute('aria-pressed')).toBe('true');

    bouton('Satellite').click();
    await fixture.whenStable();
    expect(bouton('Satellite').getAttribute('aria-pressed')).toBe('true');
    expect(bouton('Plan').getAttribute('aria-pressed')).toBe('false');
    expect(Object.keys((setStyle.mock.lastCall?.[0] as { sources: object }).sources)).toContain(SOURCE_SATELLITE);

    bouton('Relief').click();
    await fixture.whenStable();
    expect(bouton('Relief').getAttribute('aria-pressed')).toBe('false');
    expect((setStyle.mock.lastCall?.[0] as { terrain?: object }).terrain).toBeUndefined();
  });

  it('incline la carte en 3D, puis revient au Maroc entier à plat', async () => {
    const easeTo = vi.spyOn(CarteMapLibre.prototype, 'easeTo');
    const fitBounds = vi.spyOn(CarteMapLibre.prototype, 'fitBounds');
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    element.querySelector<HTMLButtonElement>('[aria-label="Incliner la carte en 3D"]')!.click();
    expect(easeTo).toHaveBeenCalledWith({ pitch: CONFIG_SANS_FOND.inclinaison3d });

    element.querySelector<HTMLButtonElement>('[aria-label="Revenir au Maroc entier"]')!.click();
    expect(fitBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pitch: 0, bearing: 0 }));
  });

  it("signale un fond de carte introuvable, puis l'efface quand il se charge", async () => {
    // Les erreurs réseau de MapLibre arrivent à un moment imprévisible : on les simule pour tester la réaction du composant.
    const ecouteurs: Record<string, (evenement: unknown) => void> = {};
    const on = CarteMapLibre.prototype.on;
    vi.spyOn(CarteMapLibre.prototype, 'on').mockImplementation(function (this: CarteMapLibre, type: string, ...reste: unknown[]) {
      ecouteurs[type] = reste[reste.length - 1] as (evenement: unknown) => void;
      return (on as (...args: unknown[]) => unknown).call(this, type, ...reste) as never;
    } as never);
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();

    ecouteurs['error']({ sourceId: 'autre-source' });
    expect(fixture.componentInstance.sourcesIndisponibles().has(SOURCE_DU_FOND)).toBe(false);

    ecouteurs['error']({ sourceId: SOURCE_DU_FOND });
    fixture.detectChanges();
    const message = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(message?.textContent).toContain("Le fond de carte n'est pas disponible");

    ecouteurs['sourcedata']({ sourceId: SOURCE_DU_FOND, isSourceLoaded: true });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
  });

  it("garde le style cartographique et ne redessine pas la carte quand le thème de l'application change", async () => {
    const setStyle = vi.spyOn(CarteMapLibre.prototype, 'setStyle');
    localStorage.setItem('staport-theme', 'light');
    const theme = TestBed.inject(ThemeService);
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const appelsALaCreation = setStyle.mock.calls.length;

    theme.basculer();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(setStyle).toHaveBeenCalledTimes(appelsALaCreation);
  });

  it('suit la taille de son conteneur', async () => {
    const resize = vi.spyOn(CarteMapLibre.prototype, 'resize');
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    element.style.width = '600px';
    await attendre(() => resize.mock.calls.length > 0);
    resize.mockClear();

    element.style.width = '320px';

    await attendre(() => resize.mock.calls.length > 0);
  });

  it('détruit la carte avec le composant', async () => {
    const remove = vi.spyOn(CarteMapLibre.prototype, 'remove');
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const conteneur = (fixture.nativeElement as HTMLElement).querySelector('[role="region"]') as HTMLElement;
    expect(conteneur.querySelector('canvas')).not.toBeNull();

    fixture.destroy();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(conteneur.querySelector('canvas')).toBeNull();
  });
});
