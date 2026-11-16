import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import type { MockedObject } from 'vitest';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EntrantEtat, libelleType } from '../entrant-etat';
import { EntrantsMois } from '../models/entrant.model';
import { EntrantService } from '../services/entrant.service';
import { EntrantListComponent, severiteType } from './entrant-list.component';

const OCTOBRE: EntrantsMois = {
  periode: '2026-10',
  comparable: true,
  nombre: 2,
  nouvellesEmbauches: 1,
  retours: 1,
  entrants: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', type: 'NOUVELLE_EMBAUCHE', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', montantBulletin: 3000 },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', type: 'RETOUR', fonctionId: 2, fonction: 'Grutier', chantierId: 3, chantier: 'C57', montantBulletin: 2000 }
  ]
};

describe('EntrantListComponent', () => {
  let service: MockedObject<Pick<EntrantService, 'entrantsDuMois' | 'exporterPdf'>>;
  let fixture: ComponentFixture<EntrantListComponent>;

  function creer(): void {
    const parametres = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirPermissions(['EMPLOYEE_READ']).providers,
        EntrantEtat,
        { provide: EntrantService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: parametres.value }, queryParamMap: parametres.asObservable() } }
      ]
    });
    fixture = TestBed.createComponent(EntrantListComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = { entrantsDuMois: vi.fn().mockReturnValue(of(OCTOBRE)), exporterPdf: vi.fn() } as unknown as MockedObject<Pick<EntrantService, 'entrantsDuMois' | 'exporterPdf'>>;
  });

  it('affiche les chiffres du mois et le nombre de lignes', () => {
    creer();

    const racine = fixture.nativeElement as HTMLElement;
    const chiffres = racine.querySelector('.app-kpis')?.textContent ?? '';
    expect(chiffres).toContain('Entrants du mois');
    expect(chiffres).toContain('Nouvelles embauches');
    expect(chiffres).toContain('Retours');
    expect(racine.querySelector('.app-table-bar__total')?.textContent).toContain('2 entrants');
  });

  it('avertit quand le mois n’est pas comparable et masque les chiffres', () => {
    service.entrantsDuMois.mockReturnValue(of({ ...OCTOBRE, comparable: false, nombre: 0, nouvellesEmbauches: 0, retours: 0, entrants: [] }));
    creer();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('stp-message')?.textContent).toContain('Entrants indisponibles');
    expect(racine.querySelector('.app-kpis')).toBeNull();
  });

  it('libellés et couleurs du type d’entrée', () => {
    expect(libelleType('NOUVELLE_EMBAUCHE')).toBe('Nouvelle embauche');
    expect(libelleType('RETOUR')).toBe('Retour');
    expect(severiteType('NOUVELLE_EMBAUCHE')).toBe('success');
    expect(severiteType('RETOUR')).toBe('info');
  });
});
