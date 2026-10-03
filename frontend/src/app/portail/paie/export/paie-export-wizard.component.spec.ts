import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { PaieChantierPeriode, PaieMaterielTableau, PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieExportWizardComponent } from './paie-export-wizard.component';

const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-09', nombreBulletins: 975, nombreChantiers: 25, masse: 4421310.05, stc: 41 },
  { periode: '2026-08', nombreBulletins: 969, nombreChantiers: 25, masse: 4399080.74, stc: 37 }
];
const CHANTIERS: PaieChantierPeriode[] = [
  {
    code: 'C168',
    libelle: 'Nador',
    effectif: 313,
    masse: 1439875.77,
    equipes: [
      { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 74 },
      { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 69 }
    ]
  },
  { code: 'C196', libelle: 'Marrakech', effectif: 125, masse: 559886.92, equipes: [{ id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 48 }] }
];
const TABLEAUX: PaieMaterielTableau[] = [
  { chantierCode: 'C168', equipeCode: 'CH', titre: 'CAMION', libelles: ['CAMION CITERNE', 'PICK UP'] },
  { chantierCode: 'C168', equipeCode: 'OP', titre: 'ENGINS', libelles: ['BULL'] }
];

describe('PaieExportWizardComponent', () => {
  let fixture: ComponentFixture<PaieExportWizardComponent>;
  let composant: PaieExportWizardComponent;
  let service: jasmine.SpyObj<PaieService>;

  beforeEach(() => {
    localStorage.removeItem('paie.export.materiel');
    service = jasmine.createSpyObj<PaieService>('PaieService', [
      'listerPeriodes',
      'listerChantiersDeLaPeriode',
      'listerTableauxMateriel',
      'exporter',
      'telechargerRapportPdf'
    ]);
    service.listerPeriodes.and.returnValue(of(PERIODES));
    service.listerChantiersDeLaPeriode.and.returnValue(of(CHANTIERS));
    service.listerTableauxMateriel.and.returnValue(of(TABLEAUX));
    service.telechargerRapportPdf.and.returnValue(of(new Blob(['%PDF-'])));
    service.exporter.and.returnValue(of(new Blob(['xlsx'])));

    TestBed.configureTestingModule({
      imports: [PaieExportWizardComponent, NoopAnimationsModule],
      providers: [{ provide: PaieService, useValue: service }, MessageService]
    });
    fixture = TestBed.createComponent(PaieExportWizardComponent);
    composant = fixture.componentInstance;
    composant.visible = true;
    composant.ngOnChanges({ visible: { currentValue: true, previousValue: false, firstChange: true, isFirstChange: () => true } });
    spyOn(composant as unknown as { telecharger: () => void }, 'telecharger');
  });

  it('présélectionne le dernier mois qui contient de la paie et affiche son contenu', () => {
    expect(composant.periode()).toBe('2026-09');
    expect(composant.resume()?.nombreBulletins).toBe(975);
    expect(composant.disponibles()).toEqual(['2026-09', '2026-08']);
  });

  it("refuse de continuer sans mois valide et l'explique", () => {
    composant.periode.set('2026-03');
    composant.suivant();

    expect(composant.etape()).toBe('periode');
    expect(composant.erreur()).toContain('mois qui contient des bulletins');
  });

  it("charge les chantiers du mois en quittant l'étape période", () => {
    composant.suivant();

    expect(composant.etape()).toBe('format');
    expect(service.listerChantiersDeLaPeriode).toHaveBeenCalledWith('2026-09');
    expect(composant.chantiers().length).toBe(2);
  });

  it("n'a coché aucune équipe quand on active un chantier : le choix est toujours explicite", () => {
    composant.suivant();
    composant.basculerChantier(CHANTIERS[0]);
    expect(composant.estDetaille('C168')).toBeTrue();
    expect(composant.equipesChoisies('C168')).toEqual([]);

    composant.toutesLesEquipes(CHANTIERS[0], true);
    expect(composant.equipesChoisies('C168')).toEqual(['CH', 'OP']);

    composant.basculerChantier(CHANTIERS[0]);
    expect(composant.estDetaille('C168')).toBeFalse();
  });

  it("n'envoie aucun détail pour un chantier activé sans équipe choisie", () => {
    composant.suivant();
    composant.basculerChantier(CHANTIERS[0]);

    composant.etape.set('recap');
    composant.suivant();

    expect(service.telechargerRapportPdf.calls.mostRecent().args[0].equipesParChantier).toBeNull();
    expect(composant.etapes()).not.toContain('materiel');
  });

  it("n'ajoute l'étape matériel que si C168 est détaillé avec l'équipe qui porte un tableau", () => {
    composant.suivant();
    expect(composant.etapes()).not.toContain('materiel');

    composant.basculerChantier(CHANTIERS[1]); // C196 : pas de tableau matériel
    expect(composant.etapes()).not.toContain('materiel');

    composant.basculerChantier(CHANTIERS[0]);
    expect(composant.etapes()).not.toContain('materiel'); // chantier activé, aucune équipe choisie

    composant.basculerEquipe('C168', 'CH');
    composant.basculerEquipe('C168', 'OP');
    expect(composant.etapes()).toEqual(['periode', 'format', 'equipes', 'materiel', 'recap']);

    composant.basculerEquipe('C168', 'CH');
    composant.basculerEquipe('C168', 'OP');
    expect(composant.etapes()).not.toContain('materiel');
  });

  it("n'envoie que les nombres saisis des tableaux imprimés, et un zéro compte comme une saisie", () => {
    composant.suivant();
    composant.basculerChantier(CHANTIERS[0]);
    composant.basculerEquipe('C168', 'CH'); // seul CAMION est imprimé : OP n'est pas choisie
    composant.saisirNombre('CAMION CITERNE', '4');
    composant.saisirNombre('PICK UP', '0');
    composant.saisirNombre('BULL', '9');

    composant.etape.set('recap');
    composant.suivant();

    const requete = service.telechargerRapportPdf.calls.mostRecent().args[0];
    expect(requete.materiel).toEqual({ 'CAMION CITERNE': 4, 'PICK UP': 0 });
    expect(requete.equipesParChantier).toEqual({ C168: ['CH'] });
    expect(composant.etat()).toBe('termine');
  });

  it('laisse la colonne vide quand le tableau est marqué « vide »', () => {
    composant.suivant();
    composant.basculerChantier(CHANTIERS[0]);
    composant.basculerEquipe('C168', 'CH');
    composant.saisirNombre('CAMION CITERNE', '4');
    composant.basculerVide(TABLEAUX[0]);

    composant.etape.set('recap');
    composant.suivant();

    expect(service.telechargerRapportPdf.calls.mostRecent().args[0].materiel).toBeNull();
  });

  it('refuse un nombre invalide et le signale', () => {
    composant.saisirNombre('PICK UP', '-2');
    expect(composant.erreur()).toContain('entier entre 0 et 999');
    expect(composant.nombre('PICK UP')).toBeNull();

    composant.saisirNombre('PICK UP', '12');
    expect(composant.erreur()).toBeNull();
    expect(composant.nombre('PICK UP')).toBe(12);
  });

  it("construit la requête Excel avec le mode personnalisé et les équipes retirées de la feuille du chantier", () => {
    composant.suivant();
    composant.choisirFormat('EXCEL');
    composant.basculerChantier(CHANTIERS[0]);
    composant.toutesLesEquipes(CHANTIERS[0], true);
    composant.basculerRetrait('C168', 'OP');

    composant.etape.set('recap');
    composant.suivant();

    const requete = service.exporter.calls.mostRecent().args[0];
    expect(requete.feuillesEquipeMode).toBe('PERSONNALISE');
    expect(requete.equipesExcluesFeuilleChantier).toEqual({ C168: ['OP'] });
    expect(requete.periode).toBe('2026-09');
  });

  it('mémorise les derniers nombres saisis pour préremplir le prochain export', () => {
    composant.suivant();
    composant.basculerChantier(CHANTIERS[0]);
    composant.basculerEquipe('C168', 'CH');
    composant.saisirNombre('CAMION CITERNE', '7');
    composant.etape.set('recap');
    composant.suivant();

    expect(JSON.parse(localStorage.getItem('paie.export.materiel') ?? '{}')['CAMION CITERNE']).toBe(7);
  });
});
