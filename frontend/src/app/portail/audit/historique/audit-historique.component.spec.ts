import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { AuditVersion } from '../models/audit.model';
import { AuditService } from '../services/audit.service';
import { AuditHistoriqueComponent } from './audit-historique.component';

function version(revision: number, operation: AuditVersion['operation']): AuditVersion {
    return {
        revision,
        horodatage: '2026-10-04T20:00:00Z',
        utilisateurId: 1,
        utilisateurNom: 'alice',
        origine: 'API',
        requestId: null,
        operation,
        champs: [{ champ: 'salaireTotal', avant: '1', apres: '2', ajoutes: null, retires: null }]
    };
}

function page(content: AuditVersion[], total: number, numero: number): Page<AuditVersion> {
    return { content, page: { totalElements: total, totalPages: 2, number: numero, size: 10 } };
}

describe('AuditHistoriqueComponent', () => {
    let service: MockedObject<AuditService>;
    let fixture: ComponentFixture<AuditHistoriqueComponent>;

    beforeEach(() => {
        service = {
            historique: vi.fn().mockName("AuditService.historique")
        } as unknown as MockedObject<AuditService>;
        TestBed.configureTestingModule({
            imports: [AuditHistoriqueComponent],
            providers: [{ provide: AuditService, useValue: service }]
        });
        fixture = TestBed.createComponent(AuditHistoriqueComponent);
        fixture.componentRef.setInput('entite', 'Paie');
        fixture.componentRef.setInput('id', 42);
    });

    it('charge les versions de l’enregistrement et les affiche de la plus récente à la plus ancienne', () => {
        service.historique.mockReturnValue(of(page([version(9, 'MODIFICATION'), version(3, 'AJOUT')], 2, 0)));

        fixture.detectChanges();

        expect(service.historique).toHaveBeenCalledTimes(1);

        expect(service.historique).toHaveBeenCalledWith('Paie', 42, { page: 0, size: 10 });
        const entetes = Array.from(fixture.nativeElement.querySelectorAll('.audit-historique__entete strong')).map((e) => (e as HTMLElement).textContent);
        expect(entetes).toEqual(['Modification', 'Ajout']);
        expect(fixture.nativeElement.textContent).toContain('par alice');
    });

    it('propose les versions plus anciennes tant qu’il en reste, et les ajoute à la suite', () => {
        service.historique.mockReturnValueOnce(of(page([version(9, 'MODIFICATION')], 2, 0))).mockReturnValueOnce(of(page([version(3, 'AJOUT')], 2, 1)));
        fixture.detectChanges();
        expect(fixture.componentInstance['resteAcharger']()).toBe(true);

        fixture.componentInstance['plus']();
        fixture.detectChanges();

        expect(vi.mocked(service.historique).mock.lastCall![2]).toEqual({ page: 1, size: 10 });
        expect(fixture.componentInstance['versions']().length).toBe(2);
        expect(fixture.componentInstance['resteAcharger']()).toBe(false);
    });

    it('dit qu’aucune version n’est enregistrée quand l’historique est vide', () => {
        service.historique.mockReturnValue(of(page([], 0, 0)));

        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Aucune version enregistrée');
    });

    it('reprend la page en échec sans sauter de versions ni effacer celles déjà affichées', () => {
        service.historique.mockReturnValueOnce(of(page([version(9, 'MODIFICATION')], 2, 0)))
            .mockReturnValueOnce(throwError(() => new Error('page indisponible')))
            .mockReturnValueOnce(of(page([version(3, 'AJOUT')], 2, 1)));
        fixture.detectChanges();
        fixture.componentInstance['plus']();
        fixture.detectChanges();

        expect(fixture.componentInstance['versions']()).toHaveLength(1);
        expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger');

        fixture.componentInstance['reessayer']();
        fixture.detectChanges();

        expect(service.historique).toHaveBeenLastCalledWith('Paie', 42, { page: 1, size: 10 });
        expect(fixture.componentInstance['versions']().map((v) => v.revision)).toEqual([9, 3]);
    });

    it('recharge l’historique lorsque l’enregistrement consulté change', () => {
        service.historique.mockReturnValue(of(page([version(9, 'MODIFICATION')], 1, 0)));
        fixture.detectChanges();

        service.historique.mockReturnValue(of(page([version(2, 'AJOUT')], 1, 0)));
        fixture.componentRef.setInput('id', 43);
        fixture.detectChanges();

        expect(service.historique).toHaveBeenLastCalledWith('Paie', 43, { page: 0, size: 10 });
        expect(fixture.componentInstance['versions']().map((v) => v.revision)).toEqual([2]);
    });
});
