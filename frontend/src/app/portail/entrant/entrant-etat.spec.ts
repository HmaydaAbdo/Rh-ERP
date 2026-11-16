import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { MockedObject } from 'vitest';

import { NotificationService } from '../../shared/ui/feedback/feedback.service';
import { EntrantEtat } from './entrant-etat';
import { EntrantsMois } from './models/entrant.model';
import { EntrantService } from './services/entrant.service';

const OCTOBRE: EntrantsMois = {
  periode: '2026-10',
  comparable: true,
  nombre: 2,
  nouvellesEmbauches: 1,
  retours: 1,
  entrants: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', type: 'NOUVELLE_EMBAUCHE', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'E1', montantBulletin: 3000 },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', type: 'RETOUR', fonctionId: 2, fonction: 'Grutier', chantierId: 3, chantier: 'C57', montantBulletin: 2000 }
  ]
};

describe('EntrantEtat', () => {
  let service: MockedObject<Pick<EntrantService, 'entrantsDuMois' | 'exporterPdf'>>;
  let parametres: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function creer(requete: Record<string, string> = {}): EntrantEtat {
    parametres = new BehaviorSubject(convertToParamMap(requete));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        EntrantEtat,
        { provide: EntrantService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: parametres.value }, queryParamMap: parametres.asObservable() } }
      ]
    });
    return TestBed.inject(EntrantEtat);
  }

  beforeEach(() => {
    service = { entrantsDuMois: vi.fn().mockReturnValue(of(OCTOBRE)), exporterPdf: vi.fn().mockReturnValue(of(new Blob(['pdf']))) } as unknown as MockedObject<
      Pick<EntrantService, 'entrantsDuMois' | 'exporterPdf'>
    >;
  });

  it('envoie le mois, les filtres et les types lus dans l’URL', () => {
    creer({ periode: '2026-09', nom: 'ali', valeurs: 'RETOUR' });

    expect(service.entrantsDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', nomPrenom: 'ali', types: ['RETOUR'] }));
  });

  it('recharge quand l’URL change', () => {
    creer();
    service.entrantsDuMois.mockClear();

    parametres.next(convertToParamMap({ periode: '2026-08' }));

    expect(service.entrantsDuMois).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
  });

  it('ramène chaque entrant à une ligne de mouvement', () => {
    const etat = creer();

    expect(etat.lignes()).toEqual([
      expect.objectContaining({ employeId: 4, categorie: 'Nouvelle embauche', categorieCle: 'NOUVELLE_EMBAUCHE', chantierId: 3, equipeId: 9, fonction: 'Maçon', montant: 3000 }),
      expect.objectContaining({ employeId: 7, categorie: 'Retour', categorieCle: 'RETOUR', montant: 2000 })
    ]);
    expect(etat.nonComparable()).toBe(false);
  });

  it('écrit le mois choisi dans l’URL', () => {
    const etat = creer();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    etat.appliquer({ ...etat.filtres(), periode: '2026-09' }, false);

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ replaceUrl: false, queryParams: expect.objectContaining({ periode: '2026-09' }) }));
  });

  it('exporte le PDF avec les mêmes filtres que la liste', () => {
    const etat = creer({ periode: '2026-09', valeurs: 'RETOUR' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue();

    etat.exporter();

    expect(service.exporterPdf).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-09', types: ['RETOUR'] }));
  });

  it('signale l’échec du chargement et de l’export', () => {
    service.entrantsDuMois.mockReturnValue(throwError(() => new Error('503')));
    service.exporterPdf.mockReturnValue(throwError(() => new Error('500')));
    const etat = creer();
    etat.exporter();

    expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Impossible de charger les entrants du mois.', 'Impossible de générer le PDF des entrants.']);
    expect(etat.resultat()).toBeNull();
  });

  it('signale un mois non comparable', () => {
    service.entrantsDuMois.mockReturnValue(of({ ...OCTOBRE, comparable: false, entrants: [] }));

    expect(creer().nonComparable()).toBe(true);
  });
});
