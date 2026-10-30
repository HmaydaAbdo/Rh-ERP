import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { HeuresSupp } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppListComponent } from './heures-supp-list.component';

const LIGNE: HeuresSupp = {
  id: 1, version: 0, employeeId: 2, nomPrenom: 'Alaoui Salma', cin: 'AB123', fonction: 'Chauffeur', chantierId: 4,
  codeChantier: 'C4', chantier: 'Site', periode: '2026-10', salaireReferenceDh: 4000, typeSalaireReference: 'MENSUEL', salaireHoraireDh: 10, heuresSupplementaires: 2,
  montantDh: 20, stcOuSortie: false, stcDh: 0, forfaitDh: null, netAPayerDh: 20
};

describe('HeuresSuppListComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HeuresSuppListComponent>>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let confirmation: { confirm: ReturnType<typeof vi.fn> };
  let component: {
    charger(event: { first: number; rows: number; sortField: string | null; sortOrder: 1 | -1 }): void;
    lignes(): HeuresSupp[]; total(): number; totalNetAPayer(): number | null; erreur(): string | null;
    criteres: { periode?: string; chantierIds?: number[]; equipeIds?: number[]; fonctionIds?: number[]; cin?: string; nomPrenom?: string };
    supprimer(ligne: HeuresSupp): void; preparerPurge(): void; purgerMois(): void;
    purgeNombre(): number | null; purgeSaisie: { set(value: number | null): void };
  };

  beforeEach(() => {
    service = {
      search: vi.fn().mockReturnValue(of({ content: [LIGNE], page: { totalElements: 1, number: 0, size: 20, totalPages: 1 } })),
      analyser: vi.fn().mockReturnValue(of({ indicateurs: { netAPayerDh: 20 } })),
      supprimer: vi.fn().mockReturnValue(of(undefined)), supprimerMois: vi.fn().mockReturnValue(of(1))
    };
    confirmation = { confirm: vi.fn() };
    TestBed.configureTestingModule({ imports: [HeuresSuppListComponent], providers: [
      provideRouter([]), { provide: HeuresSuppService, useValue: service },
      { provide: ConfirmDialogService, useValue: confirmation },
      { provide: AuthService, useValue: { hasPermission: () => true } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ periode: '2026-10', chantierIds: '4,5', equipeIds: '0', fonctionIds: '8', cin: 'AB123', nom: 'Salma' })) } }
    ] });
    fixture = TestBed.createComponent(HeuresSuppListComponent);
    component = fixture.componentInstance as unknown as typeof component;
    fixture.detectChanges();
  });

  it('applique tous les filtres d’URL, affiche CIN et S/H, et calcule le total filtré', () => {
    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });
    expect(service['search']).toHaveBeenCalledWith({ periode: '2026-10', chantierIds: [4, 5], equipeIds: [0], fonctionIds: [8], cin: 'AB123', nomPrenom: 'Salma' }, 0, 20);
    expect(component.totalNetAPayer()).toBe(20);
    expect(fixture.nativeElement.querySelector('.app-table-bar__summary')?.textContent).toContain('Net à payer');
    expect(fixture.nativeElement.textContent).toContain('S/H');
    expect(fixture.nativeElement.textContent).toContain('CIN');
    expect(fixture.nativeElement.querySelector('.heures-supp-ajout')).toBeNull();
  });

  it('reçoit une erreur de recherche sans masquer l’écran', () => {
    service['search'].mockReturnValue(throwError(() => new Error('network')));
    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });
    expect(component.erreur()).toContain('n’ont pas pu être chargées');
  });

  it('demande confirmation pour les suppressions de ligne et de mois', () => {
    component.supprimer(LIGNE);
    expect(confirmation.confirm).toHaveBeenCalled();
    (confirmation.confirm.mock.calls[0][0] as { accept: () => void }).accept();
    expect(service['supprimer']).toHaveBeenCalledWith(LIGNE.id);
    component.preparerPurge();
    expect(component.purgeNombre()).toBe(1);
    component.purgeSaisie.set(1);
    component.purgerMois();
    expect(service['supprimerMois']).toHaveBeenCalledWith('2026-10', 1);
  });
});
