import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EquipeService } from '../services/equipe.service';
import { EquipeActionsComponent } from './equipe-actions.component';

describe('EquipeActionsComponent', () => {
  let fixture: ComponentFixture<EquipeActionsComponent>;
  let service: { importer: ReturnType<typeof vi.fn>; telechargerModele: ReturnType<typeof vi.fn> };
  const page = () => fixture.nativeElement as HTMLElement;

  function afficher(permissions: string[]): void {
    service = { importer: vi.fn(), telechargerModele: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: EquipeService, useValue: service }]
    });
    fixture = TestBed.createComponent(EquipeActionsComponent);
    fixture.detectChanges();
  }

  it('affiche import et création selon leurs permissions distinctes', () => {
    afficher(['EQUIPE_WRITE', 'EQUIPE_IMPORT']);
    expect(page().querySelector('stp-split-button')).not.toBeNull();
    expect(page().querySelector('a[href="/equipes/new"]')?.textContent).toContain('Nouvelle équipe');
  });

  it('masque les actions sans les permissions correspondantes', () => {
    afficher(['EQUIPE_READ']);
    expect(page().querySelector('stp-split-button')).toBeNull();
    expect(page().querySelector('a[href="/equipes/new"]')).toBeNull();
  });

  it('envoie le fichier, annonce le résultat et demande le rafraîchissement', async () => {
    afficher(['EQUIPE_IMPORT']);
    const imported = vi.fn();
    fixture.componentInstance.importe.subscribe(imported);
    service.importer.mockReturnValue(of({ totalLignes: 2, crees: 2, ignores: 0, lignesIgnorees: [] }));
    const input = page().querySelector('input[type="file"]') as HTMLInputElement;
    const transfer = new DataTransfer();
    const file = new File(['xlsx'], 'equipes.xlsx');
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.importer).toHaveBeenCalledWith(file);
    expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ summary: 'Import terminé', detail: '2 créée(s) sur 2 ligne(s)' });
    expect(imported).toHaveBeenCalledOnce();
  });

  it('présente le motif de rejet et ne demande pas de rafraîchissement', async () => {
    afficher(['EQUIPE_IMPORT']);
    const imported = vi.fn();
    fixture.componentInstance.importe.subscribe(imported);
    service.importer.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: {
      totalLignes: 1, crees: 0, ignores: 1, lignesIgnorees: [{ numeroLigne: 2, code: 'CH', libelle: 'Autre', raison: "Code d'équipe déjà existant" }]
    } })));
    const input = page().querySelector('input[type="file"]') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File(['xlsx'], 'equipes.xlsx'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Code d'équipe déjà existant");
    expect(imported).not.toHaveBeenCalled();
  });
});
