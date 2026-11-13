import { telechargerFichier } from './telecharger-fichier';

describe('telechargerFichier', () => {
  it('clique un lien de téléchargement au nom donné puis libère l’URL', () => {
    const creer = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:essai');
    const liberer = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const noms: string[] = [];
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      noms.push(`${this.download}|${this.href}`);
    });

    telechargerFichier(new Blob(['%PDF']), 'Sortants_2026-03.pdf');

    expect(creer).toHaveBeenCalledOnce();
    expect(noms).toEqual(['Sortants_2026-03.pdf|blob:essai']);
    expect(liberer).toHaveBeenCalledWith('blob:essai');
    clic.mockRestore();
    creer.mockRestore();
    liberer.mockRestore();
  });
});
