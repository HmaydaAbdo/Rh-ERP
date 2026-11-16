import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import type { MockedObject } from 'vitest';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';
import { SortieEtat } from '../sortie-etat';
import { formaterAnciennete, libelleMotif, severiteMotif, SortieListComponent } from './sortie-list.component';

const OCTOBRE: SortiesMois = {
  periode: '2026-10',
  nombre: 2,
  parMotif: { ABANDON: 1, STC: 1 },
  sorties: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', motif: 'STC', ancienneteMois: 14, montantDernierBulletin: 3000, statutActuel: 'INACTIF' },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', motif: 'ABANDON', ancienneteMois: 10, montantDernierBulletin: 2000, statutActuel: 'ACTIF' }
  ]
};

describe('SortieListComponent', () => {
  let service: MockedObject<Pick<SortieService, 'sortiesDuMois' | 'exporterPdf'>>;
  let fixture: ComponentFixture<SortieListComponent>;
  let parametres: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function creer(permissions: string[] = ['EMPLOYEE_READ', 'EMPLOYEE_EXPORT'], requete: Record<string, string> = {}): void {
    parametres = new BehaviorSubject(convertToParamMap(requete));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        SortieEtat,
        fournirPermissions(permissions).providers,
        { provide: SortieService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: parametres.value }, queryParamMap: parametres.asObservable() } }
      ]
    });
    fixture = TestBed.createComponent(SortieListComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = { sortiesDuMois: vi.fn().mockReturnValue(of(OCTOBRE)), exporterPdf: vi.fn().mockReturnValue(of(new Blob(['pdf']))) } as unknown as MockedObject<
      Pick<SortieService, 'sortiesDuMois' | 'exporterPdf'>
    >;
  });

  it('charge les sorties du mois courant et affiche les chiffres du mois', () => {
    creer();

    const racine = fixture.nativeElement as HTMLElement;
    const chiffres = racine.querySelector('.app-kpis')?.textContent ?? '';
    expect(chiffres).toContain('Départs du mois');
    expect(chiffres).toContain('50 % des départs');
    expect(chiffres).toContain('ABANDON : 1');
    expect(racine.querySelector('.app-table-bar__total')?.textContent).toContain('2 sorties');
  });

  it('formate le motif absent', () => {
    expect(libelleMotif('NON_PRECISE')).toBe('Non précisé');
    expect(libelleMotif('ABANDON')).toBe('ABANDON');
  });

  it('formate l’ancienneté et la couleur du motif', () => {
    expect(formaterAnciennete(14)).toBe('1 an 2 mois');
    expect(formaterAnciennete(24)).toBe('2 ans');
    expect(formaterAnciennete(5)).toBe('5 mois');
    expect(formaterAnciennete(null)).toBe('—');
    expect(severiteMotif('STC')).toBe('warning');
    expect(severiteMotif('Sortie')).toBe('info');
    expect(severiteMotif('ABANDON')).toBe('neutral');
  });
});
