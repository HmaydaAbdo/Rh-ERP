import type { MockedObject } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
    let fixture: ComponentFixture<ForgotPasswordComponent>;
    let component: ForgotPasswordComponent;
    let recovery: MockedObject<PasswordRecoveryService>;

    beforeEach(async () => {
        recovery = {
            requestReset: vi.fn().mockName("PasswordRecoveryService.requestReset")
        } as unknown as MockedObject<PasswordRecoveryService>;
        recovery.requestReset.mockReturnValue(of(undefined));

        await TestBed.configureTestingModule({
            imports: [ForgotPasswordComponent],
            providers: [provideRouter([]), { provide: PasswordRecoveryService, useValue: recovery }]
        }).compileComponents();

        fixture = TestBed.createComponent(ForgotPasswordComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('refuse une adresse invalide avant l’appel de service', async () => {
        saisir(fixture.nativeElement, '#email', 'pas-un-email');
        soumettre(fixture.nativeElement);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(recovery.requestReset).not.toHaveBeenCalled();
        expect(component.form.email().touched()).toBe(true);
        expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Email invalide.');
    });

    it('demande une réinitialisation et affiche la confirmation neutre', async () => {
        saisir(fixture.nativeElement, '#email', 'employe@example.com');
        soumettre(fixture.nativeElement);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(recovery.requestReset).toHaveBeenCalledWith('employe@example.com');
        expect(component.submitted()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('Si un compte existe pour cet email');
    });
});
