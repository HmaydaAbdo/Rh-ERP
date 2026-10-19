import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { PaieImportAnalyse } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieImportStore } from './paie-import.store';

const PRETE: PaieImportAnalyse = {
  periode: '2026-10',
  totalLignes: 2,
  erreurs: [],
  cinInconnus: [],
  ecarts: [],
  departs: [
    { employeId: 1, cin: 'AB1', nomPrenom: 'ALI', motif: 'STC' },
    { employeId: 2, cin: 'CD2', nomPrenom: 'OMAR', motif: null }
  ],
  retours: [{ employeId: 3, cin: 'EF3', nomPrenom: 'ZAHRA' }],
  pret: true
};

const AVEC_ECART: PaieImportAnalyse = {
  ...PRETE,
  ecarts: [{ employeId: 4, numeroLigne: 5, cin: 'GH4', nomPrenom: 'SAID', typeSalaire: null, champs: [{ champ: 'salaire', base: null, fichier: '120' }] }],
  pret: false
};

describe('PaieImportStore', () => {
  let store: PaieImportStore;
  let service: { analyserImport: ReturnType<typeof vi.fn>; corrigerImport: ReturnType<typeof vi.fn>; importer: ReturnType<typeof vi.fn> };
  const fichier = new File(['x'], 'paie.xlsx');

  beforeEach(() => {
    service = { analyserImport: vi.fn(), corrigerImport: vi.fn(), importer: vi.fn() };
    TestBed.configureTestingModule({
      providers: [PaieImportStore, fournirPermissions(['PAIE_IMPORT', 'PAIE_READ', 'EMPLOYEE_WRITE']).providers, { provide: PaieService, useValue: service }]
    });
    store = TestBed.inject(PaieImportStore);
  });

  it('impose le mois qui suit le dernier importé, et laisse choisir au premier import', () => {
    store.ouvrir(['2026-12', '2026-11']);
    expect(store.mois()).toBe('2027-01');
    expect(store.moisImpose()).toBe(true);

    store.ouvrir([]);
    expect(store.mois()).toBeNull();
    store.choisirMois(new Date(2026, 2, 1));
    expect(store.mois()).toBe('2026-03');
  });

  it('analyse le fichier, passe au contrôle et coche d’office les départs proposés', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    store.ouvrir(['2026-09']);

    store.analyser(fichier);

    expect(service.analyserImport).toHaveBeenCalledWith(fichier, '2026-10');
    expect(store.etape()).toBe('controle');
    expect(store.departs()).toEqual({ 1: { coche: true, motif: 'STC' }, 2: { coche: true, motif: '' } });
  });

  it('ne passe le contrôle qu’avec un fichier prêt, et les départs qu’avec un motif pour chaque départ coché', () => {
    service.analyserImport.mockReturnValue(of(AVEC_ECART));
    store.ouvrir(['2026-09']);
    store.analyser(fichier);

    store.suivant();
    expect(store.etape()).toBe('controle');

    service.corrigerImport.mockReturnValue(of(PRETE));
    store.choisirType(4, 'JOURNALIER');
    store.aligner([4]);
    expect(service.corrigerImport).toHaveBeenCalledWith(fichier, '2026-10', { aligner: [{ employeId: 4, typeSalaire: 'JOURNALIER' }], creer: [] });
    store.suivant();
    expect(store.etape()).toBe('departs');

    store.suivant();
    expect(store.etape()).toBe('departs'); // OMAR est coché sans motif
    store.saisirDepart(2, { coche: false });
    store.suivant();
    expect(store.etape()).toBe('recap');
  });

  it('garde les choix de départ déjà faits quand l’analyse revient après une correction', () => {
    service.analyserImport.mockReturnValue(of(AVEC_ECART));
    store.ouvrir(['2026-09']);
    store.analyser(fichier);
    store.saisirDepart(2, { motif: 'Démission' });

    service.corrigerImport.mockReturnValue(of(PRETE));
    store.alignerTout();

    expect(store.departs()[2]).toEqual({ coche: true, motif: 'Démission' });
  });

  it('crée un CIN inconnu avec ses dates au format ISO, une fois la saisie complète', () => {
    service.analyserImport.mockReturnValue(of(AVEC_ECART));
    service.corrigerImport.mockReturnValue(of(PRETE));
    store.ouvrir(['2026-09']);
    store.analyser(fichier);

    store.saisirCreation(7, { dateNaissance: new Date(1990, 0, 2), dateEmbauche: new Date(2026, 9, 1) });
    expect(store.creationComplete(7)).toBe(false);
    store.creer(7);
    expect(service.corrigerImport).not.toHaveBeenCalled();

    store.saisirCreation(7, { typeSalaire: 'MENSUEL' });
    store.creer(7);
    expect(service.corrigerImport).toHaveBeenCalledWith(fichier, '2026-10', {
      aligner: [],
      creer: [{ numeroLigne: 7, dateNaissance: '1990-01-02', dateEmbauche: '2026-10-01', typeSalaire: 'MENSUEL' }]
    });
  });

  it('importe avec les seuls départs cochés, puis annonce la fin', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    service.importer.mockReturnValue(of({ periode: '2026-10', crees: 2, departs: 1, retours: 1 }));
    store.ouvrir(['2026-09']);
    store.analyser(fichier);
    store.saisirDepart(2, { coche: false });
    const importe = vi.fn();

    store.importer(importe);

    expect(service.importer).toHaveBeenCalledWith(fichier, '2026-10', [{ employeId: 1, motif: 'STC' }]);
    expect(store.etat()).toBe('termine');
    expect(store.bilan()?.crees).toBe(2);
    expect(importe).toHaveBeenCalledTimes(1);
  });

  it('montre le message du serveur quand il refuse, et reste à l’étape', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    service.importer.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Seul le mois 2026-10 peut être importé.' } })));
    store.ouvrir(['2026-09']);
    store.analyser(fichier);
    store.saisirDepart(2, { motif: 'Démission' });

    store.importer(() => undefined);

    expect(store.etat()).toBe('saisie');
    expect(store.erreur()).toBe('Seul le mois 2026-10 peut être importé.');
  });
});
