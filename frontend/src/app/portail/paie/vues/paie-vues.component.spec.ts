import type { MockedObject } from "vitest";
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NotificationService } from '@shared/feedback/feedback.service';
import { of } from 'rxjs';

import { AUCUN_FILTRE } from '../filtres/paie-filtres';
import { PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieVuesComponent } from './paie-vues.component';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager,
    template: 'vue' })
class VueFactice {
}

const PERIODES: PaiePeriodeResume[] = [
    { periode: '2026-08', nombreBulletins: 10, nombreChantiers: 2, masse: 40000, stc: 1, stcMontant: 4000 },
    { periode: '2026-07', nombreBulletins: 8, nombreChantiers: 2, masse: 32000, stc: 0, stcMontant: 0 }
];

describe('PaieVuesComponent', () => {
    let service: MockedObject<PaieService>;
    let harness: RouterTestingHarness;

    beforeEach(async () => {
        service = {
            listerPeriodes: vi.fn().mockName("PaieService.listerPeriodes"),
            rechercherChantiers: vi.fn().mockName("PaieService.rechercherChantiers")
        } as unknown as MockedObject<PaieService>;
        service.listerPeriodes.mockReturnValue(of(PERIODES));
        service.rechercherChantiers.mockReturnValue(of([]));

        TestBed.configureTestingModule({
            imports: [],
            providers: [
                provideRouter([
                    {
                        path: 'paie',
                        component: PaieVuesComponent,
                        children: [
                            { path: '', component: VueFactice, data: { vue: 'tabulaire' } },
                            { path: 'cartes', component: VueFactice, data: { vue: 'cartes' } },
                            { path: 'analytique', component: VueFactice, data: { vue: 'analytique' } }
                        ]
                    }
                ]),
                provideHttpClient(withXhr()),
                provideHttpClientTesting(),
                NotificationService,
                { provide: PaieService, useValue: service }
            ]
        });
        harness = await RouterTestingHarness.create();
    });

    it('lit les filtres dans l\'URL et charge les mois disponibles pour la barre', async () => {
        const composant = await harness.navigateByUrl('/paie/cartes?periode=2026-07&nom=ali&chantierIds=3', PaieVuesComponent);

        expect(composant['filtres']()).toEqual({ ...AUCUN_FILTRE, periode: '2026-07', nomPrenom: 'ali', chantierIds: [3] });
        expect(composant['periodes']()).toEqual(['2026-08', '2026-07']);
    });

    it('écrit les filtres de la barre dans l\'URL de la vue courante, sans en changer', async () => {
        const composant = await harness.navigateByUrl('/paie/cartes?periode=2026-07', PaieVuesComponent);

        composant['appliquer']({ ...AUCUN_FILTRE, periode: '2026-08', cin: 'AB1', equipeIds: [2, 5] });
        await harness.fixture.whenStable();

        const url = TestBed.inject(Router).url;
        expect(url.startsWith('/paie/cartes?')).toBe(true);
        expect(url).toContain('periode=2026-08');
        expect(url).toContain('cin=AB1');
        expect(url).toContain('equipeIds=2,5');
    });

    it('retire de l\'URL un filtre vidé', async () => {
        const composant = await harness.navigateByUrl('/paie?cin=AB1&periode=2026-08', PaieVuesComponent);

        composant['appliquer']({ ...AUCUN_FILTRE, periode: '2026-08' });
        await harness.fixture.whenStable();

        expect(TestBed.inject(Router).url).toBe('/paie?periode=2026-08');
    });

    it('recharge les mois à chaque changement de vue', async () => {
        await harness.navigateByUrl('/paie', PaieVuesComponent);
        const appels = vi.mocked(service.listerPeriodes).mock.calls.length;

        await harness.navigateByUrl('/paie/cartes', PaieVuesComponent);

        expect(vi.mocked(service.listerPeriodes).mock.calls.length).toBeGreaterThan(appels);
    });

    it('rend le mois indispensable en analytique seulement', async () => {
        const composant = await harness.navigateByUrl('/paie', PaieVuesComponent);
        expect(composant['moisRequis']()).toBe(false);

        await harness.navigateByUrl('/paie/analytique', PaieVuesComponent);
        expect(composant['moisRequis']()).toBe(true);
    });

    it('ajoute le fil de navigation à la barre dans les cartes seulement', async () => {
        const composant = await harness.navigateByUrl('/paie', PaieVuesComponent);
        expect(composant['cartes']()).toBe(false);

        await harness.navigateByUrl('/paie/cartes', PaieVuesComponent);
        expect(composant['cartes']()).toBe(true);
    });

    it("porte les actions dans l'en-tête, avec le titre et les onglets, dans chaque vue", async () => {
        for (const url of ['/paie', '/paie/cartes', '/paie/analytique']) {
            await harness.navigateByUrl(url, PaieVuesComponent);

            const entete = (harness.routeNativeElement as HTMLElement).querySelector('.paie-vues__header');
            expect(entete?.querySelector('app-paie-actions'), url).not.toBeNull();
            expect(entete?.querySelector('app-vue-switcher'), url).not.toBeNull();
        }
    });

    it('recrée la vue affichée après un import, et recharge les mois', async () => {
        const composant = await harness.navigateByUrl('/paie', PaieVuesComponent);
        const appels = vi.mocked(service.listerPeriodes).mock.calls.length;

        composant['rafraichirVue']();
        expect(composant['vueAffichee']()).toBe(false);
        harness.fixture.detectChanges();
        expect(harness.routeNativeElement?.querySelector('router-outlet')).toBeNull();
        await new Promise((resolve) => setTimeout(resolve, 10));
        harness.fixture.detectChanges();

        expect(composant['vueAffichee']()).toBe(true);
        expect(vi.mocked(service.listerPeriodes).mock.calls.length).toBeGreaterThan(appels);
    });

    it('conserve les filtres quand on change de vue par le sélecteur', async () => {
        const composant = await harness.navigateByUrl('/paie?periode=2026-08&nom=ali&chantierIds=3', PaieVuesComponent);

        const lienCartes = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a'))
            .find((lien) => lien.textContent?.includes('Cartes'));
        expect(lienCartes).not.toBeUndefined();
        lienCartes?.click();
        await harness.fixture.whenStable();

        const url = TestBed.inject(Router).url;
        expect(url).toContain('/paie/cartes?');
        expect(url).toContain('periode=2026-08');
        expect(url).toContain('nom=ali');
        expect(url).toContain('chantierIds=3');
        expect(composant['filtres']()).toEqual(expect.objectContaining({ periode: '2026-08', nomPrenom: 'ali', chantierIds: [3] }));
    });
});
