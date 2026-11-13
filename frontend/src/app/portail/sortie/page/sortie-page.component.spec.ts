import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { MockedObject } from 'vitest';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';
import { moisCourant } from '../../mouvement/mouvement-filtres';
import { formaterAnciennete, libelleMotif, severiteMotif, SortiePageComponent } from './sortie-page.component';

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
  let service: MockedObject<Pick<SortieService, 'sortiesDuMois' | 'exporterPdf'>>;
  let fixture: ComponentFixture<SortiePageComponent>;
  let parametres: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function creer(permissions: string[] = ['EMPLOYEE_READ', 'EMPLOYEE_EXPORT'], requete: Record<string, string> = {}): void {
    parametres = new BehaviorSubject(convertToParamMap(requete));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirPermissions(permissions).providers,
        { provide: SortieService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: parametres.value }, queryParamMap: parametres.asObservable() } }
      ]
    });
    fixture = TestBed.createComponent(SortiePageComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = { sortiesDuMois: vi.fn().mockReturnValue(of(OCTOBRE)), exporterPdf: vi.fn().mockReturnValue(of(new Blob(['pdf']))) } as unknown as MockedObject<
      Pick<SortieService, 'sortiesDuMois' | 'exporterPdf'>
    >;
  });

  it('charge les sorties du mois courant et affiche les chiffres du mois', () => {
    creer();

    expect(service.sortiesDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: moisCourant() }));
    const racine = fixture.nativeElement as HTMLElement;
    const chiffres = racine.querySelector('.app-kpis')?.textContent ?? '';
    expect(chiffres).toContain('Départs du mois');
    expect(chiffres).toContain('50 % des départs');
    expect(chiffres).toContain('ABANDON : 1');
    expect(racine.querySelector('h1')?.textContent).toContain('STC / Sortie');
    expect(racine.querySelector('.app-table-bar__total')?.textContent).toContain('2 sorties');
  });

  it('lit le mois, les filtres et les motifs dans l’URL et les envoie à l’API', () => {
    creer(undefined, { periode: '2026-09', nom: 'ali', valeurs: 'STC,ABANDON' });

    expect(service.sortiesDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', nomPrenom: 'ali', motifs: ['STC', 'ABANDON'] }));
  });

  it('recharge quand l’URL change', () => {
    creer();
    service.sortiesDuMois.mockClear();

    parametres.next(convertToParamMap({ periode: '2026-08' }));

    expect(service.sortiesDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
  });

  it('écrit le mois choisi dans l’URL', () => {
    creer();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.componentInstance as unknown as { choisirMois(periode: string): void }).choisirMois('2026-09');

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ periode: '2026-09' }) }));
  });

  it('propose les motifs du périmètre avec leur nombre', () => {
    creer();

    const options = (fixture.componentInstance as unknown as { optionsMotifs(): { value: string; label: string }[] }).optionsMotifs();
    expect(options).toEqual([
      { value: 'ABANDON', label: 'ABANDON (1)' },
      { value: 'STC', label: 'STC (1)' }
    ]);
  });

  it('exporte le PDF avec les mêmes filtres que la liste', () => {
    creer(undefined, { periode: '2026-09', valeurs: 'STC' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue();

    (fixture.componentInstance as unknown as { exporter(): void }).exporter();

    expect(service.exporterPdf).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', motifs: ['STC'] }));
  });

  it('cache l’export sans la permission EMPLOYEE_EXPORT', () => {
    creer(['EMPLOYEE_READ']);

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Exporter en PDF');
  });

  it('signale l’échec du chargement sans afficher de résultat', () => {
    service.sortiesDuMois.mockReturnValue(throwError(() => new Error('503')));
    creer();

    const notifications = TestBed.inject(NotificationService).notifications();
    expect(notifications.map((n) => n.summary)).toEqual(['Impossible de charger les sorties du mois.']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.app-kpis')).toBeNull();
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
