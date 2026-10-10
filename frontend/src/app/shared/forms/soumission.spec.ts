import { EMPTY, of, throwError } from 'rxjs';

import { attendreEnregistrement } from './soumission';

describe('attendreEnregistrement', () => {
  it('rend la valeur de la réponse', async () => {
    expect(await attendreEnregistrement(of({ id: 7 }))).toEqual({ id: 7 });
  });

  it('rend la dernière valeur quand le flux en émet plusieurs', async () => {
    expect(await attendreEnregistrement(of(1, 2, 3))).toBe(3);
  });

  it('se résout sans valeur sur une erreur HTTP (déjà notifiée), sans rejeter', async () => {
    expect(await attendreEnregistrement(throwError(() => new Error('400')))).toBeUndefined();
  });

  it('se résout sans valeur quand le flux se termine vide', async () => {
    expect(await attendreEnregistrement(EMPTY)).toBeUndefined();
  });
});
