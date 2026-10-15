import { PaieExportEtapeEquipesComponent } from './equipes-etape.component';
import { CHANTIERS, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeEquipesComponent', () => {
  const codes = (racine: HTMLElement) => Array.from(racine.querySelectorAll('.export-wizard__chantier-tete .export-wizard__code')).map((c) => c.textContent?.trim());
  const tete = (racine: HTMLElement, code: string) =>
    Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-wizard__chantier-tete')).find((b) => b.textContent?.includes(code))!;
  const pastille = (racine: HTMLElement, libelle: string) =>
    Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-wizard__pastilles button[aria-pressed]')).find((b) => b.textContent?.includes(libelle))!;

  async function monter() {
    const etape = await monterEtape(PaieExportEtapeEquipesComponent);
    etape.store.chantiers.set(CHANTIERS);
    await stabiliser(etape.fixture);
    return etape;
  }

  it('liste les chantiers du mois avec leur effectif et leurs équipes', async () => {
    const { racine } = await monter();

    expect(codes(racine)).toEqual(['C168', 'C196', 'C057']);
    const metas = Array.from(racine.querySelectorAll('.export-wizard__meta')).map((m) => m.textContent?.replace(/\s+/g, ' ').trim());
    expect(metas).toEqual(['Nador · 10 employés · 2 équipes', '5 employés · 1 équipes', 'Dépôt · 2 employés · aucune équipe']);
  });

  it('adapte la consigne au format : PDF puis Excel', async () => {
    const { fixture, store, racine } = await monter();
    expect(racine.querySelector('.export-wizard__consigne')?.textContent).toContain('graphique par équipe');

    store.choisirFormat('EXCEL');
    await stabiliser(fixture);

    expect(racine.querySelector('.export-wizard__consigne')?.textContent).toContain('sa propre feuille');
  });

  it('un chantier sans équipe ne se déplie pas', async () => {
    const { racine } = await monter();

    expect(tete(racine, 'C057').disabled).toBe(true);
  });

  it('déplie et replie les équipes d’un chantier en l’annonçant', async () => {
    const { fixture, racine } = await monter();
    expect(tete(racine, 'C168').getAttribute('aria-expanded')).toBe('false');

    tete(racine, 'C168').click();
    await stabiliser(fixture);
    expect(tete(racine, 'C168').getAttribute('aria-expanded')).toBe('true');

    tete(racine, 'C168').click();
    await stabiliser(fixture);
    expect(tete(racine, 'C168').getAttribute('aria-expanded')).toBe('false');
  });

  it('coche une équipe : elle est retenue, le chantier devient « détaillé » avec son compteur', async () => {
    const { fixture, store, racine } = await monter();

    pastille(racine, 'Chauffeurs').click();
    await stabiliser(fixture);

    expect(store.equipesChoisies('C168')).toEqual(['CH']);
    expect(pastille(racine, 'Chauffeurs').getAttribute('aria-pressed')).toBe('true');
    expect(racine.querySelector('.export-wizard__badge')?.textContent).toBe('1 / 2 équipes');
  });

  it('« Toutes » puis « Aucune » cochent et décochent toutes les équipes du chantier', async () => {
    const { fixture, store, racine } = await monter();
    const boutons = (nom: string) => Array.from(racine.querySelectorAll<HTMLButtonElement>('.export-wizard__equipes-tete button')).filter((b) => b.textContent === nom);

    boutons('Toutes')[0].click();
    await stabiliser(fixture);
    expect(store.equipesChoisies('C168')).toEqual(['CH', 'OP']);

    boutons('Aucune')[0].click();
    await stabiliser(fixture);
    expect(store.equipesChoisies('C168')).toEqual([]);
  });

  it('en Excel, propose de retirer une équipe cochée de la feuille du chantier ; pas en PDF', async () => {
    const { fixture, store, racine } = await monter();
    store.basculerEquipe('C168', 'CH');
    await stabiliser(fixture);
    expect(racine.querySelector('.export-wizard__retrait')).toBeNull();

    store.choisirFormat('EXCEL');
    await stabiliser(fixture);
    const retrait = racine.querySelector('.export-wizard__retrait') as HTMLButtonElement;
    expect(retrait.getAttribute('aria-label')).toBe('Retirer Chauffeurs de la feuille du chantier');
    expect(retrait.getAttribute('aria-pressed')).toBe('false');

    retrait.click();
    await stabiliser(fixture);
    expect(store.estRetiree('C168', 'CH')).toBe(true);
    expect(retrait.getAttribute('aria-pressed')).toBe('true');
  });

  it('cherche un chantier par code ou libellé', async () => {
    const { fixture, racine } = await monter();

    const recherche = racine.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'c19';
    recherche.dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(codes(racine)).toEqual(['C196']);
  });

  it('avec un marché choisi en PDF, ne propose que ce marché', async () => {
    const { fixture, store, racine } = await monter();

    store.choisirMarches(['C196']);
    await stabiliser(fixture);

    expect(codes(racine)).toEqual(['C196']);
  });

  it('annonce l’absence de résultat', async () => {
    const { fixture, racine } = await monter();

    const recherche = racine.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'zzz';
    recherche.dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(racine.textContent).toContain('Aucun chantier ne correspond à cette recherche.');
  });
});
