import type { MockedObject } from "vitest";
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { PolitiqueMotDePasseService } from '../../../shared/validators/politique-mot-de-passe.service';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
    let fixture: ComponentFixture<ResetPasswordComponent>;
    let component: ResetPasswordComponent;
    let recovery: MockedObject<PasswordRecoveryService>;
    let router: MockedObject<Router>;

    async function createComponent(token: string | null): Promise<void> {
        recovery = {
            resetPassword: vi.fn().mockName("PasswordRecoveryService.resetPassword")
        } as unknown as MockedObject<PasswordRecoveryService>;
        router = {
            navigate: vi.fn().mockName("Router.navigate")
        } as unknown as MockedObject<Router>;

        await TestBed.configureTestingModule({
            imports: [ResetPasswordComponent],
            providers: [
                provideRouter([]),
                { provide: PasswordRecoveryService, useValue: recovery },
                { provide: PolitiqueMotDePasseService, useValue: { longueurMinimale: () => 10, regle: () => '10 caractères minimum, différent de l’identifiant.' } },
                { provide: Router, useValue: router },
                { provide: ActivatedRoute, useValue: { snapshot: { fragment: token ? `token=${token}` : null } } }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(ResetPasswordComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }

    it('refuse un lien sans jeton', async () => {
        await createComponent(null);

        expect(component.errorMessage()).toBe('Lien invalide : jeton manquant.');
        expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    });

    it('lit le jeton du fragment puis le retire de l’URL affichée', async () => {
        window.history.replaceState(null, '', '/reset-password#token=reset-token');
        await createComponent('reset-token');

        expect(component.token()).toBe('reset-token');
        expect(window.location.hash).toBe('');
    });

    it('applique le changement puis retourne à la connexion', async () => {
        await createComponent('reset-token');
        recovery.resetPassword.mockReturnValue(of(undefined));
        saisir(fixture.nativeElement, '#nouveauMotDePasse', 'motdepasse123');
        soumettre(fixture.nativeElement);
        await fixture.whenStable();

        expect(recovery.resetPassword).toHaveBeenCalledWith('reset-token', 'motdepasse123');
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('annonce au formulaire un jeton expiré ou déjà utilisé', async () => {
        await createComponent('stale-token');
        recovery.resetPassword.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
        saisir(fixture.nativeElement, '#nouveauMotDePasse', 'motdepasse123');
        soumettre(fixture.nativeElement);
        await fixture.whenStable();

        expect(component.errorMessage()).toBe('Ce lien est invalide, expiré ou déjà utilisé.');
    });
});
