import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { PaieImportResult } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieActionsComponent } from './paie-actions.component';

const RESULTAT: PaieImportResult = {
  periode: '2026-08',
  totalLignes: 3,
  crees: 3,
  ignores: 0,
  fonctionsCreees: [],
  lignesIgnorees: []
};

describe('PaieActionsComponent', () => {
  let service: jasmine.SpyObj<PaieService>;
  let permissions: string[];
  let fixture: ComponentFixture<PaieActionsComponent>;

  function boutons(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.app-page__actions button')).map((b) => (b.textContent ?? '').trim());
  }

  async function creer(droits: string[]): Promise<PaieActionsComponent> {
    permissions = droits;
    fixture = TestBed.createComponent(PaieActionsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    service = jasmine.createSpyObj<PaieService>('PaieService', ['importer', 'telechargerModele', 'listerPeriodes', 'rechercherChantiers']);
    service.listerPeriodes.and.returnValue(of([]));
    service.rechercherChantiers.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
        { provide: PaieService, useValue: service },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions.includes(code) } }
      ]
    });
  });

  it('montre chaque bouton avec sa permission seulement', async () => {
    await creer(['PAIE_EXPORT']);
    expect(boutons()).toEqual(['Exporter']);

    fixture.destroy();
    await creer(['PAIE_EXPORT', 'PAIE_IMPORT', 'PAIE_WRITE']);
    const libelles = boutons();
    expect(libelles).toContain('Exporter');
    expect(libelles).toContain('Importer');
    expect(libelles).toContain('Nouveau bulletin');
  });

  it('ne montre aucun bouton sans permission', async () => {
    await creer(['PAIE_READ']);

    expect(boutons()).toEqual([]);
  });

  it('prévient la page après un import, pour que la vue se recharge', async () => {
    service.importer.and.returnValue(of(RESULTAT));
    const composant = await creer(['PAIE_IMPORT']);
    const importe = jasmine.createSpy('importe');
    composant.importe.subscribe(importe);
    composant.importForm.controls.periode.setValue(new Date(2026, 7, 1));

    const fichier = new File(['x'], 'paie.xlsx');
    composant.onImportFileSelected({ target: { files: [fichier], value: 'paie.xlsx' } } as unknown as Event);

    expect(service.importer).toHaveBeenCalledWith(fichier, '2026-08');
    expect(importe).toHaveBeenCalledTimes(1);
    expect(composant.showImportResultDialog).toBeTrue();
    expect(composant.showImportDialog).toBeFalse();
  });

  it('ne lance aucun import sans mois choisi', async () => {
    const composant = await creer(['PAIE_IMPORT']);

    composant.onImportFileSelected({ target: { files: [new File(['x'], 'paie.xlsx')], value: '' } } as unknown as Event);

    expect(service.importer).not.toHaveBeenCalled();
  });
});
