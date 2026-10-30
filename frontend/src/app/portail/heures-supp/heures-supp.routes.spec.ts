import { HEURES_SUPP_ROUTES } from './heures-supp.routes';

describe('HEURES_SUPP_ROUTES', () => {
  it('déclare les vues du domaine et protège import avec les permissions attendues', () => {
    const [vues, importRoute] = HEURES_SUPP_ROUTES;
    expect(vues?.data).toMatchObject({ permission: 'HEURES_SUP_READ', permissions: ['PAIE_READ'] });
    expect(vues?.children?.map((route) => route.data?.['vue'])).toEqual(['tabulaire', 'cartes', 'analytique']);
    expect(importRoute?.data).toMatchObject({ permission: 'HEURES_SUP_IMPORT', permissions: ['PAIE_READ', 'CHANTIER_READ', 'EMPLOYEE_READ', 'FUNCTION_READ'] });
    expect(importRoute?.path).toBe('import');
    expect(vues?.children?.map((route) => route.path)).toEqual(['', 'cartes', 'analytique']);
  });
});
