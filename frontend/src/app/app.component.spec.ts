import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/services/auth.service';
import { CurrentUser } from './core/auth/models/auth.model';

function buildAuthServiceStub(user: CurrentUser | null) {
  const userSignal = signal<CurrentUser | null>(user);
  return {
    user: userSignal.asReadonly(),
    isAuthenticated: () => userSignal() !== null,
    hasPermission: (code: string) => userSignal()?.permissionsEffectives.includes(code) ?? false,
    logout: () => ({ subscribe: (cb: () => void) => cb() })
  };
}

describe('AppComponent', () => {
  describe('utilisateur non authentifié', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([]),
          MessageService,
          { provide: AuthService, useValue: buildAuthServiceStub(null) }
        ]
      }).compileComponents();
    });

    it('should create the app', () => {
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance).toBeTruthy();
    });

    it(`should have the 'Staport RH' title`, () => {
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance.title).toEqual('Staport RH');
    });

    it('should not render the sidebar when not authenticated', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.app-sidebar__brand')).toBeNull();
    });
  });

  describe('utilisateur authentifié', () => {
    beforeEach(async () => {
      const user: CurrentUser = {
        id: 1,
        username: 'hmayda',
        email: 'hmayda@staport.ma',
        actif: true,
        employee: null,
        roles: [{ id: 1, nom: 'SYSTEM_ADMIN' }],
        permissionsRefusees: [],
        permissionsEffectives: []
      };

      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [
          provideRouter([]),
          MessageService,
          { provide: AuthService, useValue: buildAuthServiceStub(user) }
        ]
      }).compileComponents();
    });

    it('should render the sidebar brand', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.app-sidebar__brand')?.textContent).toContain('Staport RH');
    });
  });
});
