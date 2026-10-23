import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { FunctionService } from '../services/function.service';
import { FunctionActionsComponent } from './function-actions.component';

describe('FunctionActionsComponent', () => {
  let fixture: ComponentFixture<FunctionActionsComponent>;
  let service: { importer: ReturnType<typeof vi.fn>; telechargerModele: ReturnType<typeof vi.fn> };
  const racine = () => fixture.nativeElement as HTMLElement;

  function afficher(permissions: string[]): void {
    service = { importer: vi.fn(), telechargerModele: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: FunctionService, useValue: service }]
    });
    fixture = TestBed.createComponent(FunctionActionsComponent);
    fixture.detectChanges();
  }

  it('propose l’import et la création à qui en a les droits', () => {
    afficher(['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_IMPORT']);

    expect(racine().querySelector('stp-split-button')).not.toBeNull();
    expect(racine().querySelector('a[href="/functions/new"]')?.textContent).toContain('Nouvelle fonction');
  });

  it('ne propose rien à qui peut seulement lire', () => {
    afficher(['FUNCTION_READ']);

    expect(racine().querySelector('stp-split-button')).toBeNull();
    expect(racine().textContent).not.toContain('Nouvelle fonction');
  });

  it('importe le fichier choisi, annonce le bilan et prévient la page', async () => {
    afficher(['FUNCTION_IMPORT']);
    const importe = vi.fn();
    fixture.componentInstance.importe.subscribe(importe);
    service.importer.mockReturnValue(of({ totalLignes: 5, crees: 4, ignores: 1, lignesIgnorees: [{ numeroLigne: 5, libelle: 'CHEF', raison: 'Fonction déjà existante' }] }));
    const champ = racine().querySelector('input[type="file"]') as HTMLInputElement;
    const transfert = new DataTransfer();
    transfert.items.add(new File(['x'], 'fonctions.xlsx'));
    champ.files = transfert.files;

    champ.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(service.importer).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ summary: 'Import terminé', detail: '4 créée(s) sur 5 ligne(s)' });
    expect(importe).toHaveBeenCalledTimes(1);
  });

  it('montre le détail des lignes refusées quand le serveur rejette tout le fichier', async () => {
    afficher(['FUNCTION_IMPORT']);
    const importe = vi.fn();
    fixture.componentInstance.importe.subscribe(importe);
    const refus = new HttpErrorResponse({ status: 400, error: { totalLignes: 1, crees: 0, ignores: 1, lignesIgnorees: [{ numeroLigne: 2, libelle: '', raison: 'Libellé vide' }] } });
    service.importer.mockReturnValue(throwError(() => refus));
    const champ = racine().querySelector('input[type="file"]') as HTMLInputElement;
    const transfert = new DataTransfer();
    transfert.items.add(new File(['x'], 'fonctions.xlsx'));
    champ.files = transfert.files;

    champ.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Libellé vide');
    expect(TestBed.inject(NotificationService).notifications()).toEqual([]);
    expect(importe).not.toHaveBeenCalled();
  });

  it('ne fait rien quand aucun fichier n’est choisi', () => {
    afficher(['FUNCTION_IMPORT']);

    (racine().querySelector('input[type="file"]') as HTMLInputElement).dispatchEvent(new Event('change'));

    expect(service.importer).not.toHaveBeenCalled();
  });
});
