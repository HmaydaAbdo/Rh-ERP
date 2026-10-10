import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfirmDialogService, NotificationService } from '@shared/feedback/feedback.service';
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
          NotificationService,
          ConfirmDialogService,
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
          NotificationService,
          ConfirmDialogService,
          { provide: AuthService, useValue: buildAuthServiceStub(user) }
        ]
      }).compileComponents();
    });

    it("offre un lien d'évitement qui met le focus sur le contenu principal", () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      const lien = compiled.querySelector<HTMLAnchorElement>('.app-skip');
      lien?.click();

      expect(lien?.textContent).toContain('Aller au contenu');
      expect(compiled.querySelector('main#contenu')).not.toBeNull();
      expect(document.activeElement?.id).toBe('contenu');
    });

    it('protège le nom du produit de la traduction automatique', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('.app-sidebar__brand [translate="no"]')).not.toBeNull();
    });

    it('should render the sidebar brand', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.app-sidebar__brand')?.textContent).toContain('Staport RH');
    });
  });
});
