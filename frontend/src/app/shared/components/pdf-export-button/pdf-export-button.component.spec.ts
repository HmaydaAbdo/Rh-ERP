import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PdfImpressionDocument, PdfImpressionService } from '../../services/pdf-impression.service';
import { PdfExportButtonComponent } from './pdf-export-button.component';

describe('PdfExportButtonComponent', () => {
  let fixture: ComponentFixture<PdfExportButtonComponent>;
  let impression: { ouvrir: ReturnType<typeof vi.fn>; imprimer: ReturnType<typeof vi.fn> };
  const document: PdfImpressionDocument = { titre: 'Employés', colonnes: ['Nom'], lignes: [['Ada']] };

  beforeEach(() => {
    impression = { ouvrir: vi.fn().mockReturnValue({ close: vi.fn() }), imprimer: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: PdfImpressionService, useValue: impression }] });
  });

  it('imprime directement le document associé au composant', () => {
    fixture = TestBed.createComponent(PdfExportButtonComponent);
    fixture.componentRef.setInput('document', document);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();

    expect(impression.ouvrir).toHaveBeenCalledOnce();
    expect(impression.imprimer).toHaveBeenCalledWith(expect.anything(), document);
  });

  it('autorise le chargement complet asynchrone même si le document initial est vide', () => {
    const chargerDocument = vi.fn(() => of(document));
    fixture = TestBed.createComponent(PdfExportButtonComponent);
    fixture.componentRef.setInput('document', { titre: 'Employés', colonnes: [], lignes: [] });
    fixture.componentRef.setInput('chargerDocument', chargerDocument);
    fixture.detectChanges();

    const bouton = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(bouton.disabled).toBe(false);
    bouton.click();

    expect(chargerDocument).toHaveBeenCalledOnce();
    expect(impression.imprimer).toHaveBeenCalledWith(expect.anything(), document);
  });

  it('expose une action PDF en icône avec un nom accessible et une info-bulle', () => {
    fixture = TestBed.createComponent(PdfExportButtonComponent);
    fixture.componentRef.setInput('document', document);
    fixture.componentRef.setInput('iconOnly', true);
    fixture.componentRef.setInput('ariaLabel', 'Exporter les résultats en PDF');
    fixture.detectChanges();

    const bouton = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(bouton.getAttribute('aria-label')).toBe('Exporter les résultats en PDF');
    expect(bouton.title).toBe('Exporter les résultats en PDF');
    expect(bouton.classList).toContain('stp-button--icon-only');
    expect(bouton.textContent?.trim()).toBe('');
  });
});
