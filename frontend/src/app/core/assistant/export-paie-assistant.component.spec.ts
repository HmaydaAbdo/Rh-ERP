import { TestBed } from '@angular/core/testing';

import { lireExportPrepare } from './export-paie-assistant';
import { ExportPaieAssistantComponent } from './export-paie-assistant.component';
import { FichiersAssistant } from './fichiers-assistant.service';

const RESULTAT = { periode: '2026-09', telechargement: { reference: 'ref.jwt.sig', nomFichier: 'Paie_Export_2026-09.xlsx' } };

describe('lireExportPrepare', () => {
  it('lit la référence dans un objet, un texte JSON ou un contenu MCP', () => {
    const attendu = { reference: 'ref.jwt.sig', nomFichier: 'Paie_Export_2026-09.xlsx', periode: '2026-09' };
    expect(lireExportPrepare(RESULTAT)).toEqual(attendu);
    expect(lireExportPrepare(JSON.stringify(RESULTAT))).toEqual(attendu);
    expect(lireExportPrepare([{ type: 'text', text: JSON.stringify(RESULTAT) }])).toEqual(attendu);
    expect(lireExportPrepare({ structuredContent: RESULTAT })).toEqual(attendu);
  });

  it('lit la référence dans l’enveloppe des surfaces A2UI (résultat d’origine en texte JSON)', () => {
    const attendu = { reference: 'ref.jwt.sig', nomFichier: 'Paie_Export_2026-09.xlsx', periode: '2026-09' };
    const enveloppe = { a2ui_operations: [{ op: 'x' }], resultat: JSON.stringify(RESULTAT) };
    expect(lireExportPrepare(JSON.stringify(enveloppe))).toEqual(attendu);
    expect(lireExportPrepare(enveloppe)).toEqual(attendu);
  });

  it('ignore un résultat sans référence ou illisible', () => {
    expect(lireExportPrepare('Aucun bulletin')).toBeNull();
    expect(lireExportPrepare(undefined)).toBeNull();
    expect(lireExportPrepare({ periode: '2026-09' })).toBeNull();
  });
});

describe('ExportPaieAssistantComponent', () => {
  function monter(appel: unknown, telechargerExport = vi.fn().mockResolvedValue(undefined)) {
    TestBed.configureTestingModule({ providers: [{ provide: FichiersAssistant, useValue: { telechargerExport } }] });
    const fixture = TestBed.createComponent(ExportPaieAssistantComponent);
    fixture.componentRef.setInput('toolCall', appel);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement, telechargerExport };
  }

  it('propose le téléchargement sans montrer la référence', async () => {
    const { fixture, page, telechargerExport } = monter({ status: 'complete', args: {}, result: JSON.stringify(RESULTAT) });

    expect(page.textContent).toContain('Télécharger Paie_Export_2026-09.xlsx');
    expect(page.textContent).not.toContain('ref.jwt.sig');
    (page.querySelector('.telecharger') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(telechargerExport).toHaveBeenCalledWith('ref.jwt.sig', 'Paie_Export_2026-09.xlsx');
  });

  it('n’affiche rien tant que l’outil n’a pas répondu', () => {
    const { page } = monter({ status: 'executing', args: {}, result: undefined, respond: vi.fn() });

    expect(page.querySelector('.telecharger')).toBeNull();
  });

  it('signale un téléchargement refusé', async () => {
    const { fixture, page } = monter(
      { status: 'complete', args: {}, result: JSON.stringify(RESULTAT) },
      vi.fn().mockRejectedValue(new Error('403'))
    );

    (page.querySelector('.telecharger') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('redemandez');
  });
});
