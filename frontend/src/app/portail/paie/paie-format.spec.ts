import { formaterMontant, formaterPart, formaterVariation, libellePeriode, periodePrecedente } from './paie-format';

/** `toLocaleString('fr-FR')` sépare les milliers par une espace insécable fine : on compare avec des espaces ordinaires. */
const ordinaire = (texte: string) => texte.replace(/[  ]/g, ' ');

describe('paie-format', () => {
  describe('libellePeriode', () => {
    it('met un mois en toutes lettres, en français', () => {
      expect(libellePeriode('2026-08')).toBe('août 2026');
      expect(libellePeriode('2026-01')).toBe('janvier 2026');
      expect(libellePeriode('2025-12')).toBe('décembre 2025');
    });

    it('rend une chaîne vide sans période', () => {
      expect(libellePeriode(null)).toBe('');
    });
  });

  describe('periodePrecedente', () => {
    it('donne le mois contigu qui précède', () => {
      expect(periodePrecedente('2026-08')).toBe('2026-07');
      expect(periodePrecedente('2026-10')).toBe('2026-09');
    });

    it('passe à décembre de l’année précédente depuis janvier', () => {
      expect(periodePrecedente('2026-01')).toBe('2025-12');
    });
  });

  describe('formaterMontant', () => {
    it('met des dirhams entiers, la virgule et l’espace des milliers', () => {
      expect(ordinaire(formaterMontant(5500))).toBe('5 500');
      expect(ordinaire(formaterMontant(1234567.891))).toBe('1 234 568');
      expect(formaterMontant(0)).toBe('0');
    });
  });

  describe('formaterVariation', () => {
    it('signe une hausse et arrondit à l’entier HALF_DOWN', () => {
      expect(formaterVariation(3.14)).toBe('+3 %');
    });

    it('garde le signe moins d’une baisse', () => {
      expect(formaterVariation(-0.84)).toBe('-1 %');
    });

    it('n’ajoute pas de signe à une variation nulle', () => {
      expect(formaterVariation(0)).toBe('0 %');
      expect(formaterVariation(0.04)).toBe('0 %');
    });
  });

  describe('formaterPart', () => {
    it('donne un pourcentage entier', () => {
      expect(formaterPart(34.78)).toBe('35 %');
      expect(formaterPart(100)).toBe('100 %');
    });
  });
});
