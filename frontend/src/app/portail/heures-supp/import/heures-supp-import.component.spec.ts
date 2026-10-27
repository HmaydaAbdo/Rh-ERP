import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Component, input, model, WritableSignal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { HeuresSuppImportAnalyse, HeuresSuppImportResult } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppImportComponent } from './heures-supp-import.component';

@Component({ selector: 'app-lazy-select', standalone: true, template: '' })
class LazySelectStub {
  readonly ariaLabel = input<string | null>(null);
  readonly placeholder = input('');
  readonly optionLabel = input('');
  readonly dataKey = input('');
  readonly inputId = input<string | null>(null);
  readonly source = input<unknown>();
  readonly value = model<unknown>(null);
}

interface ImportApi {
  etape: WritableSignal<number>;
  mois: WritableSignal<Date | null>;
  chantierId: WritableSignal<number | null>;
  chantierLibelle: WritableSignal<string>;
  fichier: WritableSignal<File | null>;
  texteForfaits: WritableSignal<string>;
  analyse: WritableSignal<HeuresSuppImportAnalyse | null>;
  resultat: WritableSignal<HeuresSuppImportResult | null>;
  erreur: WritableSignal<string | null>;
  chargement: WritableSignal<boolean>;
  telechargementModele: WritableSignal<boolean>;
  creations: WritableSignal<Record<number, { dateNaissance: string; dateEmbauche: string; salaire: number; typeSalaire: '' | 'JOURNALIER' | 'MENSUEL' }>>;
  alignements: WritableSignal<number[]>;
  choisirChantier(value: unknown): void;
  telechargerModele(): void;
  verifierContexte(): void;
  analyser(): void;
  corriger(): void;
  importer(): void;
  demanderRemplacement(): void;
  basculerAlignement(id: number): void;
}

const ANALYSE: HeuresSuppImportAnalyse = {
  periode: '2026-10', chantierId: 4, totalLignes: 1, lignesZero: 0, pret: true, erreurs: [],
  lignes: [{ numeroLigne: 2, cin: 'AB123', nomPrenom: 'Salma Alaoui', fonction: 'Chauffeur', employeId: 7,
    nomFichier: 'Salma Alaoui', fonctionFichier: 'Chauffeur', identiteEcart: false, fonctionEcart: false,
    forfaitSeul: false, heuresSupplementaires: 2, salaireHoraireDh: 10, montantDh: 20, stcOuSortie: false,
    stcDh: 0, forfaitDh: null, netAPayerDh: 20, erreurs: [] }]
};

