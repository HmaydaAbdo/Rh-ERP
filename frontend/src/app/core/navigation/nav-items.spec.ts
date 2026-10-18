import { NAV_ITEMS } from './nav-items';

describe('NAV_ITEMS', () => {
  it('chaque écran se règle sur une permission de lecture, jamais sur un rôle codé en dur', () => {
    for (const item of NAV_ITEMS) {
      expect(item.permission).toMatch(/^[A-Z]+(_[A-Z]+)+$/);
    }
  });

  it('chaque écran a une route absolue et un libellé uniques', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.route)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.label)).size).toBe(NAV_ITEMS.length);
    expect(NAV_ITEMS.every((i) => i.route.startsWith('/'))).toBe(true);
  });

  it('la paie est le premier écran du menu (écran d’accueil de qui y a accès)', () => {
    expect(NAV_ITEMS[0]).toMatchObject({ label: 'Paie', route: '/paie', permission: 'PAIE_READ' });
  });

  it('l’administration et le journal passent après les écrans métier', () => {
    const routes = NAV_ITEMS.map((i) => i.route);

    expect(routes.indexOf('/admin/users')).toBeGreaterThan(routes.indexOf('/equipes'));
    expect(routes).toContain('/admin/parametres');
    expect(routes.at(-1)).toBe('/audit');
  });

  it('la carte se règle sur sa propre permission et vient juste après les chantiers', () => {
    const routes = NAV_ITEMS.map((i) => i.route);

    expect(NAV_ITEMS.find((i) => i.route === '/carte')).toMatchObject({ label: 'Carte', permission: 'CARTE_READ' });
    expect(routes.indexOf('/carte')).toBe(routes.indexOf('/chantiers') + 1);
  });

  it('aucune route du menu n’est le préfixe d’une autre (un seul lien surligné à la fois)', () => {
    for (const a of NAV_ITEMS) {
      for (const b of NAV_ITEMS) {
        if (a !== b) {
          expect(b.route.startsWith(`${a.route}/`)).toBe(false);
        }
      }
    }
  });
});
