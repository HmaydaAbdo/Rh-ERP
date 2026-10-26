import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationService } from '@shared/feedback/feedback.service';
import { of, Subject, throwError } from 'rxjs';

import { PaieChantierPeriode, PaieMaterielTableau, PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieExportWizardComponent } from './paie-export-wizard.component';
import { PaieExportStore } from './paie-export.store';

const PERIODES: PaiePeriodeResume[] = [
    { periode: '2026-09', nombreBulletins: 975, nombreChantiers: 25, masse: 4421310.05, stc: 41, stcMontant: 75000 },
    { periode: '2026-08', nombreBulletins: 969, nombreChantiers: 25, masse: 4399080.74, stc: 37, stcMontant: 68000 }
];
const CHANTIERS: PaieChantierPeriode[] = [
    {
        id: 1,
        code: 'C168',
        libelle: 'Nador',
        effectif: 313,
        masse: 1439875.77,
        stc: 20,
        stcMontant: 30000,
        equipes: [
            { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 74, masse: 700000, stc: 8, stcMontant: 15000 },
            { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 69, masse: 600000, stc: 12, stcMontant: 15000 }
        ]
    },
    { id: 2, code: 'C196', libelle: 'Marrakech', effectif: 125, masse: 559886.92, stc: 9, stcMontant: 12000, equipes: [{ id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 48, masse: 200000, stc: 4, stcMontant: 7000 }] }
];
const TABLEAUX: PaieMaterielTableau[] = [
    { chantierCode: 'C168', equipeCode: 'CH', titre: 'CAMION', libelles: ['CAMION CITERNE', 'PICK UP'] },
    { chantierCode: 'C168', equipeCode: 'OP', titre: 'ENGINS', libelles: ['BULL'] }
];

