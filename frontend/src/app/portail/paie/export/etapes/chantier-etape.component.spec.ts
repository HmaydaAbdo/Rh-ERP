import { PaieExportEtapeChantierComponent } from './chantier-etape.component';
import { CHANTIERS, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeChantierComponent', () => {
  const choix = (racine: HTMLElement) => Array.from(racine.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const libelles = (racine: HTMLElement) => Array.from(racine.querySelectorAll('.export-wizard__choix-item .export-wizard__code')).map((c) => c.textContent?.trim());
  const caseVueEnsemble = (racine: HTMLElement) => racine.querySelector('input[type="checkbox"]') as HTMLInputElement;

  async function monter() {
    const etape = await monterEtape(PaieExportEtapeChantierComponent);
    etape.store.chantiers.set(CHANTIERS);
    await stabiliser(etape.fixture);
    return etape;
  }

  it('propose « Tous les chantiers » puis chaque chantier du mois, « Tous » étant choisi', async () => {
    const { racine } = await monter();

    expect(libelles(racine)).toEqual(['Tous les chantiers', 'C168', 'C196', 'C057']);
    expect(choix(racine).map((c) => c.checked)).toEqual([true, false, false, false]);
    expect(racine.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Chantier du rapport');
  });

  it('décrit chaque chantier : libellé, effectif', async () => {
    const { racine } = await monter();

    const metas = Array.from(racine.querySelectorAll('.export-wizard__choix-item .export-wizard__meta')).map((m) => m.textContent?.trim());
    expect(metas).toEqual(['Rapport complet : un chapitre par chantier', 'Nador · 10 employés', '5 employés', 'Dépôt · 2 employés']);
  });

  it('choisir un chantier le retient et retire la vue d’ensemble par défaut', async () => {
    const { fixture, store, racine } = await monter();

    choix(racine)[2].click();
    await stabiliser(fixture);

    expect(store.chantierChoisi()).toBe('C196');
    expect(choix(racine).map((c) => c.checked)).toEqual([false, false, true, false]);
    expect(caseVueEnsemble(racine).checked).toBe(true);
  });

  it('revenir à « Tous les chantiers » remet la vue d’ensemble', async () => {
    const { fixture, store, racine } = await monter();
    store.choisirChantier('C168');
    await stabiliser(fixture);

    choix(racine)[0].click();
    await stabiliser(fixture);

    expect(store.chantierChoisi()).toBeNull();
    expect(caseVueEnsemble(racine).checked).toBe(false);
  });

  it('laisse l’utilisateur remettre la vue d’ensemble malgré le chantier choisi', async () => {
    const { fixture, store, racine } = await monter();
    store.choisirChantier('C168');
    await stabiliser(fixture);

    caseVueEnsemble(racine).click();
    await stabiliser(fixture);

    expect(store.sansVueEnsemble()).toBe(false);
    expect(store.chantierChoisi()).toBe('C168');
  });

  it('cherche un chantier par code ou libellé, sans tenir compte de la casse', async () => {
    const { fixture, racine } = await monter();

    const recherche = racine.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'NADOR';
    recherche.dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(libelles(racine)).toEqual(['Tous les chantiers', 'C168']);
  });

  it('annonce l’absence de résultat à une recherche sans réponse', async () => {
    const { fixture, racine } = await monter();

    const recherche = racine.querySelector('input[type="search"]') as HTMLInputElement;
    recherche.value = 'zzz';
    recherche.dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(racine.textContent).toContain('Aucun chantier ne correspond à cette recherche.');
  });

  it('indique le chargement des chantiers', async () => {
    const { fixture, store, racine } = await monter();

    store.chantiersEnCours.set(true);
    await stabiliser(fixture);

    expect(racine.textContent).toContain('Chargement des chantiers…');
  });
});
