import { PaieExportEtapeRecapComponent } from './recap-etape.component';
import { CHANTIERS, PERIODES, TABLEAUX, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeRecapComponent', () => {
  const lignes = (racine: HTMLElement) =>
    Array.from(racine.querySelectorAll('.export-wizard__recap > div')).map((l) => [l.querySelector('span')?.textContent, l.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim()]);

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
      ['Chantier', 'Tous les chantiers'],
      ['Vue d\'ensemble', 'Incluse'],
      ['Détail par équipe', 'Aucun, une section par chantier']
    ]);
    expect(racine.querySelector('.export-wizard__fichier code')?.textContent).toBe('Paie_Rapport_BI_2026-08.pdf');
  });

  it('en Excel, n’affiche ni chantier ni vue d’ensemble, et nomme le classeur', async () => {
    const { fixture, store, racine } = await monter();

    store.choisirFormat('EXCEL');
    await stabiliser(fixture);

    expect(lignes(racine).map((l) => l[0])).toEqual(['Période', 'Format', 'Détail par équipe']);
    expect(lignes(racine)[1][1]).toBe('Classeur Excel détaillé');
    expect(racine.querySelector('.export-wizard__fichier code')?.textContent).toBe('Paie_Export_2026-08.xlsx');
  });

  it('montre le marché choisi et la vue d’ensemble retirée', async () => {
    const { fixture, store, racine } = await monter();

    store.choisirMarches(['C168']);
    await stabiliser(fixture);

    expect(lignes(racine)[2]).toEqual(['Marchés', 'C168 — Nador']);
    expect(lignes(racine)[3]).toEqual(['Vue d\'ensemble', 'Retirée : le rapport commence par le premier chantier']);
  });

  it('liste les équipes détaillées et les tableaux de matériel imprimés', async () => {
    const { fixture, store, racine } = await monter();
    store.tableauxMateriel.set(TABLEAUX);
    store.basculerEquipe('C168', 'CH');
    store.saisirNombre('Camion benne', '4');
    await stabiliser(fixture);

    const detail = lignes(racine).find((l) => l[0] === 'Détail par équipe');
    expect(detail?.[1]).toBe('C168 (1 équipe)');
    expect(lignes(racine).at(-1)).toEqual(['Camions C168 (C168)', '1 ligne renseignée sur 2 · total 4']);
  });

  it('chaque ligne offre « Modifier » qui revient à l’étape correspondante', async () => {
    const { fixture, store, racine } = await monter();
    store.etape.set('recap');
    store.etape.set('recap');
    await stabiliser(fixture);

    const modifier = (ligne: number) => racine.querySelectorAll('.export-wizard__recap > div')[ligne].querySelector('button') as HTMLButtonElement;
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
