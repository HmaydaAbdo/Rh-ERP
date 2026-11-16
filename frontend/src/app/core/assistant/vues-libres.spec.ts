import { avecDureeMaximale, BIBLIOTHEQUES_ADMISES, POLITIQUE_CONTENU, avecPolitiqueDeContenu, chargeurVuesLibres } from './vues-libres';

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

    const charge = await chargeurVuesLibres(undefined, async () => moteur)();
    (charge as unknown as { create: (api: unknown, options: { frameContent: string }) => unknown }).create(
      { lireTout: () => 'secret' },
      { frameContent: '<head></head><body>x</body>' }
    );

    const [api, options] = create.mock.calls[0] as [Record<string, unknown>, { frameContent: string }];
    expect(Object.keys(api)).toEqual([]);
    expect(options.frameContent).toContain("connect-src 'none'");
  });

  describe('durée maximale (KAN-282)', () => {
    afterEach(() => vi.useRealTimers());

    it('retire la vue dont le code ne rend pas la main dans le délai', async () => {
      vi.useFakeTimers();
      const destroy = vi.fn();
      const vue = avecDureeMaximale({ run: (_code: string) => new Promise(() => undefined), destroy }, 15_000);

      const fin = vue.run('while(true){}');
      await vi.advanceTimersByTimeAsync(15_001);

      await expect(fin).resolves.toBeUndefined();
      expect(destroy).toHaveBeenCalledTimes(1);
      await expect(vue.run('encore')).resolves.toBeUndefined();
    });

    it('laisse en paix une vue qui rend la main à temps', async () => {
      vi.useFakeTimers();
      const destroy = vi.fn();
      const vue = avecDureeMaximale({ run: (_code: string) => Promise.resolve('fait'), destroy }, 15_000);

      await expect(vue.run('1+1')).resolves.toBe('fait');
      await vi.advanceTimersByTimeAsync(60_000);

      expect(destroy).not.toHaveBeenCalled();
    });

    it('lit la durée dans la politique et retombe sur 15 s si elle est illisible', async () => {
      const create = vi.fn().mockReturnValue({ run: vi.fn(), destroy: vi.fn() });
      const charge = await chargeurVuesLibres(() => Promise.reject(new Error('panne')), async () => ({ create }) as never)();

      expect(() => (charge as unknown as { create: (a: unknown, o: object) => unknown }).create({}, {})).not.toThrow();
    });
  });
});