describe('PaieExportWizardComponent', () => {
    let fixture: ComponentFixture<PaieExportWizardComponent>;
    let composant: PaieExportWizardComponent;
    let store: PaieExportStore;
    let service: MockedObject<PaieService>;

    beforeEach(() => {
        localStorage.removeItem('paie.export.materiel');
        service = {
            listerPeriodes: vi.fn().mockName("PaieService.listerPeriodes"),
            listerChantiersDeLaPeriode: vi.fn().mockName("PaieService.listerChantiersDeLaPeriode"),
            listerTableauxMateriel: vi.fn().mockName("PaieService.listerTableauxMateriel"),
            exporter: vi.fn().mockName("PaieService.exporter"),
            telechargerRapportPdf: vi.fn().mockName("PaieService.telechargerRapportPdf")
        } as unknown as MockedObject<PaieService>;
        service.listerPeriodes.mockReturnValue(of(PERIODES));
        service.listerChantiersDeLaPeriode.mockReturnValue(of(CHANTIERS));
        service.listerTableauxMateriel.mockReturnValue(of(TABLEAUX));
        service.telechargerRapportPdf.mockReturnValue(of(new Blob(['%PDF-'])));
        service.exporter.mockReturnValue(of(new Blob(['xlsx'])));

        TestBed.configureTestingModule({
            imports: [PaieExportWizardComponent],
            providers: [{ provide: PaieService, useValue: service }, NotificationService]
        });
        fixture = TestBed.createComponent(PaieExportWizardComponent);
        composant = fixture.componentInstance;
        composant.visible.set(true);
        fixture.detectChanges();
        store = fixture.debugElement.injector.get(PaieExportStore);
        vi.spyOn(store as unknown as {
            telecharger: () => void;
        }, 'telecharger').mockReturnValue(undefined);
    });

    it('présélectionne le dernier mois qui contient de la paie et affiche son contenu', () => {
        expect(store.periode()).toBe('2026-09');
        expect(store.resume()?.nombreBulletins).toBe(975);
        expect(store.disponibles()).toEqual(['2026-09', '2026-08']);
    });

    it('bloque un export incomplet et permet de reprendre le chargement sans perdre le mois choisi', () => {
        service.listerTableauxMateriel.mockReturnValueOnce(throwError(() => new Error('indisponible')));
        store.ouvrir();
        store.choisirPeriode('2026-08');
        expect(store.erreursChargement()).toEqual(['materiel']);
        store.suivant();
        expect(store.etape()).toBe('periode');

        store.reessayerChargements();
        expect(store.erreursChargement()).toEqual([]);
        expect(store.periode()).toBe('2026-08');
        store.suivant();
        expect(store.etape()).toBe('format');
    });

    it('abandonne les marchés d’un ancien mois avant de lire le suivant', () => {
        const ancien = new Subject<PaieChantierPeriode[]>();
        const courant = new Subject<PaieChantierPeriode[]>();
        service.listerChantiersDeLaPeriode.mockReturnValueOnce(ancien).mockReturnValueOnce(courant);
        store.suivant();
        store.precedent();
        store.choisirPeriode('2026-08');
        store.suivant();
        ancien.next(CHANTIERS);
        expect(store.chantiers()).toEqual([]);
        expect(ancien.observed).toBe(false);
        expect(store.chantiersEnCours()).toBe(true);

        courant.next([CHANTIERS[1]]);
        courant.complete();
        expect(store.chantiers()).toEqual([CHANTIERS[1]]);
        expect(store.chantiersEnCours()).toBe(false);
    });

    it("refuse de continuer sans mois valide et l'explique", () => {
        store.periode.set('2026-03');
        store.suivant();

        expect(store.etape()).toBe('periode');
        expect(store.erreur()).toContain('mois qui contient des bulletins');
    });

    it("charge les chantiers du mois en quittant l'étape période", () => {
        store.suivant();

        expect(store.etape()).toBe('format');
        expect(service.listerChantiersDeLaPeriode).toHaveBeenCalledWith('2026-09');
        expect(store.chantiers().length).toBe(2);
    });

    it("ne coche aucune équipe d'office : ouvrir un chantier ne fait que déplier ses équipes", () => {
        store.suivant();
        store.basculerOuverture(CHANTIERS[0]);
        expect(store.estOuvert('C168')).toBe(true);
        expect(store.estDetaille('C168')).toBe(false);
        expect(store.equipesChoisies('C168')).toEqual([]);

        store.basculerOuverture(CHANTIERS[0]);
        expect(store.estOuvert('C168')).toBe(false);
    });

    it("permet de cocher seulement quelques équipes d'un chantier, ou toutes / aucune d'un coup", () => {
        store.suivant();

        store.basculerEquipe('C168', 'Chauffeurs');
        expect(store.equipesChoisies('C168')).toEqual(['Chauffeurs']);
        expect(store.estDetaille('C168')).toBe(true);

        store.toutesLesEquipes(CHANTIERS[0], true);
        expect(store.equipesChoisies('C168')).toEqual(['Chauffeurs', 'Opérateurs']);

        store.toutesLesEquipes(CHANTIERS[0], false);
        expect(store.equipesChoisies('C168')).toEqual([]);
        expect(store.estDetaille('C168')).toBe(false);
    });

    it("ne déplie pas un chantier qui n'a aucune équipe", () => {
        store.suivant();
        const sansEquipe = { ...CHANTIERS[1], code: 'C999', equipes: [] };

        store.basculerOuverture(sansEquipe);

        expect(store.estOuvert('C999')).toBe(false);
    });

    it("n'envoie aucun détail quand aucune équipe n'est cochée", () => {
        store.suivant();
        store.basculerOuverture(CHANTIERS[0]);

        store.etape.set('recap');
        store.suivant();

        expect(vi.mocked(service.telechargerRapportPdf).mock.lastCall![0].equipesParChantier).toBeNull();
        expect(store.etapes()).not.toContain('materiel');
    });

    it("n'ajoute l'étape matériel que si C168 est détaillé avec l'équipe qui porte un tableau", () => {
        store.suivant();
        expect(store.etapes()).not.toContain('materiel');

        store.basculerEquipe('C196', 'Chauffeurs'); // C196 : pas de tableau matériel
        expect(store.etapes()).not.toContain('materiel');

        store.basculerOuverture(CHANTIERS[0]);
        expect(store.etapes()).not.toContain('materiel'); // chantier ouvert, aucune équipe cochée

        store.basculerEquipe('C168', 'Chauffeurs');
        store.basculerEquipe('C168', 'Opérateurs');
        expect(store.etapes()).toEqual(['periode', 'format', 'chantier', 'equipes', 'materiel', 'recap']);

        store.basculerEquipe('C168', 'Chauffeurs');
        store.basculerEquipe('C168', 'Opérateurs');
        expect(store.etapes()).not.toContain('materiel');
    });

    it("n'envoie que les nombres saisis des tableaux imprimés, et un zéro compte comme une saisie", () => {
        store.suivant();
        store.basculerEquipe('C168', 'Chauffeurs'); // seul CAMION est imprimé : OP n'est pas choisie
        store.saisirNombre('CAMION CITERNE', '4');
        store.saisirNombre('PICK UP', '0');
        store.saisirNombre('BULL', '9');

        store.etape.set('recap');
        store.suivant();

        const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
        expect(requete.materiel).toEqual({ 'CAMION CITERNE': 4, 'PICK UP': 0 });
        expect(requete.equipesParChantier).toEqual({ C168: ['Chauffeurs'] });
        expect(store.etat()).toBe('termine');
    });

    it('laisse la colonne vide quand le tableau est marqué « vide »', () => {
        store.suivant();
        store.basculerEquipe('C168', 'Chauffeurs');
        store.saisirNombre('CAMION CITERNE', '4');
        store.basculerVide(TABLEAUX[0]);

        store.etape.set('recap');
        store.suivant();

        expect(vi.mocked(service.telechargerRapportPdf).mock.lastCall![0].materiel).toBeNull();
    });

    it('refuse un nombre invalide et le signale', () => {
        store.saisirNombre('PICK UP', '-2');
        expect(store.erreur()).toContain('entier entre 0 et 999');
        expect(store.nombre('PICK UP')).toBeNull();

        store.saisirNombre('PICK UP', '12');
        expect(store.erreur()).toBeNull();
        expect(store.nombre('PICK UP')).toBe(12);
    });

    it("construit la requête Excel avec le mode personnalisé et les équipes retirées de la feuille du chantier", () => {
        store.suivant();
        store.choisirFormat('EXCEL');
        store.toutesLesEquipes(CHANTIERS[0], true);
        store.basculerRetrait('C168', 'Opérateurs');

        store.etape.set('recap');
        store.suivant();

        const requete = vi.mocked(service.exporter).mock.lastCall![0];
        expect(requete.feuillesEquipeMode).toBe('PERSONNALISE');
        expect(requete.equipesExcluesFeuilleChantier).toEqual({ C168: ['Opérateurs'] });
        expect(requete.periode).toBe('2026-09');
    });

    it('ne conserve pas les nombres matériels saisis pour le prochain export', () => {
        store.suivant();
        store.basculerEquipe('C168', 'Chauffeurs');
        store.saisirNombre('CAMION CITERNE', '7');
        store.etape.set('recap');
        store.suivant();

        expect(localStorage.getItem('paie.export.materiel')).toBeNull();
        store.ouvrir();
        expect(store.nombre('CAMION CITERNE')).toBeNull();
    });

    describe('étape « chantier » (PDF)', () => {
        it("propose l'étape chantier en PDF seulement, entre le format et les équipes", () => {
            expect(store.etapes()).toEqual(['periode', 'format', 'chantier', 'equipes', 'recap']);

            store.choisirFormat('EXCEL');

            expect(store.etapes()).toEqual(['periode', 'format', 'equipes', 'recap']);
        });

        it('sans marché choisi : rapport complet, tous les marchés, vue d’ensemble incluse', () => {
            store.suivant();
            store.etape.set('recap');
            store.suivant();

            const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
            expect(requete.chantierIds).toBeNull();
            expect(requete.sansVueEnsemble).toBe(false);
            expect(store.texteChantier()).toBe('Tous les marchés');
        });

        it('plusieurs marchés choisis limitent le rapport et retirent la vue d’ensemble, qu’on peut remettre', () => {
            store.suivant();
            store.choisirMarches(['C168', 'C196']);

            expect(store.sansVueEnsemble()).toBe(true);
            expect(store.chantiersPourEquipes().map((c) => c.code)).toEqual(['C168', 'C196']);

            store.basculerVueEnsemble();
            store.etape.set('recap');
            store.suivant();

            const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
            expect(requete.chantierIds).toEqual([1, 2]);
            expect(requete.sansVueEnsemble).toBe(false);
            expect(store.texteChantier()).toBe('C168 — Nador, C196 — Marrakech');
        });

        it('limite les équipes et le matériel aux marchés sélectionnés sans effacer les autres choix', () => {
            store.suivant();
            store.basculerEquipe('C168', 'Chauffeurs');
            store.basculerEquipe('C196', 'Chauffeurs');
            expect(store.etapes()).toContain('materiel');

            store.choisirMarches(['C196']);

            expect(store.equipesChoisies('C168')).toEqual(['Chauffeurs']);
            expect(store.equipesChoisies('C196')).toEqual(['Chauffeurs']);
            expect(store.etapes()).not.toContain('materiel');
        });

        it('retourner à « Tous les marchés » remet la vue d’ensemble', () => {
            store.suivant();
            store.choisirMarches(['C168']);
            store.choisirMarches([]);

            expect(store.marchesChoisis()).toEqual([]);
            expect(store.sansVueEnsemble()).toBe(false);
        });

        it('ignore la sélection des marchés en Excel et la retrouve au retour en PDF', () => {
            store.suivant();
            store.choisirMarches(['C196']);
            store.choisirFormat('EXCEL');

            expect(store.marchesEffectifs()).toEqual([]);
            expect(store.chantiersPourEquipes().length).toBe(2);
            store.etape.set('recap');
            store.suivant();
            expect(vi.mocked(service.exporter).mock.lastCall![0].chantiers).toBeNull();

            store.choisirFormat('PDF');
            expect(store.marchesEffectifs()).toEqual(['C196']);
        });

        it('filtre les chantiers proposés par code ou libellé', () => {
            store.suivant();
            store.rechercherChantier('marra');

            expect(store.chantiersProposes().map((c) => c.code)).toEqual(['C196']);
        });

        it('changer de mois oublie les marchés choisis', () => {
            store.suivant();
            store.choisirMarches(['C196']);

            store.choisirPeriode('2026-08');

            expect(store.marchesChoisis()).toEqual([]);
            expect(store.sansVueEnsemble()).toBe(false);
        });
    });
});
