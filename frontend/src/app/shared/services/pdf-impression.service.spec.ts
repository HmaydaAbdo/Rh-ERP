import { PdfImpressionService } from './pdf-impression.service';

describe('PdfImpressionService', () => {
  it('imprime un tableau complet et échappe le contenu fourni', () => {
    const service = new PdfImpressionService();
    let html = '';
    const fenetre = {
      document: {
        open: vi.fn(),
        write: vi.fn((value: string) => { html = value; }),
        close: vi.fn()
      }
    } as unknown as Window;

    service.imprimer(fenetre, {
      titre: 'Équipes <actives>',
      contexte: 'Toutes les équipes',
      colonnes: ['Libellé'],
      lignes: [['A & B'], ['<script>texte</script>']]
    });

    expect(fenetre.document.open).toHaveBeenCalledOnce();
    expect(html).toContain('Équipes &lt;actives&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;script&gt;texte&lt;/script&gt;');
    expect(html.match(/<tbody><tr>/g)).toHaveLength(1);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(fenetre.document.close).toHaveBeenCalledOnce();
  });
});
