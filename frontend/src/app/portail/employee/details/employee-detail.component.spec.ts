import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { AuditService } from '../../audit/services/audit.service';
import { PaieService } from '../../paie/services/paie.service';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeDetailComponent } from './employee-detail.component';

registerLocaleData(localeFr);

const EMPLOYE: Employee = {
  id: 9,
  version: 0,
  nomPrenom: 'Ali Alaoui',
  cin: 'AB123',
  dateNaissance: '1990-03-07',
  dateEmbauche: '2020-11-02',
  fonction: { id: 1, libelle: 'MACON' },
  chantier: { id: 2, code: 'C196' },
  equipe: null,
  salaire: null,
  typeSalaire: null,
  statut: 'ACTIF'
};

describe('EmployeeDetailComponent', () => {
  const service = { getById: vi.fn() };
  const audit = { historique: vi.fn() };
  const paie = { parcours: vi.fn() };

  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 9, 19), toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  function afficher(permissions: string[], employe: Employee = EMPLOYE, reponse?: Observable<Employee>) {
    service.getById.mockReset().mockReturnValue(reponse ?? of(employe));
    paie.parcours.mockReset().mockReturnValue(of({ employeId: 9, indicateurs: { moisPayes: 0, totalPercu: 0, joursTravailles: 0, premierMois: null, dernierMois: null }, mois: [], evenements: [] }));
    audit.historique.mockReset().mockReturnValue(of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        fournirRoute({ id: '9' }),
        fournirPermissions(permissions).providers,
        { provide: EmployeeService, useValue: service },
        { provide: AuditService, useValue: audit },
        { provide: PaieService, useValue: paie }
      ]
    });
    const fixture = TestBed.createComponent(EmployeeDetailComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  const valeurs = (page: HTMLElement) => Array.from(page.querySelectorAll('.employee-fiche__situation dd')).map((d) => d.textContent?.replace(/\s+/g, ' ').trim());

  it('annonce le chargement avant de présenter l’identité', () => {
    const reponse = new Subject<Employee>();
    const { fixture, page } = afficher(['EMPLOYEE_READ'], EMPLOYE, reponse);
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Chargement');
    expect(page.textContent).not.toContain('Ali Alaoui');

    reponse.next(EMPLOYE);
    reponse.complete();
    fixture.detectChanges();

    expect(page.querySelector('h1')?.textContent).toBe('Ali Alaoui');
    expect(page.querySelector('[role="status"]')).toBeNull();
  });

  it('affiche une erreur de lecture avec retour et réessai', () => {
    const { fixture, page } = afficher(['EMPLOYEE_READ'], EMPLOYE, throwError(() => new Error('indisponible')));
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger l’employé');
    expect(page.querySelector('a[href="/employees"]')).not.toBeNull();

    service.getById.mockReturnValue(of(EMPLOYE));
    (page.querySelector('stp-message button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.getById).toHaveBeenCalledTimes(2);
    expect(page.querySelector('h1')?.textContent).toBe('Ali Alaoui');
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('montre l’identité, la situation actuelle, l’ancienneté et l’âge', () => {
    const { page } = afficher(['EMPLOYEE_READ']);

    expect(service.getById).toHaveBeenCalledWith(9);
    expect(page.querySelector('h1')?.textContent).toBe('Ali Alaoui');
    expect(page.querySelector('.employee-fiche__initiales')?.textContent).toBe('AA');
    expect(page.querySelector('.employee-fiche__identite p span')?.textContent).toBe('CIN AB123');
    expect(valeurs(page)).toEqual(['MACON', 'C196', 'Sans équipe', '5 ans et 11 mois depuis le 02/11/2020', '36 ans né le 07/03/1990']);
  });

  it('montre l’équipe, puis le salaire et le parcours à qui peut lire la paie seulement', () => {
    const employe: Employee = { ...EMPLOYE, equipe: { id: 5, code: 'OP', libelle: 'Opérateurs' }, salaire: 120, typeSalaire: 'JOURNALIER' };

    const sans = afficher(['EMPLOYEE_READ'], employe).page;
    expect(valeurs(sans)[2]).toBe('OP — Opérateurs');
    expect(valeurs(sans).some((v) => v?.includes('par jour'))).toBe(false);
    expect(sans.querySelector('app-paie-parcours')).toBeNull();
    expect(paie.parcours).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const avec = afficher(['EMPLOYEE_READ', 'PAIE_READ'], employe).page;
    expect(valeurs(avec)[3]?.replace(/\s+/g, ' ')).toBe('120,00 par jour');
    expect(avec.querySelector('app-paie-parcours')).not.toBeNull();
    expect(paie.parcours).toHaveBeenCalledWith(9);
  });

  it('signale un employé sorti', () => {
    const { page } = afficher(['EMPLOYEE_READ'], { ...EMPLOYE, statut: 'INACTIF' });

    expect(page.querySelector('stp-badge')?.textContent?.trim()).toBe('Sorti');
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
