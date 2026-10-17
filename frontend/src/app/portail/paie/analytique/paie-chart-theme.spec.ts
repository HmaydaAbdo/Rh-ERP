import { animationGraphique, couleurMesure, grille, infobulle, jeton, libelleMesure, mouvementReduit, police, valeursSurPoints } from './paie-chart-theme';

describe('paie-chart-theme', () => {
  const racine = document.documentElement;

  afterEach(() => {
    racine.style.removeProperty('--chart-1');
    racine.style.removeProperty('--chart-2');
    racine.style.removeProperty('--font-sans');
    racine.style.removeProperty('--color-border');
    vi.restoreAllMocks();
  });

  describe('jeton', () => {
    it('lit un jeton de design sur la racine du document', () => {
      racine.style.setProperty('--chart-1', ' #1d4ed8 ');

      expect(jeton('--chart-1')).toBe('#1d4ed8');
    });

    it('se replie sur une couleur neutre quand le jeton manque', () => {
      expect(jeton('--inexistant')).toBe('gray');
    });
  });

  describe('mesures', () => {
    it('la masse est toujours la couleur 1, les bulletins la couleur 2', () => {
      racine.style.setProperty('--chart-1', 'blue');
      racine.style.setProperty('--chart-2', 'orange');

      expect(couleurMesure('masse')).toBe('blue');
      expect(couleurMesure('effectif')).toBe('orange');
    });

    it('nomme chaque mesure comme les infobulles et les tableaux de données', () => {
      expect(libelleMesure('masse')).toBe('Masse (DH)');
      expect(libelleMesure('effectif')).toBe('Bulletins');
    });

    it('fournit le plugin qui affiche la valeur de chaque point', () => {
      const plugin = valeursSurPoints();

      expect(plugin.id).toBe('paie-valeurs-sur-points');
      expect(plugin.afterDatasetsDraw).toEqual(expect.any(Function));
    });
  });

  describe('habillage', () => {
    it('la police du texte est celle de l’interface, à la taille demandée', () => {
      racine.style.setProperty('--font-sans', 'IBM Plex Sans');

      expect(police()).toEqual({ family: 'IBM Plex Sans', size: 12 });
      expect(police(14).size).toBe(14);
    });

    it('la grille est un filet discret sans traits de graduation', () => {
      racine.style.setProperty('--color-border', '#ddd');

      expect(grille()).toEqual({ color: '#ddd', drawTicks: false });
    });

    it('l’infobulle reprend les couleurs de l’interface', () => {
      racine.style.setProperty('--color-border', '#ddd');

      const options = infobulle();

      expect(options.borderWidth).toBe(1);
      expect(options.usePointStyle).toBe(false);
      expect(options.titleFont).toMatchObject({ weight: 600 });
    });
  });

  describe('mouvement', () => {
    function demanderMoinsDeMouvement(reduit: boolean): void {
      vi.spyOn(window, 'matchMedia').mockImplementation((requete) => ({ matches: reduit && requete.includes('reduce') }) as MediaQueryList);
    }

    it('anime l’apparition sans rebond par défaut', () => {
      demanderMoinsDeMouvement(false);

      expect(mouvementReduit()).toBe(false);
      expect(animationGraphique()).toEqual({ duration: 600, easing: 'easeOutQuart' });
    });

    it('supprime l’animation quand l’utilisateur demande moins de mouvement', () => {
      demanderMoinsDeMouvement(true);

      expect(mouvementReduit()).toBe(true);
      expect(animationGraphique()).toBe(false);
    });
  });
});
