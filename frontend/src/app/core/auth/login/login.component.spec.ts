import type { MockedObject } from "vitest";
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { AuthService } from '../services/auth.service';
import { LoginResponse } from '../models/auth.model';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
    let fixture: ComponentFixture<LoginComponent>;
    let component: LoginComponent;
    let auth: MockedObject<AuthService>;
    let router: MockedObject<Router>;

    beforeEach(async () => {
        auth = {
            login: vi.fn().mockName("AuthService.login"),
            isAuthenticated: signal(false)
        } as unknown as MockedObject<AuthService>;
        router = {
            navigateByUrl: vi.fn().mockName("Router.navigateByUrl")
        } as unknown as MockedObject<Router>;

        await TestBed.configureTestingModule({
            imports: [LoginComponent],
            providers: [
                provideHttpClient(),
                { provide: AuthService, useValue: auth },
                { provide: Router, useValue: router },
                {
                    provide: ActivatedRoute,
                    useValue: { snapshot: { queryParamMap: { get: () => '/paie' } } }
                }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(LoginComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('affiche les erreurs de validation sans appeler l’API', async () => {
        soumettre(fixture.nativeElement);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(auth.login).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent).toContain('Champ obligatoire.');
    });

    it('bascule la visibilité du mot de passe sans perdre sa valeur', () => {
        const input = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
        input.value = 'secret';
        input.dispatchEvent(new Event('input'));
        fixture.nativeElement.querySelector('.auth-card__password-toggle').click();
        fixture.detectChanges();

        expect(input.type).toBe('text');
        expect(input.value).toBe('secret');
        expect(fixture.nativeElement.querySelector('.auth-card__password-toggle').getAttribute('aria-pressed')).toBe('true');
    });

    it('navigue vers la destination demandée après authentification', async () => {
        auth.login.mockReturnValue(of({} as LoginResponse));
        saisir(fixture.nativeElement, '#username', 'agent');
        saisir(fixture.nativeElement, '#password', 'secret');
        soumettre(fixture.nativeElement);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(auth.login).toHaveBeenCalledWith('agent', 'secret');
        expect(router.navigateByUrl).toHaveBeenCalledWith('/paie');
        expect(component.form().submitting()).toBe(false);
    });

    it('annonce des identifiants invalides après une réponse 401', async () => {
        auth.login.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
        saisir(fixture.nativeElement, '#username', 'agent');
        saisir(fixture.nativeElement, '#password', 'incorrect');
        soumettre(fixture.nativeElement);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.errorMessage()).toBe('Identifiants invalides.');
        expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Identifiants invalides.');
    });
});
