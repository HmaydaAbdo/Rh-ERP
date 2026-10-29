import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { HeuresSupp } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppListComponent } from './heures-supp-list.component';

const LIGNE: HeuresSupp = {
  id: 1, version: 0, employeeId: 2, nomPrenom: 'Alaoui Salma', cin: 'AB123', fonction: 'Chauffeur', chantierId: 4,
  codeChantier: 'C4', chantier: 'Site', periode: '2026-10', salaireHoraireDh: 10, heuresSupplementaires: 2,
  montantDh: 20, stcOuSortie: false, stcDh: 0, forfaitDh: null, netAPayerDh: 20
};

describe('HeuresSuppListComponent', () => {
  let service: { search: ReturnType<typeof vi.fn> };
  let component: { charger(event: { first: number; rows: number; sortField: string | null; sortOrder: 1 | -1 }): void;
    lignes(): HeuresSupp[]; total(): number; chargement(): boolean; erreur(): string | null };

  beforeEach(() => {
    service = { search: vi.fn().mockReturnValue(of({ content: [LIGNE], page: { totalElements: 1, number: 0, size: 20, totalPages: 1 } })) };
    TestBed.configureTestingModule({
      imports: [HeuresSuppListComponent],
      providers: [provideRouter([]), { provide: HeuresSuppService, useValue: service },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ periode: '2026-10', chantierIds: '4,5', equipeIds: '0', fonctionIds: '8' })) } }]
    });
    const fixture = TestBed.createComponent(HeuresSuppListComponent);
    component = fixture.componentInstance as unknown as typeof component;
    fixture.detectChanges();
  });

  it('applique les filtres d’URL et pagine les résultats', () => {
    component.charger({ first: 40, rows: 20, sortField: 'periode', sortOrder: -1 });

    expect(service.search).toHaveBeenCalledWith({ periode: '2026-10', chantierIds: [4, 5], equipeIds: [0], fonctionIds: [8] }, 2, 20);
    expect(component.lignes()).toEqual([LIGNE]);
    expect(component.total()).toBe(1);
    expect(component.chargement()).toBe(false);
    expect(component.erreur()).toBeNull();
  });

  it('affiche un message métier quand le chargement échoue', () => {
    service.search.mockReturnValue(throwError(() => new Error('network')));

    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });

    expect(component.erreur()).toContain('n’ont pas pu être chargées');
    expect(component.chargement()).toBe(false);
  });
});
