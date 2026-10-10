import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { PasswordRecoveryService } from '../services/password-recovery.service';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let component: ResetPasswordComponent;
  let recovery: jasmine.SpyObj<PasswordRecoveryService>;
  let router: jasmine.SpyObj<Router>;

  async function createComponent(token: string | null): Promise<void> {
    recovery = jasmine.createSpyObj<PasswordRecoveryService>('PasswordRecoveryService', ['resetPassword']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: PasswordRecoveryService, useValue: recovery },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('refuse un lien sans jeton', async () => {
    await createComponent(null);

    expect(component.errorMessage()).toBe('Lien invalide : jeton manquant.');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBeTrue();
  });

  it('applique le changement puis retourne à la connexion', async () => {
    await createComponent('reset-token');
    recovery.resetPassword.and.returnValue(of(undefined));
    component.form.controls.nouveauMotDePasse.setValue('motdepasse123');
    component.onSubmit();
    await fixture.whenStable();

    expect(recovery.resetPassword).toHaveBeenCalledWith('reset-token', 'motdepasse123');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('annonce au formulaire un jeton expiré ou déjà utilisé', async () => {
    await createComponent('stale-token');
    recovery.resetPassword.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
    component.form.controls.nouveauMotDePasse.setValue('motdepasse123');
    component.onSubmit();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe('Ce lien est invalide, expiré ou déjà utilisé.');
  });
});
