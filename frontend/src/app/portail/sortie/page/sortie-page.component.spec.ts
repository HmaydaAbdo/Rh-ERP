import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import type { MockedObject } from 'vitest';

import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';
import { libelleMotif, moisCourant, SortiePageComponent } from './sortie-page.component';

const OCTOBRE: SortiesMois = {
  periode: '2026-10',
  nombre: 2,
  parMotif: { ABANDON: 1, NON_PRECISE: 1 },
  sorties: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', motif: 'NON_PRECISE' },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', motif: 'ABANDON' }
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

  it('charge les sorties du mois courant et résume le nombre et les motifs', () => {
    creer();

    expect(service.sortiesDuMois).toHaveBeenCalledWith(moisCourant());
    const resume = (fixture.nativeElement as HTMLElement).querySelector('.sortie-resume')?.textContent ?? '';
    expect(resume).toContain('2');
    expect(resume).toContain('sorties');
    expect(resume).toContain('ABANDON : 1');
    expect(resume).toContain('Non précisé : 1');
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
    expect((fixture.nativeElement as HTMLElement).querySelector('.sortie-resume')).toBeNull();
  });

  it('formate le motif absent et le mois courant', () => {
    expect(libelleMotif('NON_PRECISE')).toBe('Non précisé');
    expect(libelleMotif('ABANDON')).toBe('ABANDON');
    expect(moisCourant(new Date(2026, 0, 5))).toBe('2026-01');
  });
});
