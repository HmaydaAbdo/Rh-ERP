import { formater } from './formats';

describe('formats du catalogue ERP', () => {
  it('formate nombres, montants et vides', () => {
    expect(formater(1250000.5, 'montant').replace(/\s/g, ' ')).toBe('1 250 001 MAD');
    expect(formater(null)).toBe('—');
    expect(formater('CH1')).toBe('CH1');
  });
});
