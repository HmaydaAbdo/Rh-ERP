import type { MockedObject } from "vitest";
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@shared/feedback/feedback.service';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
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
