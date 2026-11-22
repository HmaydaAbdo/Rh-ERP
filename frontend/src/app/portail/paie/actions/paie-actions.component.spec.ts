import type { MockedObject } from "vitest";
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@shared/ui/feedback/feedback.service';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { PaieActualisationService } from '../services/paie-actualisation.service';
import { PaieService } from '../services/paie.service';
import { PaieActionsComponent } from './paie-actions.component';

describe('PaieActionsComponent', () => {
    let service: MockedObject<PaieService>;
    let permissions: string[];
    let fixture!: ComponentFixture<PaieActionsComponent>;

    function boutons(): string[] {
        return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.app-page__actions button')).map((b) => (b.textContent ?? '').trim());
    }

    async function creer(droits: string[]): Promise<PaieActionsComponent> {
        permissions = droits;
        fixture = TestBed.createComponent(PaieActionsComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        return fixture.componentInstance;
    }

    beforeEach(() => {
        service = {
            telechargerModele: vi.fn().mockName("PaieService.telechargerModele"),
            listerPeriodes: vi.fn().mockName("PaieService.listerPeriodes"),
            rechercherChantiers: vi.fn().mockName("PaieService.rechercherChantiers")
        } as unknown as MockedObject<PaieService>;
        service.listerPeriodes.mockReturnValue(of([]));
        service.rechercherChantiers.mockReturnValue(of([]));

        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                provideHttpClient(withXhr()),
                provideHttpClientTesting(),
                NotificationService,
                { provide: PaieService, useValue: service },
                { provide: AuthService, useValue: { hasPermission: (code: string) => permissions.includes(code) } }
            ]
        });
    });

    it('montre chaque bouton avec sa permission seulement', async () => {
        await creer(['PAIE_EXPORT']);
        expect(boutons()).toEqual(['Exporter']);

        fixture.destroy();
        await creer(['PAIE_EXPORT', 'PAIE_WRITE']);
        expect(boutons()).not.toContain('Nouveau bulletin');

        fixture.destroy();
        await creer(['PAIE_EXPORT', 'PAIE_IMPORT', 'PAIE_READ', 'PAIE_WRITE', 'EMPLOYEE_WRITE']);
        const libelles = boutons();
        expect(libelles).toContain('Exporter');
        expect(libelles).toContain('Importer');
        expect(libelles).toContain('Nouveau bulletin');
    });

    it('dans la conversation, « Nouveau bulletin » demande le formulaire en fenêtre au lieu de naviguer (KAN-310)', async () => {
        await creer(['PAIE_EXPORT', 'PAIE_IMPORT', 'PAIE_READ', 'PAIE_WRITE', 'EMPLOYEE_WRITE']);
        fixture.componentRef.setInput('integree', true);
        fixture.detectChanges();

        const libelles = boutons();
        expect(libelles).toContain('Exporter');
        expect(libelles).toContain('Importer');
        expect(libelles).toContain('Nouveau bulletin');
        const nouveau = vi.fn();
        fixture.componentInstance.nouveau.subscribe(nouveau);
        const bouton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.app-page__actions button')).find((b) => b.textContent?.trim() === 'Nouveau bulletin')!;
        bouton.click();

        expect(nouveau).toHaveBeenCalledOnce();
        expect((fixture.nativeElement as HTMLElement).querySelector('a[routerLink], [ng-reflect-router-link]')).toBeNull();
    });

    it('un import réussi prévient la page et lève le signal d’actualisation des vues de la conversation', async () => {
        const composant = await creer(['PAIE_IMPORT', 'PAIE_READ']);
        const actualisation = TestBed.inject(PaieActualisationService);
        const importe = vi.fn();
        composant.importe.subscribe(importe);

        composant['surImport']();

        expect(importe).toHaveBeenCalledOnce();
        expect(actualisation.version()).toBe(1);
    });

    it('ne montre aucun bouton sans permission', async () => {
        await creer(['PAIE_READ']);

        expect(boutons()).toEqual([]);
    });

    it('« Importer » demande aussi la lecture de la paie, et ouvre l’assistant', async () => {
        await creer(['PAIE_IMPORT']);
        expect(boutons()).not.toContain('Importer');

        fixture.destroy();
        const composant = await creer(['PAIE_IMPORT', 'PAIE_READ']);
        fixture.componentRef.setInput('periodes', ['2026-09', '2026-08']);
        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('stp-split-button button')!.click();
        fixture.detectChanges();

        expect(composant['showImportDialog']()).toBe(true);
    });
});
