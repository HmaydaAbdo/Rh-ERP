import { TestBed } from '@angular/core/testing';
import { Map as CarteMapLibre } from 'maplibre-gl';

import { ThemeService } from '../../../core/theme/theme.service';
import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT } from './carte.config';
import { ChantierCarteComponent } from './chantier-carte.component';

/** Fond volontairement absent : aucun test ne dépend du réseau ni du dossier `carte-fond`. */
const CONFIG_SANS_FOND = {
  ...CARTE_CONFIG_PAR_DEFAUT,
  fond: { ...CARTE_CONFIG_PAR_DEFAUT.fond, archive: 'carte/fond/archive-inexistante.pmtiles' }
};

async function attendre(condition: () => boolean, delaiMs = 20000): Promise<void> {
  const debut = Date.now();
  while (!condition()) {
    if (Date.now() - debut > delaiMs) {
      throw new Error("Condition non atteinte dans le délai");
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

  it('dessine une carte MapLibre dans une région nommée, décrite pour le clavier', async () => {
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    const region = element.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe('Carte du Maroc');
    expect(element.querySelector('canvas.maplibregl-canvas')).not.toBeNull();
    const aide = element.querySelector(`#${region?.getAttribute('aria-describedby')}`);
    expect(aide?.textContent).toContain('Flèches du clavier');
    expect(element.querySelector('button.maplibregl-ctrl-zoom-in')).not.toBeNull();
    expect(element.querySelector('.maplibregl-ctrl-compass')).toBeNull();
  });

  it("signale un fond de carte introuvable, sans rien casser d'autre", async () => {
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();

    await attendre(() => fixture.componentInstance.fondIndisponible());
    fixture.detectChanges();

    const message = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(message?.textContent).toContain('Le fond de carte n\'est pas disponible');
  });

  it('redessine la carte avec le fond sombre quand le thème change', async () => {
    const setStyle = vi.spyOn(CarteMapLibre.prototype, 'setStyle');
    localStorage.setItem('staport-theme', 'light');
    const theme = TestBed.inject(ThemeService);
    const fixture = TestBed.createComponent(ChantierCarteComponent);
    await fixture.whenStable();
    const appelsALaCreation = setStyle.mock.calls.length;

    theme.basculer();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(setStyle).toHaveBeenCalledTimes(appelsALaCreation + 1);
    const style = setStyle.mock.lastCall?.[0] as { sprite: string };
    expect(style.sprite).toMatch(/sprites\/v4\/dark$/);
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
