import { PaieExportEtapeRecapComponent } from './recap-etape.component';
import { CHANTIERS, PERIODES, TABLEAUX, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeRecapComponent', () => {
  const lignes = (racine: HTMLElement) =>
    Array.from(racine.querySelectorAll('.app-wizard__recap > div')).map((l) => [l.querySelector('span')?.textContent, l.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim()]);

  async function monter() {
    return monterEtape(PaieExportEtapeRecapComponent, (store) => {
      store.periodes.set(PERIODES);
      store.choisirPeriode('2026-08');
      store.chantiers.set(CHANTIERS);
    });
  }

  it('récapitule en PDF : période, format, chantier, vue d’ensemble et détail par équipe', async () => {
    const { racine } = await monter();

    expect(lignes(racine)).toEqual([
      ['Période', 'août 2026 · 969 bulletins'],
      ['Format', 'Rapport PDF de synthèse'],
      ['Marchés', 'Tous les marchés'],
      ['Vue d\'ensemble', 'Incluse'],
      ['Équipes', 'Aucun réglage : une liste par chantier']
    ]);
    expect(racine.querySelector('.app-wizard__fichier code')?.textContent).toBe('Paie_Rapport_BI_2026-08.pdf');
  });

  it('en Excel, n’affiche ni chantier ni vue d’ensemble, et nomme le classeur', async () => {
    const { fixture, store, racine } = await monter();

    store.choisirFormat('EXCEL');
    await stabiliser(fixture);

    expect(lignes(racine).map((l) => l[0])).toEqual(['Période', 'Format', 'Équipes']);
    expect(lignes(racine)[1][1]).toBe('Classeur Excel détaillé');
    expect(lignes(racine)[2][1]).toBe('Aucun réglage : une feuille par chantier');
    expect(racine.querySelector('.app-wizard__fichier code')?.textContent).toBe('Paie_Export_2026-08.xlsx');
  });

  it('montre le marché choisi et la vue d’ensemble retirée', async () => {
    const { fixture, store, racine } = await monter();

    store.choisirMarches(['C168']);
    await stabiliser(fixture);

    expect(lignes(racine)[2]).toEqual(['Marchés', 'C168 — Nador']);
    expect(lignes(racine)[3]).toEqual(['Vue d\'ensemble', 'Retirée : le rapport commence par le premier chantier']);
  });

  it('résume chaque chantier réglé sur sa ligne, puis les tableaux de matériel imprimés', async () => {
    const { fixture, store, racine } = await monter();
    store.tableauxMateriel.set(TABLEAUX);
    store.choisirTraitement('C168', 'Chauffeurs', 'separee');
    store.saisirNombre('Camion benne', '4');
    await stabiliser(fixture);

    expect(lignes(racine).filter((l) => l[0]?.startsWith('Équipes'))).toEqual([['Équipes C168', 'Séparée : Chauffeurs · 1 dans la liste']]);
    expect(lignes(racine).at(-1)).toEqual(['Camions C168 (C168)', '1 ligne renseignée sur 2 (1 nouvelle) · total 4']);
  });

  it('« Modifier » d’un chantier rouvre l’étape équipes sur ce chantier', async () => {
    const { fixture, store, racine } = await monter();
    store.choisirTraitement('C196', 'Labo', 'separee');
    store.etape.set('recap');
    await stabiliser(fixture);

    (racine.querySelector('button[aria-label="Modifier les équipes de C196"]') as HTMLButtonElement).click();

    expect(store.etape()).toBe('equipes');
    expect(store.chantierCourant()?.code).toBe('C196');
  });

  it('chaque ligne offre « Modifier » qui revient à l’étape correspondante', async () => {
    const { fixture, store, racine } = await monter();
    store.etape.set('recap');
    store.etape.set('recap');
    await stabiliser(fixture);

    const modifier = (ligne: number) => racine.querySelectorAll('.app-wizard__recap > div')[ligne].querySelector('button') as HTMLButtonElement;
    modifier(0).click();
    expect(store.etape()).toBe('periode');

    store.etape.set('recap');
    modifier(1).click();
    expect(store.etape()).toBe('format');

    store.etape.set('recap');
    modifier(2).click();
    expect(store.etape()).toBe('chantier');
  });
});
