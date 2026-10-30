import { contexteEcran } from './ecran-assistant';

describe('ecran-assistant', () => {
  it('décrit l’écran avec son domaine et ses filtres, sans valeur démesurée', () => {
    const contexte = contexteEcran(`/paie/analytique?periode=2026-09&chantierIds=12&x=${'a'.repeat(101)}`);

    expect(contexte).toEqual({
      ecran: '/paie/analytique',
      domaine: 'Paie',
      filtres: { periode: '2026-09', chantierIds: '12' }
    });
  });

  it('laisse le domaine vide pour un écran inconnu', () => {
    expect(contexteEcran('/profil')).toEqual({ ecran: '/profil', domaine: null, filtres: {} });
  });
});
