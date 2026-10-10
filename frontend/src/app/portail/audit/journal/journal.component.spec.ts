import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { AuditChangement, AuditEntree, AuditLigne } from '../models/audit.model';
import { AuditService } from '../services/audit.service';
import { JournalComponent } from './journal.component';

const LIGNE: AuditLigne = {
    id: 5,
    horodatage: '2026-10-04T20:00:00Z',
    categorie: 'OPERATION',
    action: 'PAIE_SUPPRESSION_GROUPE',
    typeOperation: 'DELETE',
    resultat: 'SUCCES',
    utilisateurId: 1,
    utilisateurNom: 'alice',
    origine: 'API',
    entiteType: 'Paie',
    entiteId: null,
    nombreElements: 972,
    motif: null
};

const ENTREE: AuditEntree = {
    ...LIGNE,
    requestId: 'req-1',
    adresseIp: '10.0.0.7',
    userAgent: 'Firefox',
    perimetre: { periode: '2026-08', nombreConfirme: 972 },
    revisionId: 12
};

const CHANGEMENT: AuditChangement = {
    entiteType: 'Paie',
    entiteId: 7,
    libelle: null,
    operation: 'SUPPRESSION',
    champs: [{ champ: 'salaireTotal', avant: '3000.00', apres: null, ajoutes: null, retires: null }]
};

function page<T>(content: T[], total = content.length): Page<T> {
    return { content, page: { totalElements: total, totalPages: 1, number: 0, size: 10 } };
}

describe('JournalComponent', () => {
  afterEach(() => vi.useRealTimers());

    let service: MockedObject<AuditService>;
    let fixture: ComponentFixture<JournalComponent>;
    let composant: JournalComponent;

    beforeEach(() => {
        service = {
            search: vi.fn().mockName("AuditService.search"),
            getById: vi.fn().mockName("AuditService.getById"),
            details: vi.fn().mockName("AuditService.details")
        } as unknown as MockedObject<AuditService>;
        service.search.mockReturnValue(of(page([LIGNE], 1)));
        service.getById.mockReturnValue(of(ENTREE));
        service.details.mockReturnValue(of(page([CHANGEMENT])));
        TestBed.configureTestingModule({
            imports: [JournalComponent],
            providers: [{ provide: AuditService, useValue: service }]
        });
        fixture = TestBed.createComponent(JournalComponent);
        composant = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('charge la première page, de la plus récente à la plus ancienne', () => {
        composant['onLazyLoad']({ first: 0, rows: 10, sortField: null, sortOrder: 1 });

        expect(vi.mocked(service.search).mock.lastCall![1]).toEqual({ page: 0, size: 10, sort: 'horodatage,desc' });
        expect(Object.values(vi.mocked(service.search).mock.lastCall![0]).every((v) => v === undefined)).toBe(true);
        expect(composant['lignes']()).toEqual([LIGNE]);
        expect(composant['totalRecords']()).toBe(1);
    });

    it('cherche en temps réel après un court délai, sans bouton « Rechercher », en revenant à la première page', () => {
      vi.useFakeTimers();
        composant['onLazyLoad']({ first: 20, rows: 10, sortField: null, sortOrder: 1 });
        service.search.mockClear();

        composant['filterForm'].patchValue({ utilisateur: 'ali', categorie: 'SECURITE', action: 'ACCES_REFUSE' });
        vi.advanceTimersByTime(300);

        expect(service.search).toHaveBeenCalledTimes(1);
        expect(vi.mocked(service.search).mock.lastCall![0]).toEqual({
            dateDebut: undefined,
            dateFin: undefined,
            utilisateur: 'ali',
            categorie: 'SECURITE',
            action: 'ACCES_REFUSE',
            resultat: undefined,
            entiteType: undefined,
            requestId: undefined
        });
        expect(vi.mocked(service.search).mock.lastCall![1].page).toBe(0);
    });

    it('borne la recherche par date du premier instant du jour de début au dernier du jour de fin', () => {
      vi.useFakeTimers();
        composant['filterForm'].patchValue({ dateDebut: '2026-08-01', dateFin: '2026-08-31' });
        vi.advanceTimersByTime(300);

        const criteres = vi.mocked(service.search).mock.lastCall![0];
        expect(new Date(criteres.dateDebut as string).getTime()).toBe(new Date('2026-08-01T00:00:00').getTime());
        expect(new Date(criteres.dateFin as string).getTime()).toBe(new Date('2026-08-31T23:59:59.999').getTime());
    });

    it('ouvre une entrée avec son contexte, son périmètre et la première page de ses modifications', () => {
        composant['onOuvrir'](LIGNE);

        expect(service.getById).toHaveBeenCalledWith(5);
        expect(service.details).toHaveBeenCalledWith(5, { page: 0, size: 10 });
        expect(composant['panneauOuvert']()).toBe(true);
        expect(composant['entree']()?.adresseIp).toBe('10.0.0.7');
        expect(composant['perimetreEntrees']()).toEqual([
            ['periode', '2026-08'],
            ['nombreConfirme', '972']
        ]);
        expect(composant['changements']()).toEqual([CHANGEMENT]);
    });

    it('pagine les modifications d’une opération volumineuse', () => {
        service.details.mockReturnValue(of(page([CHANGEMENT], 25)));
        composant['onOuvrir'](LIGNE);

        expect(composant['nombrePagesChangements']()).toBe(3);
        composant['changementsSuivants']();

        expect(service.details).toHaveBeenCalledWith(5, { page: 1, size: 10 });
    });

    it('remplace les filtres par l’identifiant de requête pour relier les entrées d’une même action', () => {
        composant['filterForm'].patchValue({ utilisateur: 'ali' }, { emitEvent: false });

        composant['onVoirLaRequete']('req-1');

        expect(vi.mocked(service.search).mock.lastCall![0].requestId).toBe('req-1');
        expect(vi.mocked(service.search).mock.lastCall![0].utilisateur).toBeUndefined();
        expect(composant['panneauOuvert']()).toBe(false);
    });

    it('désigne la cible d’une ligne par son entité et son numéro', () => {
        expect(composant['cible']({ entiteType: 'Paie', entiteId: 7 })).toBe('Bulletin de paie n° 7');
        expect(composant['cible']({ entiteType: 'Paie', entiteId: null })).toBe('Bulletin de paie');
        expect(composant['cible']({ entiteType: null, entiteId: null })).toBe('');
    });
});
