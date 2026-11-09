import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Component, input, model, WritableSignal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ConfirmDialogService } from '../../../shared/ui/feedback/feedback.service';
import { LazySelectComponent } from '../../../shared/ui/lazy-select/lazy-select.component';
import { PaieService } from '../../paie/services/paie.service';
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
  periode: WritableSignal<string>;
  modeleOuvert: WritableSignal<boolean>;
  fermer(): void;
  chantierId: WritableSignal<number | null>;
  chantierLibelle: WritableSignal<string>;
  fichier: WritableSignal<File | null>;
  forfaits: WritableSignal<{ cin: string; nomPrenom: string; montantDh: number }[]>;
  employeForfaitSelectionne: WritableSignal<number | null>;
  forfaitEmploye: WritableSignal<{ id: number; nomPrenom: string; cin: string; displayLabel: string } | null>;
  montantForfait: WritableSignal<number | null>;
  forfaitDialogueOuvert: WritableSignal<boolean>;
  analyse: WritableSignal<HeuresSuppImportAnalyse | null>;
  resultat: WritableSignal<HeuresSuppImportResult | null>;
  erreur: WritableSignal<string | null>;
  chargement: WritableSignal<boolean>;
  peutRemplacer(): boolean;
  creations: WritableSignal<Record<number, { dateNaissance: string; dateEmbauche: string; fonctionId: number; salaire: number; typeSalaire: '' | 'JOURNALIER' | 'MENSUEL' }>>;
  alignements: WritableSignal<number[]>;
  valeurSalaire(numero: number): number | null;
  dateCreation(numero: number, cle: 'dateNaissance' | 'dateEmbauche'): Date | null;
  saisirDate(numero: number, cle: 'dateNaissance' | 'dateEmbauche', valeur: Date | null): void;
  saisirSalaire(numero: number, valeur: number | null): void;
  choisirTypeSalaire(numero: number, valeur: unknown): void;
  estAligne(id: number): boolean;
  choisirChantier(value: unknown): void;
  choisirFonction(numero: number, value: unknown): void;
  choisirFichier(event: Event): void;
  choisirEmployeForfait(value: unknown): void;
  enregistrerForfait(): void;
  annulerForfait(): void;
  retirerForfait(cin: string): void;
  modifierMontantForfait(cin: string, montant: number | null): void;
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
  let employeeReference: { fetchById: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    service = {
      verifierPrerequis: vi.fn(), forfaitsPrecedents: vi.fn().mockReturnValue(of([])),
      analyserImport: vi.fn(), corrigerImport: vi.fn(), importer: vi.fn(), remplacer: vi.fn()
    };
    confirmation = { confirm: vi.fn() };
    chantierReference = { fetchById: vi.fn().mockReturnValue(of({ id: 4, code: 'C4', designation: 'Site', nom: null, actif: true })) };
    employeeReference = { fetchById: vi.fn().mockReturnValue(of({ id: 7, nomPrenom: 'Salma Alaoui', cin: 'AB123', displayLabel: 'Salma Alaoui — AB123' })) };
    TestBed.configureTestingModule({
      imports: [HeuresSuppImportComponent],
      providers: [
        provideRouter([]),
        { provide: HeuresSuppService, useValue: service },
        { provide: PaieService, useValue: { listerPeriodes: () => of([{ periode: '2026-09' }, { periode: '2026-10' }]) } },
        { provide: ConfirmDialogService, useValue: confirmation },
        { provide: ChantierReferenceService, useValue: chantierReference },
        { provide: EmployeeReferenceService, useValue: employeeReference },
        { provide: FunctionReferenceService, useValue: {} }
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

  it('commence au chantier, avec le mois de la dernière paie figé et affiché', () => {
    expect(api.etape()).toBe(1);
    expect(api.periode()).toBe('2026-10');
    expect(document.body.textContent).toContain('Mois de la paie');
    expect(document.body.textContent).toContain('Continuer');
    expect(document.body.textContent).not.toContain('Retour aux heures supplémentaires');
    expect(document.body.querySelector('stp-month-input')).toBeNull();
  });

  it('revient à la liste quand le dialogue se ferme', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    api.fermer();
    expect(navigate).toHaveBeenCalledWith(['/heures-supp']);
  });

  it('parcourt les quatre étapes par les boutons affichés', () => {
    api.periode.set('2026-10');
    api.choisirChantier(4);
    service['verifierPrerequis'].mockReturnValue(of({ pret: true, message: null }));
    fixture.detectChanges();
    const boutonContexte = [...document.body.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Continuer')) as HTMLButtonElement;
    boutonContexte.click();
    fixture.detectChanges();
    expect(api.etape()).toBe(2);

    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    service['analyserImport'].mockReturnValue(of(ANALYSE));
    fixture.detectChanges();
    const continuer = [...document.body.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Continuer')) as HTMLButtonElement;
    continuer.click();
    fixture.detectChanges();
    expect(api.etape()).toBe(3);
    const boutonAnalyse = [...document.body.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Analyser le pointage')) as HTMLButtonElement;
    boutonAnalyse.click();
    fixture.detectChanges();
    expect(api.etape()).toBe(4);

    service['importer'].mockReturnValue(of({ periode: '2026-10', chantierId: 4, lignesHeures: 1, lignesZero: 0,
      forfaitsSeuls: 0, remplacements: 0, heuresTotales: 2, montantTotalDh: 20, stcTotalDh: 0, forfaitTotalDh: 0, netTotalDh: 20 }));
    const boutonImporter = [...document.body.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Confirmer l’import')) as HTMLButtonElement;
    boutonImporter.click();
    fixture.detectChanges();
    expect(document.body.textContent).toContain('importées');
  });

  it('ne lance pas les actions avant la sélection du mois, du chantier et du fichier', () => {
    api.verifierContexte();
    api.analyser();
    api.corriger();
    api.importer();

    expect(service['verifierPrerequis']).not.toHaveBeenCalled();
    expect(service['analyserImport']).not.toHaveBeenCalled();
    expect(service['corrigerImport']).not.toHaveBeenCalled();
    expect(service['importer']).not.toHaveBeenCalled();
  });

  it('autorise le remplacement uniquement pour les doublons d’import', () => {
    expect(api.peutRemplacer()).toBe(false);
    api.analyse.set({ ...ANALYSE, erreurs: ['Une ligne existe déjà pour ce mois.'] });
    expect(api.peutRemplacer()).toBe(true);
    api.analyse.set({ ...ANALYSE, erreurs: ['Le salaire est invalide.'] });
    expect(api.peutRemplacer()).toBe(false);
  });

  it('gère les champs de correction, l’alignement et le remplacement du fichier', () => {
    expect(api.valeurSalaire(2)).toBeNull();
    api.creations.set({ 2: { dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01', fonctionId: 8, salaire: 4000, typeSalaire: 'MENSUEL' } });
    expect(api.valeurSalaire(2)).toBe(4000);
    expect(api.dateCreation(2, 'dateNaissance')).toEqual(new Date(1990, 0, 1));
    api.saisirDate(2, 'dateNaissance', new Date(1991, 2, 2));
    expect(api.creations()[2].dateNaissance).toBe('1991-03-02');
    api.saisirSalaire(2, null);
    expect(api.valeurSalaire(2)).toBeNull();
    api.saisirSalaire(2, 4500);
    expect(api.valeurSalaire(2)).toBe(4500);
    expect(api.estAligne(7)).toBe(false);
    api.basculerAlignement(7);
    expect(api.estAligne(7)).toBe(true);

    api.analyse.set(ANALYSE);
    const fichier = new File(['nouveau'], 'nouveau.xlsx');
    api.choisirFichier({ target: { files: [fichier] } } as unknown as Event);
    expect(api.fichier()).toBe(fichier);
    expect(api.analyse()).toBeNull();
  });

  it('normalise les sélections, convertit les champs et accepte la suppression de fichier', () => {
    api.choisirChantier('4');
    expect(api.chantierId()).toBeNull();
    api.choisirChantier(4);
    api.analyse.set(ANALYSE);
    api.choisirFichier({ target: { files: [] } } as unknown as Event);
    expect(api.fichier()).toBeNull();
    expect(api.analyse()).toBeNull();
    api.choisirFonction(3, 8);
    api.choisirFonction(4, '9');
    expect(api.creations()).toMatchObject({ 3: { fonctionId: 8 }, 4: { fonctionId: 0 } });
    api.choisirTypeSalaire(4, 'JOURNALIER');
    api.choisirTypeSalaire(5, 'INCONNU');
    expect(api.creations()[4].typeSalaire).toBe('JOURNALIER');
    expect(api.creations()[5]).toBeUndefined();
  });

  it('bloque l’étape suivante si la paie mensuelle manque', () => {
    api.periode.set('2026-10');
    api.choisirChantier(4);
    service['verifierPrerequis'].mockReturnValue(of({ pret: false, message: 'Importez d’abord la paie.' }));

    api.verifierContexte();

    expect(api.etape()).toBe(1);
    expect(api.erreur()).toBe('Importez d’abord la paie.');
  });

  it('ignore les actions incomplètes et affiche les erreurs de contrôle du contexte', () => {
    api.periode.set('2026-10');
    api.verifierContexte();
    api.analyser();
    api.corriger();
    api.importer();
    expect(service['verifierPrerequis']).not.toHaveBeenCalled();
    api.choisirChantier(4);
    service['verifierPrerequis'].mockReturnValue(throwError(() => ({ error: { message: 'Contexte indisponible.' } })));
    api.verifierContexte();
    expect(api.erreur()).toBe('Contexte indisponible.');
    expect(api.chargement()).toBe(false);
  });

  it('ouvre l’étape fichier uniquement après le contrôle de paie', () => {
    api.periode.set('2026-10');
    api.choisirChantier(4);
    service['verifierPrerequis'].mockReturnValue(of({ pret: true, message: null }));

    api.verifierContexte();

    expect(api.etape()).toBe(2);
    expect(api.chantierLibelle()).toBe('C4 · Site');
    expect(chantierReference.fetchById).toHaveBeenCalledWith(4);
  });

  it('reprend les forfaits du dernier mois du chantier, modifiables, retirables et enrichis', () => {
    service['forfaitsPrecedents'].mockReturnValue(of([
      { cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 400, periode: '2026-09' },
      { cin: 'CD456', nomPrenom: 'Omar Idrissi', montantDh: 250, periode: '2026-09' }
    ]));
    service['verifierPrerequis'].mockReturnValue(of({ pret: true, message: null }));
    api.periode.set('2026-10');
    api.choisirChantier(4);

    api.verifierContexte();
    api.etape.set(3);
    fixture.detectChanges();

    expect(service['forfaitsPrecedents']).toHaveBeenCalledWith('2026-10', 4);
    expect(api.forfaits().map((f) => f.cin)).toEqual(['AB123', 'CD456']);
    expect(document.body.textContent).toContain('Forfaits repris de');
    expect(document.body.textContent).toContain('Salma Alaoui');

    api.modifierMontantForfait('AB123', 450);
    api.modifierMontantForfait('CD456', -3);
    api.retirerForfait('CD456');
    expect(api.forfaits()).toEqual([{ cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 450 }]);

    api.forfaitEmploye.set({ id: 9, nomPrenom: 'Nadia Zahri', cin: 'EF789', displayLabel: 'Nadia Zahri — EF789' });
    api.montantForfait.set(300);
    api.enregistrerForfait();
    expect(api.forfaits().map((f) => [f.cin, f.montantDh])).toEqual([['AB123', 450], ['EF789', 300]]);
  });

  it('ne reprend pas deux fois les forfaits du même chantier et tolère un échec de chargement', () => {
    service['verifierPrerequis'].mockReturnValue(of({ pret: true, message: null }));
    service['forfaitsPrecedents'].mockReturnValue(throwError(() => new Error('indisponible')));
    api.periode.set('2026-10');
    api.choisirChantier(4);

    api.verifierContexte();

    expect(api.etape()).toBe(2);
    expect(api.forfaits()).toEqual([]);
    fixture.detectChanges();
    api.etape.set(3);
    fixture.detectChanges();
    expect(document.body.textContent).toContain('Aucun forfait précédent');
  });

  it('propose de voir le modèle Excel sans le décrire dans l’étape du pointage', () => {
    api.etape.set(2);
    fixture.detectChanges();
    expect(document.body.textContent).toContain('Déposez le classeur de pointage');
    expect(document.body.textContent).toContain('Voir le modèle Excel');
    expect(document.body.textContent).not.toContain('Excel attendu');
    api.modeleOuvert.set(true);
    fixture.detectChanges();
    expect(document.body.textContent).toContain('Nom et prénom');
  });

  it('valide le format des forfaits puis analyse avec le montant décimal', () => {
    api.periode.set('2026-10');
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.forfaits.set([{ cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 12.5 }]);
    service['analyserImport'].mockReturnValue(of(ANALYSE));

    api.analyser();

    expect(service['analyserImport']).toHaveBeenCalledWith(expect.any(File), '2026-10', 4, [{ cin: 'AB123', montantDh: 12.5 }]);
    expect(api.etape()).toBe(4);
    expect(api.analyse()).toEqual(ANALYSE);
  });

  it('ajoute un forfait depuis un employé choisi et permet de le retirer', () => {
    api.choisirEmployeForfait(7);
    expect(employeeReference.fetchById).toHaveBeenCalledWith(7);
    expect(api.forfaitDialogueOuvert()).toBe(true);
    expect(api.forfaitEmploye()?.cin).toBe('AB123');
    api.annulerForfait();
    expect(api.employeForfaitSelectionne()).toBeNull();
    api.choisirEmployeForfait(7);
    api.montantForfait.set(500);
    api.enregistrerForfait();
    expect(api.forfaits()).toEqual([{ cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 500 }]);
    api.retirerForfait('AB123');
    expect(api.forfaits()).toEqual([]);
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
    api.periode.set('2026-10');
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.forfaits.set([{ cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 12.5 }]);
    api.analyse.set({ ...ANALYSE, pret: false, lignes: [{ ...ANALYSE.lignes[0], employeId: null }] });
    api.creations.set({ 2: { dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01', fonctionId: 8, salaire: 4000, typeSalaire: 'MENSUEL' } });
    api.alignements.set([9]);
    service['corrigerImport'].mockReturnValue(of(ANALYSE));

    api.corriger();

    expect(service['corrigerImport']).toHaveBeenCalledWith(expect.any(File), '2026-10', 4, {
      aligner: [{ employeId: 9 }],
      creer: [{ numeroLigne: 2, dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01', fonctionId: 8, salaire: 4000, typeSalaire: 'MENSUEL' }]
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

  it('valide les corrections de création et relaie les erreurs pendant analyse et import', () => {
    const fichier = new File(['xlsx'], 'heures.xlsx');
    api.fichier.set(fichier);
    api.choisirChantier(4);
    api.analyse.set({ ...ANALYSE, pret: false, lignes: [{ ...ANALYSE.lignes[0], employeId: null }] });
    api.creations.set({ 2: { dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01', fonctionId: 8, salaire: -1, typeSalaire: 'MENSUEL' } });
    api.corriger();
    expect(api.erreur()).toContain('Complétez les dates');
    expect(service['corrigerImport']).not.toHaveBeenCalled();

    api.forfaits.set([{ cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 500 }]);
    service['analyserImport'].mockReturnValue(throwError(() => ({ message: 'Analyse refusée.' })));
    api.analyser();
    expect(api.erreur()).toBe('Analyse refusée.');
    expect(api.chargement()).toBe(false);

    api.analyse.set(ANALYSE);
    service['importer'].mockReturnValue(throwError(() => new Error('Import refusé.')));
    api.importer();
    expect(api.erreur()).toBe('Import refusé.');
    expect(api.chargement()).toBe(false);
  });

  it('confirme un remplacement audité, peut basculer les alignements et relaie les erreurs serveur', () => {
    api.periode.set('2026-10');
    api.fichier.set(new File(['xlsx'], 'heures.xlsx'));
    api.choisirChantier(4);
    api.forfaits.set([{ cin: 'AB123', nomPrenom: 'Salma Alaoui', montantDh: 500 }]);
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
