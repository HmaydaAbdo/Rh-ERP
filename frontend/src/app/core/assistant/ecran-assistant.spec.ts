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

  it('n’envoie ni saisie libre ni donnée personnelle (nom, CIN, code)', () => {
    const contexte = contexteEcran('/employees?nom=Ali&cin=AB123456&code=C1&statut=ACTIF&page=2');

    expect(contexte.filtres).toEqual({ statut: 'ACTIF', page: '2' });
  });

  it('laisse le domaine vide pour un écran inconnu', () => {
    expect(contexteEcran('/profil')).toEqual({ ecran: '/profil', domaine: null, filtres: {} });
  });
});
