import { focaliserPremiereErreur } from './focus-first-error';

describe('focaliserPremiereErreur', () => {
  let racine: HTMLElement;

  beforeEach(() => {
    racine = document.createElement('div');
    document.body.appendChild(racine);
  });

  afterEach(() => racine.remove());

  it('donne le focus au premier champ invalide', () => {
    racine.innerHTML = '<form><input id="a" class="ng-valid"><input id="b" class="ng-invalid"><input id="c" class="ng-invalid"></form>';

    focaliserPremiereErreur();

    expect(document.activeElement?.id).toBe('b');
  });

  it('donne le focus au champ interactif d\'un champ composé', () => {
    racine.innerHTML = '<form><p-calendar class="ng-invalid"><span><input id="date"></span></p-calendar></form>';

    focaliserPremiereErreur();

    expect(document.activeElement?.id).toBe('date');
  });

  it('ne fait rien quand aucun champ n\'est invalide', () => {
    racine.innerHTML = '<form><input id="a" class="ng-valid"></form>';
    (document.activeElement as HTMLElement | null)?.blur();

    expect(() => focaliserPremiereErreur()).not.toThrow();
    expect(document.activeElement?.id).not.toBe('a');
  });
});
