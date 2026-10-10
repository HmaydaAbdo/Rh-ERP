import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { AuditService } from '../../audit/services/audit.service';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieDetailComponent } from './paie-detail.component';

registerLocaleData(localeFr);

const BULLETIN: Paie = {
  id: 8,
  employee: { id: 9, nomPrenom: 'Ali Alaoui', cin: 'AB123' },
  periode: '2026-08',
  fonction: { id: 1, libelle: 'MACON' },
  chantier: { id: 2, code: 'C196', designation: 'Marrakech' },
  equipe: { id: 3, code: 'CH', libelle: 'Chauffeurs' },
  nombreJoursTravailles: 26,
  joursRecuperationOuvrable: 1.5,
  joursRecuperationDimanche: null,
  salaireMensuel: 4000,
  primeRoulageOrdinaire: 120.5,
  primeRoulageDimanche: null,
  salaireTotal: 4350.5,
  observation: null
};

describe('PaieDetailComponent', () => {
  const service = { getById: vi.fn() };
  const audit = { historique: vi.fn() };

  function afficher(permissions: string[], bulletin: Paie = BULLETIN) {
    service.getById.mockReset().mockReturnValue(of(bulletin));
    audit.historique.mockReset().mockReturnValue(of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        fournirRoute({ id: '8' }),
        fournirPermissions(permissions).providers,
        { provide: PaieService, useValue: service },
        { provide: AuditService, useValue: audit }
      ]
    });
    const fixture = TestBed.createComponent(PaieDetailComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  const valeurs = (page: HTMLElement) => Array.from(page.querySelectorAll('dd')).map((d) => d.textContent?.replace(/\s/g, ' ').trim());

  it('charge le bulletin de l’adresse et affiche l’employé, la période, l’affectation et les montants', () => {
    const { page } = afficher(['PAIE_READ']);

    expect(service.getById).toHaveBeenCalledWith(8);
    expect(page.querySelector('h1')?.textContent).toBe('Ali Alaoui — 2026-08');
    expect(valeurs(page)).toEqual([
      'AB123',
      'MACON',
      'C196',
      'Chauffeurs (CH)',
      '26',
      '1.5 / 0',
      '4 000,00',
      '120,50 / 0,00',
      '4 350,50',
      '—'
    ]);
  });

  it('remplace une équipe absente et une observation vide par un tiret, et affiche l’observation saisie', () => {
    const sans = afficher(['PAIE_READ'], { ...BULLETIN, equipe: null });
    expect(valeurs(sans.page)[3]).toBe('—');
    TestBed.resetTestingModule();

    const avec = afficher(['PAIE_READ'], { ...BULLETIN, observation: 'Heures de nuit' });
    expect(valeurs(avec.page).at(-1)).toBe('Heures de nuit');
  });

  it('propose « Modifier » seulement à qui peut écrire', () => {
    expect(afficher(['PAIE_READ', 'PAIE_WRITE']).page.querySelector('a[href="/paie/8/edit"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(afficher(['PAIE_READ']).page.querySelector('a[href="/paie/8/edit"]')).toBeNull();
  });

  it('ne propose l’historique qu’avec la permission d’audit, et ne le charge qu’à l’ouverture', async () => {
    expect(afficher(['PAIE_READ']).page.textContent).not.toContain('Historique');
    TestBed.resetTestingModule();

    const { fixture, page } = afficher(['PAIE_READ', 'AUDIT_READ']);
    expect(audit.historique).not.toHaveBeenCalled();
    (Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Historique')) as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(audit.historique).toHaveBeenCalledWith('Paie', 8, expect.anything());
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });
});
