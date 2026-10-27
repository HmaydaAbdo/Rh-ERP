import { comparer, formater, versCsv } from './formats';

describe('formats du catalogue ERP', () => {
  it('formate nombres, montants et vides', () => {
    expect(formater(1250000.5, 'montant').replace(/\s/g, ' ')).toBe('1 250 001 MAD');
    expect(formater(null)).toBe('—');
    expect(formater('CH1')).toBe('CH1');
  });

  it('exporte un CSV avec séparateur point-virgule, BOM et guillemets échappés', () => {
    const csv = versCsv([{ key: 'a', label: 'Nom' }], [{ a: 'x "y"' }]);
    expect(csv).toBe('﻿"Nom"\r\n"x ""y"""');
  });

  it('trie les nombres par valeur et met les vides en dernier', () => {
    expect([10, 2, null, 33].sort(comparer)).toEqual([2, 10, 33, null]);
    expect(['b10', 'b9'].sort(comparer)).toEqual(['b9', 'b10']);
  });
});
