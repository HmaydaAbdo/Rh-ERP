import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationService } from '@shared/ui/feedback/feedback.service';
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
        service = {
            listerPeriodes: vi.fn().mockName("PaieService.listerPeriodes"),
            listerChantiersDeLaPeriode: vi.fn().mockName("PaieService.listerChantiersDeLaPeriode"),
            listerTableauxMateriel: vi.fn().mockName("PaieService.listerTableauxMateriel"),
            listerValeursMateriel: vi.fn().mockName("PaieService.listerValeursMateriel"),
            exporter: vi.fn().mockName("PaieService.exporter"),
            telechargerRapportPdf: vi.fn().mockName("PaieService.telechargerRapportPdf")
        } as unknown as MockedObject<PaieService>;
        service.listerPeriodes.mockReturnValue(of(PERIODES));
        service.listerChantiersDeLaPeriode.mockReturnValue(of(CHANTIERS));
        service.listerTableauxMateriel.mockReturnValue(of(TABLEAUX));
        service.listerValeursMateriel.mockReturnValue(of([]));
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

    it("laisse d'office chaque équipe dans la liste de son chantier", () => {
        store.suivant();

        expect(store.traitement('C168', 'Chauffeurs')).toBe('liste');
        expect(store.equipesSeparees(CHANTIERS[0])).toEqual([]);
        expect(store.chantiersRegles()).toEqual([]);
    });

    it("règle chaque chantier à part : une équipe séparée dans l'un reste dans la liste de l'autre", () => {
        store.suivant();

        store.choisirTraitement('C168', 'Chauffeurs', 'separee');
        expect(store.equipesSeparees(CHANTIERS[0])).toEqual(['Chauffeurs']);
        expect(store.equipesSeparees(CHANTIERS[1])).toEqual([]);
        expect(store.chantiersRegles().map((c) => c.code)).toEqual(['C168']);

        store.toutTraiter(CHANTIERS[0], 'separee');
        expect(store.equipesSeparees(CHANTIERS[0])).toEqual(['Chauffeurs', 'Opérateurs']);

        store.toutTraiter(CHANTIERS[0], 'liste');
        expect(store.equipesSeparees(CHANTIERS[0])).toEqual([]);
    });

    describe('étape équipes : un chantier par écran', () => {
        function ouvrirEquipes(): void {
            store.suivant(); // période -> format
            store.suivant(); // format -> marchés
            store.suivant(); // marchés -> équipes
        }

        it('avance et recule chantier par chantier avant de quitter l’étape', () => {
            ouvrirEquipes();
            expect(store.etape()).toBe('equipes');
            expect(store.chantierCourant()?.code).toBe('C168');
            expect(store.chantiersRestants()).toBe(1);

            store.suivant();
            expect(store.etape()).toBe('equipes');
            expect(store.chantierCourant()?.code).toBe('C196');
            expect(store.chantiersRestants()).toBe(0);

            store.precedent();
            expect(store.chantierCourant()?.code).toBe('C168');
            expect(store.sens()).toBe('arriere');

            store.precedent();
            expect(store.etape()).toBe('chantier');
        });

        it('« Passer les autres chantiers » quitte l’étape en laissant les suivants en simple liste', () => {
            ouvrirEquipes();
            store.choisirTraitement('C168', 'Chauffeurs', 'separee');

            store.passerChantiersRestants();

            expect(store.etape()).toBe('materiel');
            expect(store.equipesSeparees(CHANTIERS[1])).toEqual([]);
        });

        it('revenir depuis l’étape suivante retrouve le dernier chantier ; le récapitulatif rouvre le chantier voulu', () => {
            ouvrirEquipes();
            store.suivant();
            store.suivant();
            expect(store.etape()).toBe('recap');

            store.precedent();
            expect(store.chantierCourant()?.code).toBe('C196');

            store.etape.set('recap');
            store.allerAuChantier('C168');
            expect(store.etape()).toBe('equipes');
            expect(store.chantierCourant()?.code).toBe('C168');
        });

        it('refuse de quitter un chantier où une seule équipe est réunie, même par le raccourci', () => {
            ouvrirEquipes();
            store.choisirTraitement('C168', 'Chauffeurs', 'reunie');

            store.suivant();
            expect(store.chantierCourant()?.code).toBe('C168');
            expect(store.erreur()).toContain('au moins deux');

            store.passerChantiersRestants();
            expect(store.etape()).toBe('equipes');

            store.choisirTraitement('C168', 'Opérateurs', 'reunie');
            expect(store.erreur()).toBeNull();
            store.suivant();
            expect(store.chantierCourant()?.code).toBe('C196');
        });
    });

    it("n'envoie aucun détail quand aucune équipe ne quitte la liste", () => {
        store.suivant();

        store.etape.set('recap');
        store.suivant();

        const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
        expect(requete.equipesParChantier).toBeNull();
        expect(requete.regroupementsEquipesParChantier).toBeNull();
        expect(store.etapes()).not.toContain('materiel');
    });

    it("n'ajoute l'étape matériel que si l'équipe qui porte un tableau a sa section à part", () => {
        store.suivant();
        expect(store.etapes()).not.toContain('materiel');

        store.choisirTraitement('C196', 'Chauffeurs', 'separee'); // C196 : pas de tableau matériel
        expect(store.etapes()).not.toContain('materiel');

        store.toutTraiter(CHANTIERS[0], 'separee');
        expect(store.etapes()).toEqual(['periode', 'format', 'chantier', 'equipes', 'materiel', 'recap']);

        store.toutTraiter(CHANTIERS[0], 'liste');
        expect(store.etapes()).not.toContain('materiel');
    });

    it("n'envoie que les nombres saisis des tableaux imprimés, et un zéro compte comme une saisie", () => {
        store.suivant();
        store.choisirTraitement('C168', 'Chauffeurs', 'separee'); // seul CAMION est imprimé : OP reste dans la liste
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
        store.choisirTraitement('C168', 'Chauffeurs', 'separee');
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
        store.toutTraiter(CHANTIERS[0], 'separee');
        store.basculerRetrait('C168', 'Opérateurs');

        store.etape.set('recap');
        store.suivant();

        const requete = vi.mocked(service.exporter).mock.lastCall![0];
        expect(requete.feuillesEquipeMode).toBe('PERSONNALISE');
        expect(requete.equipesExcluesFeuilleChantier).toEqual({ C168: ['Opérateurs'] });
        expect(requete.periode).toBe('2026-09');
    });

    describe('mémoire du parc matériel (KAN-229)', () => {
        beforeEach(() => {
            service.listerValeursMateriel.mockReturnValue(of([
                { libelle: 'CAMION CITERNE', quantite: 4, periode: '2026-07' }
            ]));
            store.ouvrir();
            store.choisirPeriode('2026-08');
        });

        it('propose le dernier nombre mémorisé pour une ligne déjà connue, laisse vide une nouvelle ligne', () => {
            expect(service.listerValeursMateriel).toHaveBeenCalledWith('2026-08');
            expect(store.nombre('CAMION CITERNE')).toBe(4);
            expect(store.etatLigne('CAMION CITERNE')).toBe('conserve');
            expect(store.texteMemoire('CAMION CITERNE')).toBe('Repris de 2026-07');
            expect(store.nombre('PICK UP')).toBeNull();
            expect(store.etatLigne('PICK UP')).toBeNull();
        });

        it('ne remplace la valeur que par une saisie explicite, visible avant confirmation', () => {
            store.saisirNombre('CAMION CITERNE', '6');
            store.saisirNombre('PICK UP', '2');
            expect(store.etatLigne('CAMION CITERNE')).toBe('modifie');
            expect(store.texteMemoire('CAMION CITERNE')).toBe('Remplace 4 (2026-07)');
            expect(store.etatLigne('PICK UP')).toBe('nouveau');
        });

        it('change de mois sans écraser une saisie, et sans mémoire laisse les lignes vides', () => {
            store.saisirNombre('CAMION CITERNE', '9');
            service.listerValeursMateriel.mockReturnValue(of([
                { libelle: 'CAMION CITERNE', quantite: 5, periode: '2026-08' }
            ]));
            store.choisirPeriode('2026-09');
            expect(store.nombre('CAMION CITERNE')).toBe(9);
            expect(store.etatLigne('CAMION CITERNE')).toBe('modifie');
        });

        it("reste utilisable quand la mémoire est indisponible", () => {
            service.listerValeursMateriel.mockReturnValue(throwError(() => new Error('indisponible')));
            store.choisirPeriode('2026-09');
            expect(store.memoire()).toEqual({});
            expect(store.erreursChargement()).toEqual([]);
        });
    });

    it('ne conserve pas les nombres matériels saisis pour le prochain export', () => {
        store.suivant();
        store.choisirTraitement('C168', 'Chauffeurs', 'separee');
        store.saisirNombre('CAMION CITERNE', '7');
        store.etape.set('recap');
        store.suivant();

        store.ouvrir();
        expect(store.nombre('CAMION CITERNE')).toBeNull();
    });

    describe('réunion d’équipes (PDF)', () => {
        function lancer(): void {
            store.etape.set('recap');
            store.suivant();
        }

        it('la réunion ne vaut que pour le chantier où elle est choisie', () => {
            store.suivant();
            store.toutTraiter(CHANTIERS[0], 'reunie');

            expect(store.equipesReunies(CHANTIERS[0])).toEqual(['Chauffeurs', 'Opérateurs']);
            expect(store.equipesReunies(CHANTIERS[1])).toEqual([]);
            expect(store.texteEquipes(CHANTIERS[0])).toBe('Réunies : Chauffeurs + Opérateurs');

            lancer();

            const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
            expect(requete.regroupementsEquipesParChantier).toEqual({ C168: [['Chauffeurs', 'Opérateurs']] });
            expect(requete.equipesParChantier).toBeNull();
        });

        it('un même chantier mêle une équipe séparée et des équipes réunies ; le reste va dans la liste', () => {
            const quatre = { ...CHANTIERS[0], equipes: [
                ...CHANTIERS[0].equipes,
                { id: 3, code: 'LABO', libelle: 'Labo', effectif: 5, masse: 1, stc: 0, stcMontant: 0 },
                { id: 4, code: 'MEC', libelle: 'Mécaniciens', effectif: 9, masse: 1, stc: 0, stcMontant: 0 }
            ] };
            service.listerChantiersDeLaPeriode.mockReturnValue(of([quatre, CHANTIERS[1]]));
            store.ouvrir();
            store.suivant();
            store.choisirTraitement('C168', 'Chauffeurs', 'reunie');
            store.choisirTraitement('C168', 'Opérateurs', 'reunie');
            store.choisirTraitement('C168', 'Labo', 'separee');

            expect(store.texteEquipes(quatre)).toBe('Réunies : Chauffeurs + Opérateurs · Séparée : Labo · 1 dans la liste');
            expect(store.apercu(quatre)).toEqual([
                { titre: 'Section Chauffeurs + Opérateurs', effectif: 143 },
                { titre: 'Section Labo', effectif: 5 },
                { titre: 'Liste des autres employés, sans colonne Équipe', effectif: 165 }
            ]);

            lancer();

            const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
            expect(requete.equipesParChantier).toEqual({ C168: ['Labo'] });
            expect(requete.regroupementsEquipesParChantier).toEqual({ C168: [['Chauffeurs', 'Opérateurs']] });
        });

        it('les équipes réunies n’ont plus de section ni de tableau matériel propres', () => {
            store.suivant();
            store.toutTraiter(CHANTIERS[0], 'separee');
            expect(store.etapes()).toContain('materiel');

            store.toutTraiter(CHANTIERS[0], 'reunie');

            expect(store.etapes()).not.toContain('materiel');
            lancer();
            const requete = vi.mocked(service.telechargerRapportPdf).mock.lastCall![0];
            expect(requete.equipesParChantier).toBeNull();
            expect(requete.regroupementsEquipesParChantier).toEqual({ C168: [['Chauffeurs', 'Opérateurs']] });
        });

        it('n’existe pas en Excel et change de mois sans réunion', () => {
            store.suivant();
            store.toutTraiter(CHANTIERS[0], 'reunie');
            store.choisirFormat('EXCEL');
            expect(store.equipesReunies(CHANTIERS[0])).toEqual([]);
            expect(store.traitement('C168', 'Chauffeurs')).toBe('liste');

            store.choisirFormat('PDF');
            expect(store.equipesReunies(CHANTIERS[0])).toEqual(['Chauffeurs', 'Opérateurs']);
            store.choisirPeriode('2026-08');
            expect(store.traitements()).toEqual({});
        });
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
            store.choisirTraitement('C168', 'Chauffeurs', 'separee');
            store.choisirTraitement('C196', 'Chauffeurs', 'separee');
            expect(store.etapes()).toContain('materiel');

            store.choisirMarches(['C196']);

            expect(store.equipesSeparees(CHANTIERS[0])).toEqual(['Chauffeurs']);
            expect(store.equipesSeparees(CHANTIERS[1])).toEqual(['Chauffeurs']);
            expect(store.chantiersAvecEquipes().map((c) => c.code)).toEqual(['C196']);
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
