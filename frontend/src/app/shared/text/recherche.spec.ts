import { contient, normaliser } from './recherche';

describe('recherche', () => {
  describe('normaliser', () => {
    it('retire les accents et la casse', () => {
      expect(normaliser('Équipe Électricité')).toBe('equipe electricite');
      expect(normaliser('ÇA VA À Fès')).toBe('ca va a fes');
    });

    it('laisse intacts les caractères sans accent', () => {
      expect(normaliser('C168 - Nador')).toBe('c168 - nador');
      expect(normaliser('')).toBe('');
    });
  });

  describe('contient', () => {
    it('trouve un fragment sans tenir compte de la casse ni des accents', () => {
      expect(contient('Équipe des chauffeurs', 'EQUIPE')).toBe(true);
      expect(contient('Autoroute Rabat–Fès', 'fes')).toBe(true);
    });

    it('ignore les espaces autour de la recherche', () => {
      expect(contient('Chauffeurs', '  chauf ')).toBe(true);
    });

    it('refuse un texte qui ne contient pas la recherche', () => {
      expect(contient('Maçon', 'chauffeur')).toBe(false);
    });

    it('une recherche vide correspond à tout, y compris une valeur absente', () => {
      expect(contient('Maçon', '')).toBe(true);
      expect(contient('Maçon', '   ')).toBe(true);
      expect(contient(null, '')).toBe(true);
      expect(contient(undefined, '')).toBe(true);
    });

    it('une valeur absente ne correspond à aucune recherche non vide', () => {
      expect(contient(null, 'a')).toBe(false);
      expect(contient(undefined, 'a')).toBe(false);
    });
  });
});
