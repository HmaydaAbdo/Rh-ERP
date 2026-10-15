import { PaieExportEtapeChantierComponent } from './chantier-etape.component';
import { CHANTIERS, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeChantierComponent', () => {
  const choix = (racine: HTMLElement) => Array.from(racine.querySelectorAll<HTMLInputElement>('.export-wizard__choix-item input[type="checkbox"]'));
  const libelles = (racine: HTMLElement) => Array.from(racine.querySelectorAll('.export-wizard__choix-item .export-wizard__code')).map((c) => c.textContent?.trim());
  const caseVueEnsemble = (racine: HTMLElement) => racine.querySelector('.export-wizard__option input[type="checkbox"]') as HTMLInputElement;

  async function monter() {
    const etape = await monterEtape(PaieExportEtapeChantierComponent);
    etape.store.chantiers.set(CHANTIERS);
    await stabiliser(etape.fixture);
    return etape;
  }

  it('propose « Tous les marchés » puis chaque marché du mois, « Tous » étant choisi', async () => {
    const { racine } = await monter();

    expect(libelles(racine)).toEqual(['Tous les marchés', 'C168 — Nador', 'C196', 'C057 — Dépôt']);
    expect(choix(racine).map((c) => c.checked)).toEqual([true, false, false, false]);
    expect(racine.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Marchés du rapport');
  });

  it('décrit chaque chantier : libellé, effectif', async () => {
    const { racine } = await monter();

    const metas = Array.from(racine.querySelectorAll('.export-wizard__choix-item .export-wizard__meta')).map((m) => m.textContent?.trim());
    expect(metas).toEqual(['Rapport complet : un chapitre par marché', 'Nador · 10 employés', '5 employés', 'Dépôt · 2 employés']);
  });

  it('permet de cocher plusieurs marchés et retire la vue d’ensemble par défaut', async () => {
    const { fixture, store, racine } = await monter();

    choix(racine)[1].click();
    choix(racine)[2].click();
    await stabiliser(fixture);

    expect(store.marchesChoisis()).toEqual(['C168', 'C196']);
    expect(choix(racine).map((c) => c.checked)).toEqual([false, true, true, false]);
    expect(caseVueEnsemble(racine).checked).toBe(true);
  });

  it('revenir à « Tous les marchés » remet la vue d’ensemble', async () => {
    const { fixture, store, racine } = await monter();
    store.choisirMarches(['C168']);
    await stabiliser(fixture);

    choix(racine)[0].click();
    await stabiliser(fixture);

    expect(store.marchesChoisis()).toEqual([]);
    expect(caseVueEnsemble(racine).checked).toBe(false);
  });

  it('laisse l’utilisateur remettre la vue d’ensemble malgré le chantier choisi', async () => {
    const { fixture, store, racine } = await monter();
    store.choisirMarches(['C168']);
    await stabiliser(fixture);

    caseVueEnsemble(racine).click();
    await stabiliser(fixture);

    expect(store.sansVueEnsemble()).toBe(false);
    expect(store.marchesChoisis()).toEqual(['C168']);
  });

  it('cherche un marché par code ou libellé, sans tenir compte de la casse', async () => {
    const { fixture, racine } = await monter();

    const recherche = racine.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'NADOR';
    recherche.dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(libelles(racine)).toEqual(['Tous les marchés', 'C168 — Nador']);
  });

  it('annonce l’absence de résultat à une recherche sans réponse', async () => {
    const { fixture, racine } = await monter();

    const recherche = racine.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'zzz';
    recherche.dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(racine.textContent).toContain('Aucun marché ne correspond à cette recherche.');
  });

  it('indique le chargement des chantiers', async () => {
    const { fixture, store, racine } = await monter();

    store.chantiersEnCours.set(true);
    await stabiliser(fixture);

    expect(racine.textContent).toContain('Chargement des marchés…');
  });
});
