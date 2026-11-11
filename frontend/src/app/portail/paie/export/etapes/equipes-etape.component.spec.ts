import { PaieExportEtapeEquipesComponent } from './equipes-etape.component';
import { CHANTIERS, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeEquipesComponent', () => {
  const texte = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim();
  const equipes = (racine: HTMLElement) => Array.from(racine.querySelectorAll('.app-presentation__nom')).map(texte);
  const groupe = (racine: HTMLElement, equipe: string) =>
    Array.from(racine.querySelectorAll<HTMLElement>('[role="radiogroup"]'))
      .find((g) => racine.querySelector(`[id="${g.getAttribute('aria-labelledby')}"]`)?.textContent?.includes(equipe))!;
  const option = (racine: HTMLElement, equipe: string, libelle: string) =>
    Array.from(groupe(racine, equipe).querySelectorAll('label')).find((l) => texte(l) === libelle)!.querySelector('input') as HTMLInputElement;
  const apercu = (racine: HTMLElement) => Array.from(racine.querySelectorAll('.app-presentation__apercu li')).map(texte);

  async function monter() {
    const etape = await monterEtape(PaieExportEtapeEquipesComponent);
    etape.store.chantiers.set(CHANTIERS);
    await stabiliser(etape.fixture);
    return etape;
  }

  it('affiche un chantier à la fois, avec sa position et ses équipes ; un chantier sans équipe est sauté', async () => {
    const { fixture, store, racine } = await monter();

    expect(texte(racine.querySelector('.app-presentation__chantier h3'))).toBe('C168 Nador');
    expect(texte(racine.querySelector('.app-presentation__chantier p'))).toBe('10 employés · 2 équipes');
    expect(texte(racine.querySelector('.app-cas__position'))).toBe('Chantier 1 sur 2');
    expect(equipes(racine)).toEqual(['Chauffeurs 6 employés', 'Opérateurs 4 employés']);

    store.etape.set('equipes');
    store.suivant();
    await stabiliser(fixture);

    expect(texte(racine.querySelector('.app-presentation__chantier h3'))).toBe('C196');
    expect(texte(racine.querySelector('.app-presentation__chantier p'))).toBe('5 employés · 1 équipe');
    expect(texte(racine.querySelector('.app-cas__position'))).toBe('Chantier 2 sur 2');
    expect(equipes(racine)).toEqual(['Labo 5 employés']);
  });

  it('propose trois présentations par équipe en PDF, deux en Excel, et laisse chaque équipe dans la liste par défaut', async () => {
    const { fixture, store, racine } = await monter();
    const libelles = () => Array.from(groupe(racine, 'Chauffeurs').querySelectorAll('label')).map(texte);

    expect(libelles()).toEqual(['Dans la liste', 'Séparée', 'Réunie']);
    expect(option(racine, 'Chauffeurs', 'Dans la liste').checked).toBe(true);
    expect(racine.querySelector('.app-wizard__consigne')?.textContent).toContain('sans colonne Équipe');

    store.choisirFormat('EXCEL');
    await stabiliser(fixture);

    expect(libelles()).toEqual(['Feuille du chantier', 'Feuille à part']);
    expect(racine.querySelector('.app-wizard__consigne')?.textContent).toContain('sa propre feuille');
  });

  it('choisir une présentation la retient pour ce chantier seulement et met l’aperçu à jour', async () => {
    const { fixture, store, racine } = await monter();
    expect(apercu(racine)).toEqual(['Liste de tout le chantier, avec la colonne Équipe 10 employés']);

    option(racine, 'Chauffeurs', 'Séparée').click();
    await stabiliser(fixture);

    expect(store.traitement('C168', 'Chauffeurs')).toBe('separee');
    expect(store.traitement('C196', 'Labo')).toBe('liste');
    expect(option(racine, 'Chauffeurs', 'Séparée').checked).toBe(true);
    expect(groupe(racine, 'Chauffeurs').querySelector('.app-segments__option--choisie')?.textContent).toContain('Séparée');
    expect(apercu(racine)).toEqual(['Section Chauffeurs 6 employés', 'Liste des autres employés, sans colonne Équipe 4 employés']);
  });

  it('réunit des équipes dans ce chantier ; une réunion d’une seule équipe bloque la suite et l’explique', async () => {
    const { fixture, store, racine } = await monter();
    store.etape.set('equipes');

    option(racine, 'Chauffeurs', 'Réunie').click();
    await stabiliser(fixture);
    store.suivant();
    await stabiliser(fixture);

    expect(store.positionChantier()).toBe(0);
    expect(racine.querySelector('[role="alert"]')?.textContent).toContain('au moins deux');

    option(racine, 'Opérateurs', 'Réunie').click();
    await stabiliser(fixture);

    expect(racine.querySelector('[role="alert"]')?.textContent).toBe('');
    expect(apercu(racine)).toEqual(['Section Chauffeurs + Opérateurs 10 employés']);
    store.suivant();
    expect(store.positionChantier()).toBe(1);
  });

  it('« Appliquer à toutes » donne la même présentation à toutes les équipes du chantier', async () => {
    const { fixture, store, racine } = await monter();
    const raccourci = (nom: string) =>
      Array.from(racine.querySelectorAll<HTMLButtonElement>('.app-wizard__equipes-tete button')).find((b) => b.textContent === nom)!;

    raccourci('Séparée').click();
    await stabiliser(fixture);
    expect(store.equipesSeparees(CHANTIERS[0])).toEqual(['Chauffeurs', 'Opérateurs']);

    raccourci('Dans la liste').click();
    await stabiliser(fixture);
    expect(store.equipesSeparees(CHANTIERS[0])).toEqual([]);
  });

  it('en Excel, une équipe en feuille à part peut être retirée de la feuille du chantier ; pas en PDF', async () => {
    const { fixture, store, racine } = await monter();
    store.choisirTraitement('C168', 'Chauffeurs', 'separee');
    await stabiliser(fixture);
    expect(racine.querySelector('.app-presentation__retrait')).toBeNull();

    store.choisirFormat('EXCEL');
    await stabiliser(fixture);
    const retrait = racine.querySelector('.app-presentation__retrait input') as HTMLInputElement;
    expect(texte(retrait.closest('label'))).toBe('Retirer ses employés de la feuille du chantier');

    retrait.click();
    await stabiliser(fixture);

    expect(store.estRetiree('C168', 'Chauffeurs')).toBe(true);
    expect(apercu(racine)).toEqual(['Feuille du chantier C168 4 employés', 'Feuille de l\'équipe Chauffeurs 6 employés']);
  });

  it('avec un marché choisi en PDF, ne parcourt que ce marché', async () => {
    const { fixture, store, racine } = await monter();

    store.choisirMarches(['C196']);
    await stabiliser(fixture);

    expect(texte(racine.querySelector('.app-cas__position'))).toBe('Chantier 1 sur 1');
    expect(equipes(racine)).toEqual(['Labo 5 employés']);
  });

  it('sans aucune équipe ce mois-ci, l’explique et laisse continuer', async () => {
    const { fixture, store, racine } = await monter();

    store.chantiers.set([CHANTIERS[2]]);
    await stabiliser(fixture);

    expect(racine.querySelector('.app-wizard__vide')?.textContent).toContain('Aucun chantier de ce mois n\'a d\'équipe');
  });
});
