import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { MockedObject } from 'vitest';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { EntrantsMois } from '../models/entrant.model';
import { EntrantService } from '../services/entrant.service';
import { EntrantPageComponent, libelleType, severiteType } from './entrant-page.component';

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

describe('EntrantPageComponent', () => {
  let service: MockedObject<Pick<EntrantService, 'entrantsDuMois' | 'exporterPdf'>>;
  let fixture: ComponentFixture<EntrantPageComponent>;

  function creer(permissions: string[] = ['EMPLOYEE_READ', 'EMPLOYEE_EXPORT'], requete: Record<string, string> = {}): void {
    const parametres = new BehaviorSubject(convertToParamMap(requete));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirPermissions(permissions).providers,
        { provide: EntrantService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: parametres.value }, queryParamMap: parametres.asObservable() } }
      ]
    });
    fixture = TestBed.createComponent(EntrantPageComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = { entrantsDuMois: vi.fn().mockReturnValue(of(OCTOBRE)), exporterPdf: vi.fn().mockReturnValue(of(new Blob(['pdf']))) } as unknown as MockedObject<
      Pick<EntrantService, 'entrantsDuMois' | 'exporterPdf'>
    >;
  });

  it('charge les entrants du mois et affiche les chiffres', () => {
    creer();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('h1')?.textContent).toContain('Entrants');
    const chiffres = racine.querySelector('.app-kpis')?.textContent ?? '';
    expect(chiffres).toContain('Entrants du mois');
    expect(chiffres).toContain('Nouvelles embauches');
    expect(chiffres).toContain('Retours');
    expect(racine.querySelector('.app-table-bar__total')?.textContent).toContain('2 entrants');
  });

  it('envoie le mois, les filtres et les types lus dans l’URL', () => {
    creer(undefined, { periode: '2026-09', nom: 'ali', valeurs: 'RETOUR' });

    expect(service.entrantsDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', nomPrenom: 'ali', types: ['RETOUR'] }));
  });

  it('avertit quand le mois n’est pas comparable et masque les chiffres', () => {
    service.entrantsDuMois.mockReturnValue(of({ ...OCTOBRE, comparable: false, nombre: 0, nouvellesEmbauches: 0, retours: 0, entrants: [] }));
    creer();

    const racine = fixture.nativeElement as HTMLElement;
    expect(racine.querySelector('stp-message')?.textContent).toContain('Entrants indisponibles');
    expect(racine.querySelector('.app-kpis')).toBeNull();
  });

  it('exporte le PDF avec les mêmes filtres que la liste', () => {
    creer(undefined, { periode: '2026-09', valeurs: 'RETOUR' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue();

    (fixture.componentInstance as unknown as { exporter(): void }).exporter();

    expect(service.exporterPdf).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', types: ['RETOUR'] }));
  });

  it('cache l’export sans la permission EMPLOYEE_EXPORT', () => {
    creer(['EMPLOYEE_READ']);

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Exporter en PDF');
  });

  it('signale l’échec du chargement', () => {
    service.entrantsDuMois.mockReturnValue(throwError(() => new Error('503')));
    creer();

    expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Impossible de charger les entrants du mois.']);
  });

  it('libellés et couleurs du type d’entrée', () => {
    expect(libelleType('NOUVELLE_EMBAUCHE')).toBe('Nouvelle embauche');
    expect(libelleType('RETOUR')).toBe('Retour');
    expect(severiteType('NOUVELLE_EMBAUCHE')).toBe('success');
    expect(severiteType('RETOUR')).toBe('info');
  });
});
