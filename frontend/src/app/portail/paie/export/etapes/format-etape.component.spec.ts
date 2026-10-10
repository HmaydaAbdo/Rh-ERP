import { PaieExportEtapeFormatComponent } from './format-etape.component';
import { monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeFormatComponent', () => {
  const cartes = (racine: HTMLElement) => Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-wizard__format'));

  it('propose le rapport PDF et le classeur Excel avec ce que chacun contient', async () => {
    const { racine } = await monterEtape(PaieExportEtapeFormatComponent);

    expect(cartes(racine).map((c) => c.querySelector('strong')?.textContent?.trim())).toEqual(['Rapport PDF', 'Classeur Excel']);
    expect(cartes(racine)[0].textContent).toContain('Une section par chantier');
    expect(cartes(racine)[1].textContent).toContain('Feuilles par équipe');
  });

  it('présélectionne le PDF', async () => {
    const { racine } = await monterEtape(PaieExportEtapeFormatComponent);

    expect(cartes(racine)[0].className).toContain('export-wizard__format--choisi');
    expect(cartes(racine)[1].className).not.toContain('export-wizard__format--choisi');
  });

  it('choisir l’Excel le retient dans l’assistant et déplace la sélection', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapeFormatComponent);

    cartes(racine)[1].click();
    await stabiliser(fixture);

    expect(store.format()).toBe('EXCEL');
    expect(cartes(racine)[1].className).toContain('export-wizard__format--choisi');
    expect(cartes(racine)[0].className).not.toContain('export-wizard__format--choisi');
  });

  it('revenir au PDF fonctionne aussi', async () => {
    const { fixture, store, racine } = await monterEtape(PaieExportEtapeFormatComponent);
    store.choisirFormat('EXCEL');

    cartes(racine)[0].click();
    await stabiliser(fixture);

    expect(store.format()).toBe('PDF');
  });

  it('les deux choix sont de vrais boutons atteignables au clavier', async () => {
    const { racine } = await monterEtape(PaieExportEtapeFormatComponent);

    expect(cartes(racine).every((c) => c.type === 'button' && !c.disabled)).toBe(true);
  });
});
