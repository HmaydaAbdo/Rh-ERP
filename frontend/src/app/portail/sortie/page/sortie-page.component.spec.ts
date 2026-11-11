import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import type { MockedObject } from 'vitest';

import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';
import { formaterAnciennete, libelleMotif, moisCourant, severiteMotif, SortiePageComponent } from './sortie-page.component';

const OCTOBRE: SortiesMois = {
  periode: '2026-10',
  nombre: 2,
  parMotif: { ABANDON: 1, STC: 1 },
  sorties: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', motif: 'STC', ancienneteMois: 14, montantDernierBulletin: 3000, statutActuel: 'INACTIF' },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', motif: 'ABANDON', ancienneteMois: 10, montantDernierBulletin: 2000, statutActuel: 'ACTIF' }
  ]
};

describe('SortiePageComponent', () => {
  let service: MockedObject<Pick<SortieService, 'sortiesDuMois'>>;
  let fixture: ComponentFixture<SortiePageComponent>;

  function creer(): void {
    fixture = TestBed.createComponent(SortiePageComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = { sortiesDuMois: vi.fn().mockReturnValue(of(OCTOBRE)) } as unknown as MockedObject<Pick<SortieService, 'sortiesDuMois'>>;
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SortieService, useValue: service }]
    });
  });

  it('charge les sorties du mois courant et affiche les chiffres du mois', () => {
    creer();

    expect(service.sortiesDuMois).toHaveBeenCalledWith(moisCourant());
    const racine = fixture.nativeElement as HTMLElement;
    const chiffres = racine.querySelector('.app-kpis')?.textContent ?? '';
    expect(chiffres).toContain('Départs du mois');
    expect(chiffres).toContain('50 % des départs');
    expect(chiffres).toContain('ABANDON : 1');
    expect(chiffres).toContain('5');
    expect(racine.querySelector('h1')?.textContent).toContain('STC / Sortie');
    expect(racine.querySelector('.app-table-bar__total')?.textContent).toContain('2 sorties');
  });

  it('recharge le mois choisi dans le sélecteur', () => {
    creer();
    service.sortiesDuMois.mockClear();

    (fixture.componentInstance as unknown as { choisir(periode: string): void }).choisir('2026-09');

    expect(service.sortiesDuMois).toHaveBeenCalledWith('2026-09');
  });

  it('signale l’échec du chargement sans afficher de résultat', () => {
    service.sortiesDuMois.mockReturnValue(throwError(() => new Error('503')));
    creer();

    const notifications = TestBed.inject(NotificationService).notifications();
    expect(notifications.map((n) => n.summary)).toEqual(['Impossible de charger les sorties du mois.']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.app-kpis')).toBeNull();
  });

  it('formate le motif absent et le mois courant', () => {
    expect(libelleMotif('NON_PRECISE')).toBe('Non précisé');
    expect(libelleMotif('ABANDON')).toBe('ABANDON');
    expect(moisCourant(new Date(2026, 0, 5))).toBe('2026-01');
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
