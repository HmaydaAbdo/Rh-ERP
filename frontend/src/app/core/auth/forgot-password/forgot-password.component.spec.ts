import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { PasswordRecoveryService } from '../services/password-recovery.service';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let component: ForgotPasswordComponent;
  let recovery: jasmine.SpyObj<PasswordRecoveryService>;

  beforeEach(async () => {
    recovery = jasmine.createSpyObj<PasswordRecoveryService>('PasswordRecoveryService', ['requestReset']);
    recovery.requestReset.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [provideRouter([]), { provide: PasswordRecoveryService, useValue: recovery }]
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('refuse une adresse invalide avant l’appel de service', () => {
    component.form.controls.email.setValue('pas-un-email');
    component.onSubmit();

    expect(recovery.requestReset).not.toHaveBeenCalled();
    expect(component.form.controls.email.touched).toBeTrue();
  });

  it('demande une réinitialisation et affiche la confirmation neutre', async () => {
    component.form.controls.email.setValue('employe@example.com');
    component.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(recovery.requestReset).toHaveBeenCalledWith('employe@example.com');
    expect(component.submitted()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Si un compte existe pour cet email');
  });
});
