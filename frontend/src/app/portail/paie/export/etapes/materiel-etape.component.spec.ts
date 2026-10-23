import { PaieExportEtapeMaterielComponent } from './materiel-etape.component';
import { CHANTIERS, TABLEAUX, monterEtape, stabiliser } from './etapes.testing';

describe('PaieExportEtapeMaterielComponent', () => {
  const champ = (racine: HTMLElement, libelle: string) => racine.querySelector(`[id="mat-${libelle}"]`) as HTMLInputElement;
  const bouton = (racine: HTMLElement, nom: string) => racine.querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement;

  async function monter() {
    return monterEtape(PaieExportEtapeMaterielComponent, (store) => {
      store.chantiers.set(CHANTIERS);
      store.tableauxMateriel.set(TABLEAUX);
      store.basculerEquipe('C168', 'Chauffeurs');
    });
  }

  it('présente un tableau par équipe détaillée, avec le chantier concerné', async () => {
    const { racine } = await monter();

    expect(racine.querySelector('.export-wizard__contexte')?.textContent).toContain('Chantier C168');
    expect(racine.querySelector('.export-wizard__tableau-tete h4')?.textContent).toBe('Camions C168');
    expect(racine.textContent).toContain('Équipe Chauffeurs');
    expect(Array.from(racine.querySelectorAll('.export-wizard__ligne label')).map((l) => l.textContent)).toEqual(['Camion benne', 'Camion citerne']);
  });

  it('commence sans aucune ligne renseignée', async () => {
    const { racine } = await monter();

    expect(racine.querySelector('.export-wizard__progression')?.textContent).toContain('0 sur 2 renseignées');
    expect(champ(racine, 'Camion benne').value).toBe('');
  });

  it('saisir un nombre le retient, met à jour la progression et le total', async () => {
    const { fixture, store, racine } = await monter();

    champ(racine, 'Camion benne').value = '12';
    champ(racine, 'Camion benne').dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(store.nombre('Camion benne')).toBe(12);
    expect(racine.querySelector('.export-wizard__progression')?.textContent).toContain('1 sur 2 renseignées');
    expect(store.total(TABLEAUX[0])).toBe(12);
  });

  it('refuse un nombre invalide en l’annonçant', async () => {
    const { fixture, store, racine } = await monter();

    champ(racine, 'Camion benne').value = '1.5';
    champ(racine, 'Camion benne').dispatchEvent(new Event('input'));
    await stabiliser(fixture);

    expect(store.nombre('Camion benne')).toBeNull();
    expect(racine.querySelector('[role="alert"]')?.textContent).toBe('Saisissez un nombre entier entre 0 et 999.');
  });

  it('les boutons − et + ajustent le nombre sans descendre sous zéro', async () => {
    const { fixture, store, racine } = await monter();

    bouton(racine, 'Augmenter Camion benne').click();
    bouton(racine, 'Augmenter Camion benne').click();
    await stabiliser(fixture);
    expect(store.nombre('Camion benne')).toBe(2);

    for (let i = 0; i < 5; i++) {
      bouton(racine, 'Diminuer Camion benne').click();
    }
    await stabiliser(fixture);
    expect(store.nombre('Camion benne')).toBe(0);
  });

  it('« Mettre 0 aux lignes vides » complète seulement les lignes non renseignées', async () => {
    const { fixture, store, racine } = await monter();
    store.saisirNombre('Camion benne', '7');
    await stabiliser(fixture);

    (Array.from(racine.querySelectorAll('button')).find((b) => b.textContent?.includes('Mettre 0 aux lignes vides')) as HTMLButtonElement).click();
    await stabiliser(fixture);

    expect(store.nombre('Camion benne')).toBe(7);
    expect(store.nombre('Camion citerne')).toBe(0);
  });

  it('l’interrupteur laisse la colonne vide pour la remplir au stylo, et l’annonce', async () => {
    const { fixture, store, racine } = await monter();
    const interrupteur = racine.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(interrupteur.getAttribute('aria-checked')).toBe('false');

    interrupteur.click();
    await stabiliser(fixture);

    expect(store.estVide(TABLEAUX[0])).toBe(true);
    expect(interrupteur.getAttribute('aria-checked')).toBe('true');
    expect(racine.querySelector('.export-wizard__progression')?.textContent).toContain('Laissé vide');
  });

  it('Entrée passe au champ suivant', async () => {
    const { racine } = await monter();
    document.body.appendChild(racine);

    champ(racine, 'Camion benne').focus();
    champ(racine, 'Camion benne').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(champ(racine, 'Camion citerne'));
    racine.remove();
  });
});
