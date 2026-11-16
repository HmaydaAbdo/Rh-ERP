import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { MockedObject } from 'vitest';

import { NotificationService } from '../../shared/ui/feedback/feedback.service';
import { SortieEtat } from './sortie-etat';
import { SortiesMois } from './models/sortie.model';
import { SortieService } from './services/sortie.service';

const OCTOBRE: SortiesMois = {
  periode: '2026-10',
  nombre: 2,
  parMotif: { ABANDON: 1, STC: 1 },
  sorties: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', motif: 'STC', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'E1', montantDernierBulletin: 3000 },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', motif: 'ABANDON', montantDernierBulletin: 2000 }
  ]
};

describe('SortieEtat', () => {
  let service: MockedObject<Pick<SortieService, 'sortiesDuMois' | 'exporterPdf'>>;
  let parametres: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function creer(requete: Record<string, string> = {}): SortieEtat {
    parametres = new BehaviorSubject(convertToParamMap(requete));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        SortieEtat,
        { provide: SortieService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: parametres.value }, queryParamMap: parametres.asObservable() } }
      ]
    });
    return TestBed.inject(SortieEtat);
  }

  beforeEach(() => {
    service = { sortiesDuMois: vi.fn().mockReturnValue(of(OCTOBRE)), exporterPdf: vi.fn().mockReturnValue(of(new Blob(['pdf']))) } as unknown as MockedObject<
      Pick<SortieService, 'sortiesDuMois' | 'exporterPdf'>
    >;
  });

  it('envoie le mois, les filtres et les types lus dans l’URL', () => {
    creer({ periode: '2026-09', nom: 'ali', valeurs: 'STC' });

    expect(service.sortiesDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', nomPrenom: 'ali', motifs: ['STC'] }));
  });

  it('recharge quand l’URL change', () => {
    creer();
    service.sortiesDuMois.mockClear();

    parametres.next(convertToParamMap({ periode: '2026-08' }));

    expect(service.sortiesDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
  });

  it('ramène chaque sortie à une ligne de mouvement', () => {
    const etat = creer();

    expect(etat.lignes()).toEqual([
      expect.objectContaining({ employeId: 4, categorie: 'STC', categorieCle: 'STC', chantierId: 3, equipeId: 9, fonction: 'Maçon', montant: 3000 }),
      expect.objectContaining({ employeId: 7, categorie: 'ABANDON', categorieCle: 'ABANDON', montant: 2000 })
    ]);
  });

  it('propose les motifs du périmètre avec leur nombre', () => {
    expect(creer().optionsMotifs()).toEqual([
      { value: 'ABANDON', label: 'ABANDON (1)' },
      { value: 'STC', label: 'STC (1)' }
    ]);
  });

  it('écrit le mois choisi dans l’URL', () => {
    const etat = creer();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    etat.appliquer({ ...etat.filtres(), periode: '2026-09' }, false);

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ replaceUrl: false, queryParams: expect.objectContaining({ periode: '2026-09' }) }));
  });

  it('exporte le PDF avec les mêmes filtres que la liste', () => {
    const etat = creer({ periode: '2026-09', valeurs: 'STC' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue();

    etat.exporter();

    expect(service.exporterPdf).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', motifs: ['STC'] }));
  });

  it('signale l’échec du chargement et de l’export', () => {
    service.sortiesDuMois.mockReturnValue(throwError(() => new Error('503')));
    service.exporterPdf.mockReturnValue(throwError(() => new Error('500')));
    const etat = creer();
    etat.exporter();

    expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Impossible de charger les sorties du mois.', 'Impossible de générer le PDF des sortants.']);
    expect(etat.resultat()).toBeNull();
  });
});
