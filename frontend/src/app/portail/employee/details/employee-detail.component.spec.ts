import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { AuditService } from '../../audit/services/audit.service';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeDetailComponent } from './employee-detail.component';

const EMPLOYE: Employee = {
  id: 9,
  version: 0,
  nomPrenom: 'Ali Alaoui',
  cin: 'AB123',
  dateNaissance: '1990-03-07',
  dateEmbauche: '2020-11-02',
  fonction: { id: 1, libelle: 'MACON' },
  chantier: { id: 2, code: 'C196' },
  statut: 'ACTIF'
};

describe('EmployeeDetailComponent', () => {
  const service = { getById: vi.fn() };
  const audit = { historique: vi.fn() };

  function afficher(permissions: string[], employe: Employee = EMPLOYE) {
    service.getById.mockReset().mockReturnValue(of(employe));
    audit.historique.mockReset().mockReturnValue(of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirRoute({ id: '9' }),
        fournirPermissions(permissions).providers,
        { provide: EmployeeService, useValue: service },
        { provide: AuditService, useValue: audit }
      ]
    });
    const fixture = TestBed.createComponent(EmployeeDetailComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  const valeurs = (page: HTMLElement) => Array.from(page.querySelectorAll('dd')).map((d) => d.textContent?.trim());

  it('charge l’employé de l’adresse et affiche son identité, ses dates (jj/mm/aaaa), sa fonction et son chantier', () => {
    const { page } = afficher(['EMPLOYEE_READ']);

    expect(service.getById).toHaveBeenCalledWith(9);
    expect(page.querySelector('h1')?.textContent).toBe('Ali Alaoui');
    expect(valeurs(page)).toEqual(['AB123', 'Actif', '07/03/1990', '02/11/2020', 'MACON', 'C196']);
  });

  it('signale un employé inactif', () => {
    const { page } = afficher(['EMPLOYEE_READ'], { ...EMPLOYE, statut: 'INACTIF' });

    expect(valeurs(page)[1]).toBe('Inactif');
  });

  it('propose « Modifier » seulement à qui peut écrire', () => {
    expect(afficher(['EMPLOYEE_READ', 'EMPLOYEE_WRITE']).page.querySelector('a[href="/employees/9/edit"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(afficher(['EMPLOYEE_READ']).page.querySelector('a[href="/employees/9/edit"]')).toBeNull();
  });

  it('ne propose l’historique qu’avec la permission d’audit', () => {
    const sans = afficher(['EMPLOYEE_READ']);
    expect(sans.page.textContent).not.toContain('Historique');
    TestBed.resetTestingModule();

    const avec = afficher(['EMPLOYEE_READ', 'AUDIT_READ']);
    expect(avec.page.textContent).toContain('Historique');
  });

  it('ouvre l’historique de l’employé dans un dialogue et ne le charge qu’à l’ouverture', async () => {
    const { fixture, page } = afficher(['EMPLOYEE_READ', 'AUDIT_READ']);
    expect(audit.historique).not.toHaveBeenCalled();

    (Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Historique')) as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(audit.historique).toHaveBeenCalledWith('Employee', 9, expect.anything());
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });
});
