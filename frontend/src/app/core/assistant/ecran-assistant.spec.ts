import { contexteEcran, suggestionsPour } from './ecran-assistant';

describe('ecran-assistant', () => {
  it('propose des questions du domaine de l’écran ouvert', () => {
    expect(suggestionsPour('/paie/analytique?periode=2026-09').map((s) => s.title)).toContain('Masse salariale');
    expect(suggestionsPour('/employees')[0].message).toContain('employés');
    expect(suggestionsPour('/audit').length).toBeGreaterThan(0);
  });

  it('retombe sur des questions générales hors des domaines connus', () => {
    const generales = suggestionsPour('/tableau-de-bord');

    expect(generales.map((s) => s.title)).toContain('Que sais-tu faire ?');
    expect(suggestionsPour('/')).toEqual(generales);
  });

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
