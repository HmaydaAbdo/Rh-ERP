import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { PaieImportAnalyse } from '../models/paie.model';
import { ChantierService } from '../../chantier/services/chantier.service';
import { PaieService } from '../services/paie.service';
import { PaieImportStore } from './paie-import.store';

const PRETE: PaieImportAnalyse = {
  periode: '2026-10',
  totalLignes: 2,
  erreurs: [],
  avertissements: [],
  chantiersClotures: [],
  cinInconnus: [],
  ecarts: [],
  departs: [
    { employeId: 1, cin: 'AB1', nomPrenom: 'ALI', motif: 'STC' },
    { employeId: 2, cin: 'CD2', nomPrenom: 'OMAR', motif: null }
  ],
  retours: [{ employeId: 3, cin: 'EF3', nomPrenom: 'ZAHRA' }],
  controlesPeriode: [],
  blocagesPeriode: [],
  pret: true
};

const AVEC_ECART: PaieImportAnalyse = {
  ...PRETE,
  ecarts: [{ employeId: 4, numeroLigne: 5, cin: 'GH4', nomPrenom: 'SAID', typeSalaire: null, champs: [{ champ: 'salaire', base: null, fichier: '120' }] }],
  pret: false
};

describe('PaieImportStore', () => {
  let store: PaieImportStore;
  let chantiers: { getById: ReturnType<typeof vi.fn>; changerStatut: ReturnType<typeof vi.fn> };
  let service: { analyserImport: ReturnType<typeof vi.fn>; corrigerImport: ReturnType<typeof vi.fn>; importer: ReturnType<typeof vi.fn> };
  const fichier = new File(['x'], 'paie.xlsx');

  beforeEach(() => {
    service = { analyserImport: vi.fn(), corrigerImport: vi.fn(), importer: vi.fn() };
    chantiers = { getById: vi.fn(), changerStatut: vi.fn() };
    TestBed.configureTestingModule({
      providers: [PaieImportStore, fournirPermissions(['PAIE_IMPORT', 'PAIE_READ', 'EMPLOYEE_WRITE', 'CHANTIER_READ', 'CHANTIER_WRITE']).providers,
        { provide: PaieService, useValue: service }, { provide: ChantierService, useValue: chantiers }]
    });
    store = TestBed.inject(PaieImportStore);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 8)); // 8 novembre 2026 : le mois proposé est octobre
  });

  afterEach(() => vi.useRealTimers());

  it('rouvre un chantier clôturé puis réanalyse le même fichier', () => {
    const cloture = { chantierId: 8, code: 'C059', designation: 'Voirie', lignes: [4, 5] };
    service.analyserImport.mockReturnValueOnce(of({ ...PRETE, chantiersClotures: [cloture], pret: false })).mockReturnValueOnce(of(PRETE));
    const chantier = { id: 8, version: 3, code: 'C059', designation: 'Voirie', nom: null, nature: null, localisation: null, latitude: null, longitude: null, afficherSurCarte: false, sourceErp: true, actif: false };
    chantiers.getById.mockReturnValue(of(chantier));
    chantiers.changerStatut.mockReturnValue(of({ ...chantier, actif: true }));
    store.ouvrir();
    store.analyser(fichier);
    expect(store.nombreProblemes()).toBe(1);

    store.rouvrir(8);

    expect(chantiers.changerStatut).toHaveBeenCalledWith(chantier, true);
    expect(service.analyserImport).toHaveBeenLastCalledWith(fichier, '2026-10');
    expect(store.nombreProblemes()).toBe(0);
    expect(store.peutRouvrir()).toBe(true);
  });

  it('propose le mois civil précédent et laisse l’utilisateur choisir librement', () => {
    store.ouvrir();
    expect(store.mois()).toBe('2026-10');

    store.choisirMois(new Date(2026, 2, 1));
    expect(store.mois()).toBe('2026-03');
    store.choisirMois(new Date(2026, 10, 1));
    expect(store.mois()).toBe('2026-11');
  });

  it('exige la confirmation d’une période du mois en cours avant de valider le contrôle', () => {
    const courante = {
      ...PRETE,
      controlesPeriode: [{ code: 'PERIODE_COURANTE_OU_FUTURE' as const, message: 'Mois en cours.', periodeReference: null }],
      pret: false
    };
    service.analyserImport.mockReturnValue(of(courante));
    store.ouvrir();
    store.choisirMois(new Date(2026, 10, 1));
    store.analyser(fichier);
    expect(store.pret()).toBe(false);

    store.confirmerPeriode(true);
    expect(store.pret()).toBe(true);

    store.choisirMois(new Date(2026, 9, 1));
    expect(store.periodeConfirmee()).toBe(false);
  });

  it('ouvre les catégories du contrôle une à une, la période demandant une validation', () => {
    service.analyserImport.mockReturnValue(of({
      ...PRETE,
      erreurs: [{ numeroLigne: 4, cin: 'X', nomPrenom: null, champ: 'cin', raison: 'CIN inconnu' }],
      controlesPeriode: [{ code: 'MOIS_HORS_CYCLE' as const, message: 'Mois hors cycle.', periodeReference: '2026-10' }],
      pret: false
    }));
    store.ouvrir();
    store.analyser(fichier);

    expect(store.categories().map((c) => c.cle)).toEqual(['periode', 'erreurs']);
    expect(store.categorieActive()).toBe('periode');
    store.confirmerPeriode(true);
    expect(store.categorieActive()).toBe('periode'); // confirmée, pas encore validée
    store.validerCategorie('periode');
    expect(store.categorieActive()).toBe('erreurs');
    expect(store.positionCategorie()).toEqual({ courante: 2, total: 2 });

    store.analyse.set({ ...store.analyse()!, erreurs: [] });
    expect(store.categorieActive()).toBeNull();
    expect(store.controleTermine()).toBe(true);
  });

  it('un mois bloqué empêche tout passage, même confirmé', () => {
    service.analyserImport.mockReturnValue(of({
      ...PRETE,
      blocagesPeriode: [{ code: 'MOIS_ANTERIEUR_AU_DERNIER' as const, message: 'Plus ancien que la dernière paie.', periodeReference: null }],
      pret: false
    }));
    store.ouvrir();
    store.analyser(fichier);

    expect(store.categorieActive()).toBe('blocages');
    expect(store.pret()).toBe(false);
    expect(store.controleTermine()).toBe(false);
  });

  it('envoie la confirmation de période à l’import', () => {
    service.analyserImport.mockReturnValue(of({
      ...PRETE,
      controlesPeriode: [{ code: 'CONTENU_DEJA_IMPORTE' as const, message: 'Déjà importé.', periodeReference: '2026-09' }],
      pret: false
    }));
    service.importer.mockReturnValue(of({ periode: '2026-10', crees: 2, departs: 0, retours: 1 }));
    store.ouvrir();
    store.analyser(fichier);
    store.saisirDepart(2, { coche: false });
    store.confirmerPeriode(true);

    store.importer(() => undefined);

    expect(service.importer).toHaveBeenCalledWith(fichier, '2026-10', [{ employeId: 1, motif: 'STC', sansMotif: false }], false, [], true);
  });

  it('confirme sans motif un départ déduit de l’absence, mais jamais un STC ou une sortie du fichier', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    store.ouvrir();
    store.analyser(fichier);
    expect(store.departsValides()).toBe(false); // OMAR (absent du fichier) est coché sans motif

    store.saisirDepart(2, { sansMotif: true });
    expect(store.departsValides()).toBe(true);
    expect(store.departsConfirmes()).toContainEqual({ employeId: 2, motif: '', sansMotif: true });

    store.saisirDepart(1, { motif: '', sansMotif: true }); // ALI porte STC dans le fichier
    expect(store.departsValides()).toBe(false);
  });

  it('exige la confirmation du salaire zéro sans valider un salaire différent', () => {
    const salaireZero = {
      ...PRETE,
      avertissements: [
        { numeroLigne: 4, cin: 'AB1', nomPrenom: 'ALI', raison: 'salaire nul', codeAvertissement: 'SALAIRE_ZERO' as const }
      ],
      pret: false
    };
    service.analyserImport.mockReturnValue(of(salaireZero));
    store.ouvrir();
    store.analyser(fichier);
    expect(store.pret()).toBe(false);
    store.confirmerSalaireZero.set(true);
    expect(store.pret()).toBe(true);

    store.analyse.set({
      ...salaireZero,
      avertissements: [
        ...salaireZero.avertissements,
        { numeroLigne: 4, cin: 'AB1', nomPrenom: 'ALI', raison: 'salaire différent', codeAvertissement: 'SALAIRE_DIFFERENT' }
      ]
    });
    expect(store.pret()).toBe(false);
  });

  it('laisse l’utilisateur décider d’une équipe vide, et envoie sa décision à l’import', () => {
    const equipeVide = {
      ...PRETE,
      avertissements: [
        { numeroLigne: 4, cin: 'AB1', nomPrenom: 'ALI', raison: 'équipe vide', codeAvertissement: 'EQUIPE_VIDE' as const, employeId: 1 }
      ],
      pret: false
    };
    service.analyserImport.mockReturnValue(of(equipeVide));
    store.ouvrir();
    store.analyser(fichier);
    expect(store.pret()).toBe(false);

    store.decider(1, 'VIDER');
    expect(store.pret()).toBe(true);
    expect(store.decisionsEquipeEnvoyees()).toEqual([{ employeId: 1, action: 'VIDER' }]);
  });

  it('analyse le fichier, passe au contrôle et coche d’office les départs proposés', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    store.ouvrir();

    store.analyser(fichier);

    expect(service.analyserImport).toHaveBeenCalledWith(fichier, '2026-10');
    expect(store.etape()).toBe('controle');
    expect(store.departs()).toEqual({
      1: { coche: true, motif: 'STC', sansMotif: false },
      2: { coche: true, motif: '', sansMotif: false }
    });
  });

  it('ne passe le contrôle qu’avec un fichier prêt, et les départs qu’avec un motif pour chaque départ coché', () => {
    service.analyserImport.mockReturnValue(of(AVEC_ECART));
    store.ouvrir();
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
    store.ouvrir();
    store.analyser(fichier);
    store.saisirDepart(2, { motif: 'Démission' });

    service.corrigerImport.mockReturnValue(of(PRETE));
    store.alignerTout();

    expect(store.departs()[2]).toEqual({ coche: true, motif: 'Démission', sansMotif: false });
  });

  it('crée un CIN inconnu avec ses dates au format ISO, une fois la saisie complète', () => {
    service.analyserImport.mockReturnValue(of(AVEC_ECART));
    service.corrigerImport.mockReturnValue(of(PRETE));
    store.ouvrir();
    store.analyser(fichier);

    store.saisirCreation(7, { dateNaissance: new Date(1990, 0, 2), dateEmbauche: new Date(2026, 9, 1) });
    expect(store.creationComplete(7, 450)).toBe(true);
    store.creer(7, 450);
    expect(service.corrigerImport).toHaveBeenCalledWith(fichier, '2026-10', {
      aligner: [],
      creer: [{ numeroLigne: 7, dateNaissance: '1990-01-02', dateEmbauche: '2026-10-01', typeSalaire: 'JOURNALIER' }]
    });
  });

  it('préremplit le type de salaire selon le seuil de 500 DH', () => {
    expect(store.typeSalairePropose(500)).toBe('JOURNALIER');
    expect(store.typeSalairePropose(500.01)).toBe('MENSUEL');
    store.saisirCreation(7, { dateNaissance: new Date(1990, 0, 2), dateEmbauche: new Date(2026, 9, 1) });
    expect(store.creationComplete(7, 500)).toBe(true);
  });

  it('importe avec les seuls départs cochés, puis annonce la fin', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    service.importer.mockReturnValue(of({ periode: '2026-10', crees: 2, departs: 1, retours: 1 }));
    store.ouvrir();
    store.analyser(fichier);
    store.saisirDepart(2, { coche: false });
    const importe = vi.fn();

    store.importer(importe);

    expect(service.importer).toHaveBeenCalledWith(fichier, '2026-10', [{ employeId: 1, motif: 'STC', sansMotif: false }], false, [], false);
    expect(store.etat()).toBe('termine');
    expect(store.bilan()?.crees).toBe(2);
    expect(importe).toHaveBeenCalledTimes(1);
  });

  it('montre le message du serveur quand il refuse, et reste à l’étape', () => {
    service.analyserImport.mockReturnValue(of(PRETE));
    service.importer.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Seul le mois 2026-10 peut être importé.' } })));
    store.ouvrir();
    store.analyser(fichier);
    store.saisirDepart(2, { motif: 'Démission' });

    store.importer(() => undefined);

    expect(store.etat()).toBe('saisie');
    expect(store.erreur()).toBe('Seul le mois 2026-10 peut être importé.');
  });
});
