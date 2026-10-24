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
    expect(html).toContain('Staport · Ressources humaines');
    expect(html).toContain('Édité le');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;script&gt;texte&lt;/script&gt;');
    expect(html.match(/<tbody><tr>/g)).toHaveLength(1);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(fenetre.document.close).toHaveBeenCalledOnce();
  });

  it('inclut le graphique du composant et conserve son tableau de données dans le PDF', () => {
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
      titre: 'Effectif par équipe',
      graphiqueDataUrl: 'data:image/png;base64,AAAA',
      graphiqueAlt: 'Effectif <par équipe>',
      colonnes: ['Équipe', 'Effectif'],
      lignes: [['Chauffeurs', 12]]
    });

    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="Effectif &lt;par équipe&gt;"');
    expect(html).toContain('<td>Chauffeurs</td><td>12</td>');
  });
});
