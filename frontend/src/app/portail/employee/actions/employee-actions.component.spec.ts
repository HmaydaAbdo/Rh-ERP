import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EmployeeService } from '../services/employee.service';
import { EmployeeActionsComponent } from './employee-actions.component';

describe('EmployeeActionsComponent', () => {
  let fixture: ComponentFixture<EmployeeActionsComponent>;
  let service: { importer: ReturnType<typeof vi.fn>; telechargerModele: ReturnType<typeof vi.fn>; exporterMouvementsPdf: ReturnType<typeof vi.fn> };
  const racine = () => fixture.nativeElement as HTMLElement;

  function afficher(permissions: string[]): void {
    service = { importer: vi.fn(), telechargerModele: vi.fn(), exporterMouvementsPdf: vi.fn().mockReturnValue(of(new Blob(['pdf']))) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: EmployeeService, useValue: service }]
    });
    fixture = TestBed.createComponent(EmployeeActionsComponent);
    fixture.detectChanges();
  }

  it('propose l’import et la création à qui en a les droits', () => {
    afficher(['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'EMPLOYEE_IMPORT']);

    expect(racine().querySelector('stp-split-button')).not.toBeNull();
    expect(racine().textContent).toContain('Nouvel employé');
  });

  it('ne propose rien à qui peut seulement lire', () => {
    afficher(['EMPLOYEE_READ']);

    expect(racine().querySelector('stp-split-button')).toBeNull();
    expect(racine().textContent).not.toContain('Nouvel employé');
  });

  it('importe le fichier choisi, annonce le bilan et prévient la page', async () => {
    afficher(['EMPLOYEE_IMPORT']);
    const importe = vi.fn();
    fixture.componentInstance.importe.subscribe(importe);
    service.importer.mockReturnValue(of({ totalLignes: 5, crees: 4, ignores: 1, lignesIgnorees: [{ numeroLigne: 5, cin: 'AB1', nomPrenom: null, raison: 'CIN déjà présent' }] }));
    const champ = racine().querySelector('input[type="file"]') as HTMLInputElement;
    const transfert = new DataTransfer();
    transfert.items.add(new File(['x'], 'employes.xlsx'));
    champ.files = transfert.files;

    champ.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(service.importer).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ summary: 'Import terminé', detail: '4 créé(s) sur 5 ligne(s)' });
    expect(importe).toHaveBeenCalledTimes(1);
  });

  it('propose le PDF des mouvements avec EMPLOYEE_EXPORT seulement', () => {
    afficher(['EMPLOYEE_READ']);
    expect(racine().textContent).not.toContain('Mouvements du mois');
  });

  it('télécharge le PDF des mouvements du mois choisi avec les filtres de la page', () => {
    afficher(['EMPLOYEE_EXPORT']);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue();
    fixture.componentRef.setInput('filtres', { nomPrenom: 'ali', cin: '', fonctionIds: [], chantierIds: [3], equipeIds: [], statut: 'ACTIF' });
    const composant = fixture.componentInstance as unknown as { moisMouvements: { set(m: string): void }; telechargerMouvements(): void };
    composant.moisMouvements.set('2026-09');

    composant.telechargerMouvements();

    const requete = service.exporterMouvementsPdf.mock.calls[0][0];
    expect(requete).toMatchObject({ periode: '2026-09', nomPrenom: 'ali', chantierIds: [3] });
    expect(requete.statut).toBeUndefined();
  });
});
