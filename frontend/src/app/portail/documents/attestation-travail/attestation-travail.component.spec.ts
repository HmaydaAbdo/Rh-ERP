import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { Employee } from '../../employee/models/employee.model';
import { EmployeeService } from '../../employee/services/employee.service';
import { AttestationTravailComponent, raisonsAttestationImpossible } from './attestation-travail.component';

registerLocaleData(localeFr);

const DECLARE: Employee = {
  id: 9, version: 0, nomPrenom: 'ALAMI YOUSSEF', cin: 'AB123456', dateNaissance: '1990-03-07', dateEmbauche: '2024-06-01',
  fonction: { id: 1, libelle: 'CHAUFFEUR CAMION' }, chantier: { id: 2, code: 'C196' }, equipe: null, salaire: null,
  typeSalaire: null, statut: 'ACTIF', matriculeCnss: '123456789', dateDeclarationCnss: '2024-06-01', civilite: 'MONSIEUR'
};

describe('raisonsAttestationImpossible', () => {
  it('n’a rien à objecter pour un employé en poste et déclaré', () => {
    expect(raisonsAttestationImpossible(DECLARE)).toEqual([]);
  });

  it('nomme chaque manque, comme le serveur', () => {
    expect(raisonsAttestationImpossible({ ...DECLARE, statut: 'INACTIF', matriculeCnss: null, dateDeclarationCnss: null })).toEqual([
      'l’employé n’est plus en poste',
      'le matricule CNSS n’est pas renseigné',
      'la date de déclaration CNSS n’est pas renseignée'
    ]);
  });
});

describe('AttestationTravailComponent', () => {
  const service = { getById: vi.fn(), attestationTravail: vi.fn() };
  const references = { fetchPage: vi.fn(), fetchById: vi.fn() };

  function afficher(employe: Employee) {
    service.getById.mockReset().mockReturnValue(of(employe));
    service.attestationTravail.mockReset().mockReturnValue(of(new Blob(['%PDF'], { type: 'application/pdf' })));
    references.fetchPage.mockReturnValue(of({ items: [], totalRecords: 0 }));
    references.fetchById.mockReturnValue(of({ ...employe, displayLabel: `${employe.nomPrenom} — ${employe.cin}` }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        fournirPermissions(['DOCUMENT_ADMIN_EDITER', 'EMPLOYEE_READ']).providers,
        { provide: EmployeeService, useValue: service },
        { provide: EmployeeReferenceService, useValue: references }
      ]
    });
    const fixture = TestBed.createComponent(AttestationTravailComponent);
    fixture.detectChanges();
    const composant = fixture.componentInstance as unknown as { form: { employeeId: () => { value: { set(v: number): void } }; civilite: () => { value: () => unknown } } };
    composant.form.employeeId().value.set(employe.id);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement, composant };
  }

  it('montre ce qui sera imprimé et propose la civilité de la fiche', async () => {
    const { fixture, page, composant } = afficher(DECLARE);
    await fixture.whenStable();
    fixture.detectChanges();

    const faits = page.querySelector('.app-facts')?.textContent?.replace(/\s+/g, ' ');
    expect(faits).toContain('AB123456');
    expect(faits).toContain('123456789');
    expect(faits).toContain('01/06/2024');
    expect(composant.form.civilite().value()).toBe('MONSIEUR');
    const bouton = page.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
  });

  it('explique pourquoi l’attestation est impossible et bloque l’impression', async () => {
    const { fixture, page } = afficher({ ...DECLARE, matriculeCnss: null });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).toContain('Attestation impossible : le matricule CNSS n’est pas renseigné');
    const bouton = page.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });
});
