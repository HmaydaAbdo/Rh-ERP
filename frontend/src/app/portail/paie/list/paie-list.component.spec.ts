import type { MockedObject } from "vitest";
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotificationService } from '@shared/feedback/feedback.service';
import { of } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieListComponent } from './paie-list.component';

describe('PaieListComponent — filtres de la barre commune', () => {
    let service: MockedObject<PaieService>;
    let harness: RouterTestingHarness;

    beforeEach(async () => {
        service = {
            search: vi.fn().mockName("PaieService.search")
        } as unknown as MockedObject<PaieService>;
        service.search.mockReturnValue(of({ content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } } as Page<Paie>));

        TestBed.configureTestingModule({
            providers: [
                provideRouter([{ path: 'paie', component: PaieListComponent }]),
                provideHttpClient(withXhr()),
                provideHttpClientTesting(),
                NotificationService,
                { provide: PaieService, useValue: service }
            ]
        });
        harness = await RouterTestingHarness.create();
    });

    it('ne filtre rien quand l\'URL n\'a pas de paramètre', async () => {
        const composant = await harness.navigateByUrl('/paie', PaieListComponent);

        expect(composant['columns'].all.map((column) => column.header)).toEqual([
            'Nom & prénom', 'Fonction', 'CIN', 'Nombre de jours travaillés', 'Jours de récupération ouvrables',
            'Jours de récupération du dimanche', 'Salaire mensuel', 'Prime de roulage ordinaire',
            'Prime de roulage du dimanche', 'Salaire total', 'Observation', 'Chantier',
            'Désignation du chantier', 'Équipe', 'Libellé de l’équipe', 'Période'
        ]);
        expect(composant['columns'].all.map((column) => column.shortHeader ?? column.header)).toEqual([
            'Nom & prénom', 'Fonction', 'CIN', 'Jours trav.', 'J.R.O', 'J.R.D', 'Salaire', 'Prime RO',
            'Prime RD', 'Total', 'Obs', 'Chantier', 'Désign. chantier', 'Équipe', 'Libellé équipe', 'Période'
        ]);
        expect(harness.routeNativeElement?.querySelector('app-collection-table stp-table')).not.toBeNull();

        expect(service.search).toHaveBeenCalledTimes(1);
        expect(vi.mocked(service.search).mock.lastCall![0]).toEqual({
            nomPrenom: undefined,
            cin: undefined,
            periode: undefined,
            fonctionIds: undefined,
            chantierIds: undefined,
            equipeIds: undefined
        });
    });

    it('applique tous les filtres de l\'URL à la première recherche', async () => {
        await harness.navigateByUrl('/paie?periode=2026-08&nom=ali&cin=AB1&chantierIds=3&fonctionIds=5,6&equipeIds=7,8', PaieListComponent);

        expect(service.search).toHaveBeenCalledTimes(1);
        expect(vi.mocked(service.search).mock.lastCall![0]).toEqual({
            nomPrenom: 'ali',
            cin: 'AB1',
            periode: '2026-08',
            fonctionIds: [5, 6],
            chantierIds: [3],
            equipeIds: [7, 8]
        });
    });

    it('ignore les valeurs invalides de l\'URL', async () => {
        await harness.navigateByUrl('/paie?periode=2026-13&chantierIds=abc,-2&equipeIds=', PaieListComponent);

        expect(vi.mocked(service.search).mock.lastCall![0]).toEqual(expect.objectContaining({ periode: undefined, chantierIds: undefined, equipeIds: undefined }));
    });

    it('relance la recherche, première page, quand les filtres de l\'URL changent', async () => {
        const composant = await harness.navigateByUrl('/paie', PaieListComponent);
        composant['first'].set(30);

        await harness.navigateByUrl('/paie?cin=AB1', PaieListComponent);

        expect(service.search).toHaveBeenCalledTimes(2);
        expect(vi.mocked(service.search).mock.lastCall![0]).toEqual(expect.objectContaining({ cin: 'AB1' }));
        expect(vi.mocked(service.search).mock.lastCall![1].page).toBe(0);
        expect(composant['first']()).toBe(0);
    });

    it('ne relance rien quand l\'URL change sans changer les filtres', async () => {
        await harness.navigateByUrl('/paie?cin=AB1', PaieListComponent);

        await harness.navigateByUrl('/paie?cin=AB1#haut', PaieListComponent);

        expect(service.search).toHaveBeenCalledTimes(1);
    });
});
