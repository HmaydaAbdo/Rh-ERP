import { canonique, chiffresCites, surlignerChiffres } from './chiffres';

describe('chiffres cités par l’assistant', () => {
  it('ramène chaque écriture d’un nombre à une valeur canonique', () => {
    expect(canonique('1 250 000,50')).toBe('1250000.5');
    expect(canonique('1 250 000,50')).toBe('1250000.5');
    expect(canonique('1250000.50')).toBe('1250000.5');
    expect(canonique('412')).toBe('412');
  });

  it('extrait les montants et effectifs, sans les périodes ni les petits entiers', () => {
    expect(chiffresCites('En 2026-09 : masse 1 250 000,50 MAD pour 412 bulletins et 3 STC.')).toEqual(['1250000.5', '412']);
    expect(chiffresCites('Aucune donnée.')).toEqual([]);
    // Les chiffres d'un code ne sont pas des valeurs citées.
    expect(chiffresCites('La masse du chantier C-f0e214bf en 2026-09 est de 3000.0 MAD (équipe E-0712).')).toEqual(['3000']);
  });

  it('surligne les valeurs affichées qui correspondent, y compris celles qui arrivent après coup', async () => {
    const racine = document.createElement('div');
    racine.innerHTML =
      '<p><span id="masse">1 250 000,50 MAD</span></p><span id="autre">999</span><span id="code">Chantier C-412</span>';
    document.body.append(racine);

    const retirer = surlignerChiffres(racine, ['1250000.5', '412']);
    expect(racine.querySelector('#masse')?.classList.contains('assistant-cite')).toBe(true);
    expect(racine.querySelector('#autre')?.classList.contains('assistant-cite')).toBe(false);
    expect(racine.querySelector('#code')?.classList.contains('assistant-cite')).toBe(false);

    const tardif = document.createElement('strong');
    tardif.textContent = '412';
    racine.append(tardif);
    await new Promise((fin) => setTimeout(fin));
    expect(tardif.classList.contains('assistant-cite')).toBe(true);

    retirer();
    expect(racine.querySelectorAll('.assistant-cite').length).toBe(0);
    racine.remove();
  });
});
