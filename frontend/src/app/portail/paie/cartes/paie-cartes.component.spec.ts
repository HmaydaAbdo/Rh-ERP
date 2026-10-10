import type { MockedObject } from "vitest";
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotificationService } from '@shared/feedback/feedback.service';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';

import { PaieChantierPeriode, PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieCartesComponent } from './paie-cartes.component';

const PERIODES: PaiePeriodeResume[] = [
    { periode: '2026-09', nombreBulletins: 975, nombreChantiers: 25, masse: 4500000, stc: 41 },
    { periode: '2026-08', nombreBulletins: 969, nombreChantiers: 25, masse: 4000000, stc: 0 },
    { periode: '2026-06', nombreBulletins: 900, nombreChantiers: 24, masse: 3900000, stc: 5 }
];
const CHANTIERS: PaieChantierPeriode[] = [
    {
        id: 1,
        code: 'C168',
        libelle: 'Nador',
        effectif: 148,
        masse: 720000,
        equipes: [
            { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 74, masse: 400000 },
            { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 69, masse: 300000 }
        ]
    },
    { id: 2, code: 'C196', libelle: null, effectif: 10, masse: 80000, equipes: [] }
];

describe('PaieCartesComponent', () => {
    let service: MockedObject<PaieService>;
    let messages: MockedObject<NotificationService>;
    let harness: RouterTestingHarness;
    let autorise: (permission: string) => boolean;

    async function ouvrir(url: string): Promise<PaieCartesComponent> {
        harness ??= await RouterTestingHarness.create();
        return harness.navigateByUrl(url, PaieCartesComponent);
    }

    beforeEach(() => {
        harness = undefined as unknown as RouterTestingHarness;
        autorise = () => true;
        service = {
            rechercherPeriodes: vi.fn().mockName("PaieService.rechercherPeriodes"),
            rechercherChantiers: vi.fn().mockName("PaieService.rechercherChantiers"),
            supprimerGroupe: vi.fn().mockName("PaieService.supprimerGroupe")
        } as unknown as MockedObject<PaieService>;
        messages = {
            add: vi.fn().mockName("NotificationService.add")
        } as unknown as MockedObject<NotificationService>;
        service.rechercherPeriodes.mockReturnValue(of(PERIODES));
        service.rechercherChantiers.mockReturnValue(of(CHANTIERS));
        service.supprimerGroupe.mockReturnValue(of({ supprimes: 0 }));

        TestBed.configureTestingModule({
            providers: [
                provideRouter([{ path: 'paie/cartes', component: PaieCartesComponent }]),
                { provide: PaieService, useValue: service },
                { provide: NotificationService, useValue: messages },
                { provide: AuthService, useValue: { hasPermission: (permission: string) => autorise(permission) } }
            ]
        });
    });

    it('déduit le niveau des filtres : sans mois, les mois ; avec un mois, les chantiers ; avec un seul chantier, ses équipes', async () => {
        const composant = await ouvrir('/paie/cartes');
        expect(composant.niveau()).toBe(1);

        await ouvrir('/paie/cartes?periode=2026-08');
        expect(composant.niveau()).toBe(2);

        await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1,2');
        expect(composant.niveau()).toBe(2);

        await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
        expect(composant.niveau()).toBe(3);
    });

    it("ne propose la suppression en groupe qu'avec PAIE_PURGE : PAIE_DELETE (un bulletin) ne suffit pas", async () => {
        autorise = (permission) => permission === 'PAIE_DELETE';
        const composant = await ouvrir('/paie/cartes');
        expect(composant.canPurge()).toBe(false);

        autorise = (permission) => permission === 'PAIE_PURGE';
        expect(composant.canPurge()).toBe(true);
    });

    it('affiche les mois au niveau 1 sans charger de chantiers', async () => {
        const composant = await ouvrir('/paie/cartes');

        expect(composant.cartesMois().map((c) => c.resume.periode)).toEqual(['2026-09', '2026-08', '2026-06']);
        expect(service.rechercherChantiers).not.toHaveBeenCalled();
    });

    it('transmet les filtres de l\'URL à chaque niveau, sans le mois au niveau des mois', async () => {
        await ouvrir('/paie/cartes?periode=2026-08&nom=ali&cin=AB1&fonctionIds=5&equipeIds=2');
        expect(service.rechercherChantiers).toHaveBeenCalledTimes(1);
        expect(service.rechercherChantiers).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08', nomPrenom: 'ali', cin: 'AB1', fonctionIds: [5], equipeIds: [2] }));

        await ouvrir('/paie/cartes?nom=ali&periode=');
        expect(service.rechercherPeriodes).toHaveBeenCalledTimes(1);
        expect(service.rechercherPeriodes).toHaveBeenCalledWith(expect.objectContaining({ nomPrenom: 'ali', periode: undefined }));
    });

    it('compare la masse au mois contigu, et seulement à lui', async () => {
        const composant = await ouvrir('/paie/cartes');

        const [septembre, aout, juin] = composant.cartesMois();
        expect(septembre.variation).toBeCloseTo(12.5);
        // Mai n'a pas de paie : juin n'est comparé à rien, jamais à un mois plus ancien.
        expect(aout.variation).toBeNull();
        expect(juin.variation).toBeNull();
    });

    it('résume le mois et calcule la part de chaque chantier à partir des chantiers filtrés', async () => {
        const composant = await ouvrir('/paie/cartes?periode=2026-08');

        expect(composant.resumeMois()).toEqual({ masse: 800000, bulletins: 158, chantiers: 2 });
        expect(composant.cartesChantier().map((c) => c.chantier.code)).toEqual(['C168', 'C196']);
        expect(composant.cartesChantier()[0].part).toBeCloseTo(90);
    });

    it('ajoute une ligne « Sans équipe » pour que le total égale celui du chantier', async () => {
        const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');

        const lignes = composant.lignesEquipes();
        expect(lignes.map((l) => l.code)).toEqual(['CH', 'OP', '-']);
        expect(lignes[2]).toEqual(expect.objectContaining({ equipeId: null, libelle: 'Sans équipe', effectif: 5, masse: 20000 }));
        expect(composant.effectifTotalEquipes()).toBe(148);
        expect(composant.masseTotaleEquipes()).toBe(720000);
    });

    it('n\'ajoute pas de ligne « Sans équipe » quand toutes les personnes ont une équipe', async () => {
        service.rechercherChantiers.mockReturnValue(of([{ ...CHANTIERS[0], effectif: 143, masse: 700000 }]));

        const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');

        expect(composant.lignesEquipes().map((l) => l.code)).toEqual(['CH', 'OP']);
    });

    it('ouvre la vue tabulaire avec les filtres en cours plus l\'équipe cliquée', async () => {
        const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
        const navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

        composant.ouvrirBulletins(composant.lignesEquipes()[1]);

        expect(navigation).toHaveBeenCalledTimes(1);

        expect(navigation).toHaveBeenCalledWith(['/paie'], { queryParams: { equipeIds: '2' }, queryParamsHandling: 'merge' });
    });

    it('n\'ouvre rien pour les bulletins sans équipe, que l\'API ne sait pas filtrer', async () => {
        const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
        const navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

        composant.ouvrirBulletins(composant.lignesEquipes()[2]);

        expect(navigation).not.toHaveBeenCalled();
    });

    it('ne rappelle pas le backend pour des filtres déjà chargés', async () => {
        await ouvrir('/paie/cartes?periode=2026-08');
        await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
        await ouvrir('/paie/cartes?periode=2026-08');

        expect(service.rechercherChantiers).toHaveBeenCalledTimes(2);
    });

    it('signale l\'absence de résultat à chaque niveau', async () => {
        service.rechercherPeriodes.mockReturnValue(of([]));
        service.rechercherChantiers.mockReturnValue(of([]));

        const composant = await ouvrir('/paie/cartes?nom=zzz');
        expect(composant.aucunResultat()).toBe(true);

        await ouvrir('/paie/cartes?periode=2026-08&nom=zzz');
        expect(composant.aucunResultat()).toBe(true);
    });

    it('signale un chantier absent du mois avec ces filtres', async () => {
        const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=999');

        expect(composant.chantierIntrouvable()).toBe(true);
        expect(composant.aucunResultat()).toBe(false);
    });

    it('retient le sens de la descente pour orienter l\'animation entre niveaux', async () => {
        const composant = await ouvrir('/paie/cartes');
        await ouvrir('/paie/cartes?periode=2026-08');
        expect(composant.sens()).toBe('avant');

        await ouvrir('/paie/cartes');
        expect(composant.sens()).toBe('arriere');
    });

    describe('suppression en groupe', () => {
        it('vise les bulletins du mois que comptait la carte, avec les filtres de la barre sauf le mois', async () => {
            const composant = await ouvrir('/paie/cartes?nom=ali&fonctionIds=5');

            composant.demanderSuppressionMois(composant.cartesMois()[1]);

            const suppression = composant.suppression();
            expect(suppression?.nombre).toBe(969);
            expect(suppression?.criteres).toEqual(expect.objectContaining({ periode: '2026-08', nomPrenom: 'ali', fonctionIds: [5] }));
            expect(suppression?.cible).toContain('août 2026');
            expect(suppression?.filtres).toEqual(['Nom et prénom contient « ali »', '1 fonction(s) sélectionnée(s)']);
        });

        it('vise le chantier de la carte, en remplaçant un éventuel filtre chantier', async () => {
            const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1,2');

            composant.demanderSuppressionChantier(composant.chantiers()[1]);

            expect(composant.suppression()?.criteres).toEqual(expect.objectContaining({ periode: '2026-08', chantierIds: [2] }));
            expect(composant.suppression()?.nombre).toBe(10);
            expect(composant.suppression()?.remonterApres).toBe(false);
        });

        it('vise l\'équipe de la ligne, et ignore les bulletins sans équipe', async () => {
            const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');

            composant.demanderSuppressionEquipe(composant.lignesEquipes()[2]);
            expect(composant.suppression()).toBeNull();

            composant.demanderSuppressionEquipe(composant.lignesEquipes()[1]);
            expect(composant.suppression()?.criteres).toEqual(expect.objectContaining({ chantierIds: [1], equipeIds: [2] }));
            expect(composant.suppression()?.nombre).toBe(69);
        });

        it('n\'active la suppression qu\'une fois le nombre retapé à l\'identique', async () => {
            const composant = await ouvrir('/paie/cartes');
            composant.demanderSuppressionMois(composant.cartesMois()[1]);
            expect(composant.confirmationValide()).toBe(false);

            composant.confirmation.setValue('96');
            expect(composant.confirmationValide()).toBe(false);

            composant.confirmation.setValue(' 969 ');
            expect(composant.confirmationValide()).toBe(true);
        });

        it('ne supprime rien tant que la confirmation n\'est pas valide', async () => {
            const composant = await ouvrir('/paie/cartes');
            composant.demanderSuppressionMois(composant.cartesMois()[1]);

            composant.confirmerSuppression();

            expect(service.supprimerGroupe).not.toHaveBeenCalled();
        });

        it('supprime avec le nombre confirmé, annonce le résultat, puis recharge sans réponse gardée', async () => {
            service.supprimerGroupe.mockReturnValue(of({ supprimes: 969 }));
            const composant = await ouvrir('/paie/cartes');
            composant.demanderSuppressionMois(composant.cartesMois()[1]);
            composant.confirmation.setValue('969');
            service.rechercherPeriodes.mockClear();

            composant.confirmerSuppression();

            expect(service.supprimerGroupe).toHaveBeenCalledTimes(1);

            expect(service.supprimerGroupe).toHaveBeenCalledWith({
                criteres: expect.objectContaining({ periode: '2026-08' }),
                nombreAttendu: 969
            });
            expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
            expect(composant.suppression()).toBeNull();
            // Les mois sont rechargés : la réponse gardée datait d'avant la suppression.
            expect(service.rechercherPeriodes).toHaveBeenCalledTimes(1);
        });

        it('remonte aux chantiers quand le chantier ouvert vient d\'être supprimé', async () => {
            service.supprimerGroupe.mockReturnValue(of({ supprimes: 148 }));
            const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
            composant.demanderSuppressionChantier(composant.chantier()!);
            composant.confirmation.setValue('148');

            composant.confirmerSuppression();
            await harness.fixture.whenStable();

            expect(TestBed.inject(Router).url).not.toContain('chantierIds');
            expect(composant.niveau()).toBe(2);
        });

        it('annule sans rien supprimer', async () => {
            const composant = await ouvrir('/paie/cartes');
            composant.demanderSuppressionMois(composant.cartesMois()[1]);

            composant.annulerSuppression();

            expect(composant.suppression()).toBeNull();
            expect(composant.confirmation.value).toBe('');
            expect(service.supprimerGroupe).not.toHaveBeenCalled();
        });
    });
});