describe('HeuresSuppImportComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HeuresSuppImportComponent>>;
  let api: ImportApi;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let confirmation: { confirm: ReturnType<typeof vi.fn> };
  let chantierReference: { fetchById: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = {
      verifierPrerequis: vi.fn(), telechargerModele: vi.fn().mockReturnValue(of(new Blob(['modele']))),
      analyserImport: vi.fn(), corrigerImport: vi.fn(), importer: vi.fn(), remplacer: vi.fn()
    };
    confirmation = { confirm: vi.fn() };
    chantierReference = { fetchById: vi.fn().mockReturnValue(of({ id: 4, code: 'C4', designation: 'Site', nom: null, actif: true })) };
    TestBed.configureTestingModule({
      imports: [HeuresSuppImportComponent],
      providers: [
        provideRouter([]),
        { provide: HeuresSuppService, useValue: service },
        { provide: ConfirmDialogService, useValue: confirmation },
        { provide: ChantierReferenceService, useValue: chantierReference }
      ]
    });
    TestBed.overrideComponent(HeuresSuppImportComponent, {
      remove: { imports: [LazySelectComponent] },
      add: { imports: [LazySelectStub] }
    });
    fixture = TestBed.createComponent(HeuresSuppImportComponent);
    api = fixture.componentInstance as unknown as ImportApi;
    fixture.detectChanges();
  });

  it('commence à l’étape de choix du mois et du chantier', () => {
    expect(api.etape()).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Choisir le mois et le chantier');
  });

  it('bloque l’étape suivante si la paie mensuelle manque', () => {
    api.mois.set(new Date(2026, 9, 1));
    api.choisirChantier(4);
    service['verifierPrerequis'].mockReturnValue(of({ pret: false, message: 'Importez d’abord la paie.' }));

    api.verifierContexte();

    expect(api.etape()).toBe(1);
    expect(api.erreur()).toBe('Importez d’abord la paie.');
  });

  it('ouvre l’étape fichier uniquement après le contrôle de paie', () => {
    api.mois.set(new Date(2026, 9, 1));
    api.choisirChantier(4);
    service['verifierPrerequis'].mockReturnValue(of({ pret: true, message: null }));

    api.verifierContexte();

    expect(api.etape()).toBe(2);
    expect(api.chantierLibelle()).toBe('C4 · Site');
    expect(chantierReference.fetchById).toHaveBeenCalledWith(4);
  });

  it('propose et télécharge le modèle Excel depuis l’étape fichier', () => {
    api.etape.set(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Télécharger le modèle Excel');
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:modele');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    api.telechargerModele();
    expect(service['telechargerModele']).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:modele');
  });

  it('valide le format des forfaits puis analyse avec le montant décimal', () => {
    api.mois.set(new Date(2026, 9, 1));
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.texteForfaits.set('AB123;12,50\n');
    service['analyserImport'].mockReturnValue(of(ANALYSE));

    api.analyser();

    expect(service['analyserImport']).toHaveBeenCalledWith(expect.any(File), '2026-10', 4, [{ cin: 'AB123', montantDh: 12.5 }]);
    expect(api.etape()).toBe(3);
    expect(api.analyse()).toEqual(ANALYSE);
  });

  it('affiche une erreur claire pour un forfait mal formé', () => {
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.texteForfaits.set('AB123;pas-un-montant');

    api.analyser();

    expect(api.erreur()).toContain('Forfait invalide');
    expect(service['analyserImport']).not.toHaveBeenCalled();
  });

  it('exige les données de création de chaque nouvel employé avant d’envoyer les corrections', () => {
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.analyse.set({ ...ANALYSE, pret: false, lignes: [{ ...ANALYSE.lignes[0], employeId: null }] });

    api.corriger();

    expect(api.erreur()).toContain('Complétez les dates');
    expect(service['corrigerImport']).not.toHaveBeenCalled();
  });

  it('envoie les créations et les alignements après validation des champs', () => {
    api.mois.set(new Date(2026, 9, 1));
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.texteForfaits.set('AB123;12,50');
    api.analyse.set({ ...ANALYSE, pret: false, lignes: [{ ...ANALYSE.lignes[0], employeId: null }] });
    api.creations.set({ 2: { dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01', salaire: 4000, typeSalaire: 'MENSUEL' } });
    api.alignements.set([9]);
    service['corrigerImport'].mockReturnValue(of(ANALYSE));

    api.corriger();

    expect(service['corrigerImport']).toHaveBeenCalledWith(expect.any(File), '2026-10', 4, {
      aligner: [{ employeId: 9 }],
      creer: [{ numeroLigne: 2, dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01', salaire: 4000, typeSalaire: 'MENSUEL' }]
    }, [{ cin: 'AB123', montantDh: 12.5 }]);
  });

  it('importe seulement une analyse prête et conserve le bilan final', () => {
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.analyse.set(ANALYSE);
    const resultat = { periode: '2026-10', chantierId: 4, lignesHeures: 1, lignesZero: 0, forfaitsSeuls: 0,
      remplacements: 0, heuresTotales: 2, montantTotalDh: 20, stcTotalDh: 0, forfaitTotalDh: 0, netTotalDh: 20 };
    service['importer'].mockReturnValue(of(resultat));

    api.importer();

    expect(api.resultat()).toEqual(resultat);
    api.analyse.set({ ...ANALYSE, pret: false });
    service['importer'].mockClear();
    api.importer();
    expect(service['importer']).not.toHaveBeenCalled();
  });

  it('confirme un remplacement audité, peut basculer les alignements et relaie les erreurs serveur', () => {
    api.mois.set(new Date(2026, 9, 1));
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.texteForfaits.set('AB123;500');
    api.analyse.set({ ...ANALYSE, pret: false, erreurs: ['Une ligne existe déjà pour ce mois.'] });
    api.basculerAlignement(7);
    expect(api.alignements()).toEqual([7]);
    api.basculerAlignement(7);
    expect(api.alignements()).toEqual([]);

    api.demanderRemplacement();
    const demande = confirmation.confirm.mock.calls[0]?.[0] as { accept: () => void };
    service['remplacer'].mockReturnValue(throwError(() => ({ error: { message: 'Remplacement refusé.' } })));
    demande.accept();

    expect(service['remplacer']).toHaveBeenCalledWith(expect.any(File), '2026-10', 4, [{ cin: 'AB123', montantDh: 500 }]);
    expect(api.erreur()).toBe('Remplacement refusé.');
    expect(api.chargement()).toBe(false);
  });
});
