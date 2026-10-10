import { PERIODES, monterEtape, stabiliser } from './etapes.testing';
import { PaieExportEtapePeriodeComponent } from './periode-etape.component';

describe('PaieExportEtapePeriodeComponent', () => {
  it('prévient quand aucune paie n’est enregistrée', async () => {
    const { racine } = await monterEtape(PaieExportEtapePeriodeComponent);

    expect(racine.textContent).toContain('Aucune paie enregistrée');
    expect(racine.querySelector('app-month-picker')).toBeNull();
  });

  it('propose la grille des mois qui contiennent de la paie', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapePeriodeComponent);

    store.periodes.set(PERIODES);
    await stabiliser(fixture);

    expect(racine.querySelector('app-month-picker')).not.toBeNull();
    expect(racine.textContent).toContain('Seuls les mois qui contiennent des bulletins sont proposés.');
    expect(racine.textContent).not.toContain('Aucune paie enregistrée');
  });

  it('ne dit rien du contenu tant qu’aucun mois n’est choisi', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapePeriodeComponent);

    store.periodes.set(PERIODES);
    await stabiliser(fixture);

    expect(racine.querySelector('.export-wizard__carte--ok')).toBeNull();
  });

  it('résume le mois choisi : bulletins, chantiers, masse salariale et sorties STC', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapePeriodeComponent);
    store.periodes.set(PERIODES);

    store.choisirPeriode('2026-08');
    await stabiliser(fixture);

    const carte = racine.querySelector('.export-wizard__carte--ok') as HTMLElement;
    expect(carte.getAttribute('role')).toBe('status');
    expect(carte.querySelector('strong')?.textContent).toContain('août 2026 contient de la paie');
    expect(Array.from(carte.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(['bulletins', 'chantiers', 'masse salariale', 'STC / sorties']);
    expect(carte.textContent?.replace(/[\s  ]/g, ' ')).toContain('5 500 000,50 DH');
  });

  it('choisir un mois dans la grille le retient dans l’assistant', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapePeriodeComponent);
    store.periodes.set(PERIODES);
    await stabiliser(fixture);

    const mois = Array.from(racine.querySelectorAll('app-month-picker button')).find((b) => /août/i.test(b.textContent ?? '')) as HTMLButtonElement;
    mois.click();
    await stabiliser(fixture);

    expect(store.periode()).toBe('2026-08');
  });

  it('annonce l’erreur de l’assistant dans une zone d’alerte', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapePeriodeComponent);

    store.erreur.set('Choisissez un mois qui contient des bulletins.');
    await stabiliser(fixture);

    expect(racine.querySelector('[role="alert"]')?.textContent).toBe('Choisissez un mois qui contient des bulletins.');
  });
});
