import { cibleDeVue } from './vue-assistant';

describe('cibleDeVue', () => {
  it('traduit une vue analytique de la paie en route connue, filtres appliqués', () => {
    const cible = cibleDeVue({ module: 'paie', vue: 'analytique', parametres: { periode: '2026-09', chantierIds: '12' } });

    expect(cible).toEqual({
      commandes: ['/paie', 'analytique'],
      queryParams: { periode: '2026-09', chantierIds: '12' },
      libelle: 'Paie · Analytique',
      filtres: ['Période 2026-09', '1 chantier']
    });
  });

  it('ouvre la vue tabulaire à la racine du module et une fiche par son identifiant', () => {
    expect(cibleDeVue({ module: 'employees', vue: 'tabulaire', parametres: { nom: 'Amrani', statut: 'EN_POSTE' } })).toMatchObject({
      commandes: ['/employees'],
      filtres: ['Nom « Amrani »', 'Statut en poste']
    });
    expect(cibleDeVue({ module: 'employees', vue: 'fiche', parametres: { id: '42' } })).toMatchObject({
      commandes: ['/employees', '42'],
      queryParams: {},
      libelle: 'Employés · Fiche'
    });
    expect(cibleDeVue({ module: 'admin/roles', vue: 'tabulaire', parametres: {} })?.commandes).toEqual(['/admin/roles']);
  });

  it('conserve les critères Employé aux limites du contrat : nom de 150 caractères et CIN de 30', () => {
    const parametres = { nom: 'N'.repeat(150), cin: 'C'.repeat(30) };

    expect(cibleDeVue({ module: 'employees', vue: 'tabulaire', parametres })).toMatchObject({
      commandes: ['/employees'],
      queryParams: parametres,
      filtres: [`Nom « ${parametres.nom} »`, `CIN ${parametres.cin}`]
    });
    expect(cibleDeVue({ module: 'employees', vue: 'tabulaire', parametres: { nom: 'N', cin: 'C' } })).not.toBeNull();
  });

  it('accepte les caractères de CIN permis par les DTO sans les transformer en route', () => {
    const cin = 'أب-12 /34.é?x=1&#';

    expect(cibleDeVue({ module: 'employees', vue: 'tabulaire', parametres: { cin } })).toMatchObject({
      commandes: ['/employees'],
      queryParams: { cin },
      filtres: [`CIN ${cin}`]
    });
  });

  it('refuse les critères Employé vides, blancs, trop longs ou non textuels', () => {
    for (const cle of ['nom', 'cin']) {
      const limite = cle === 'nom' ? 150 : 30;
      for (const valeur of ['', '   ', '\t\n', 'X'.repeat(limite + 1), null, 123, ['AB1']]) {
        expect(cibleDeVue({ module: 'employees', vue: 'tabulaire', parametres: { [cle]: valeur } })).toBeNull();
      }
    }
  });

  it('refuse tout module, vue ou paramètre hors de la liste blanche', () => {
    expect(cibleDeVue({ module: 'users', vue: 'tabulaire', parametres: {} })).toBeNull();
    expect(cibleDeVue({ module: 'paie', vue: 'fiche', parametres: { id: '1' } })).toBeNull();
    expect(cibleDeVue({ module: 'paie', vue: 'analytique', parametres: { redirect: 'https://exemple.test' } })).toBeNull();
    expect(cibleDeVue({ module: 'audit', vue: 'cartes', parametres: {} })).toBeNull();
  });

  it('refuse les valeurs mal formées', () => {
    expect(cibleDeVue({ module: 'paie', vue: 'analytique', parametres: { periode: '2026-13' } })).toBeNull();
    expect(cibleDeVue({ module: 'paie', vue: 'analytique', parametres: { chantierIds: '12;DROP' } })).toBeNull();
    expect(cibleDeVue({ module: 'paie', vue: 'tabulaire', parametres: { action: 'supprimer' } })).toBeNull();
    expect(cibleDeVue({ module: 'employees', vue: 'fiche', parametres: { id: '../admin' } })).toBeNull();
  });

  it('refuse ce qui n’a pas la forme d’une vue', () => {
    for (const valeur of [null, 'paie', 12, { module: 'paie' }, { module: 'paie', vue: 'analytique', parametres: ['x'] }]) {
      expect(cibleDeVue(valeur)).toBeNull();
    }
  });
});
