import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { ChantierService } from '../services/chantier.service';
import { ChantierActionsComponent } from './chantier-actions.component';

describe('ChantierActionsComponent', () => {
  let fixture: ComponentFixture<ChantierActionsComponent>;
  let service: { synchroniser: ReturnType<typeof vi.fn> };
  const racine = () => fixture.nativeElement as HTMLElement;

  function afficher(permissions: string[]): void {
    service = { synchroniser: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: ChantierService, useValue: service }]
    });
    fixture = TestBed.createComponent(ChantierActionsComponent);
    fixture.detectChanges();
  }

  it('propose la synchronisation et la création à qui en a les droits', () => {
    afficher(['CHANTIER_READ', 'CHANTIER_WRITE', 'CHANTIER_SYNC']);

    expect(racine().textContent).toContain('Synchroniser maintenant');
    expect(racine().querySelector('a[href="/chantiers/new"]')?.textContent).toContain('Nouveau chantier');
  });

  it('ne propose rien à qui peut seulement lire', () => {
    afficher(['CHANTIER_READ']);

    expect(racine().textContent).not.toContain('Synchroniser');
    expect(racine().querySelector('a[href="/chantiers/new"]')).toBeNull();
  });

  it('synchronise, annonce le bilan et prévient la page', () => {
    afficher(['CHANTIER_SYNC']);
    const synchronise = vi.fn();
    fixture.componentInstance.synchronise.subscribe(synchronise);
    service.synchroniser.mockReturnValue(of({ totalRecus: 5, crees: 2, dejaPresents: 3, ignores: 0 }));

    (racine().querySelector('button') as HTMLButtonElement).click();

    expect(service.synchroniser).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({
      summary: 'Synchronisation terminée',
      detail: '2 créé(s), 3 déjà présent(s), 0 ignoré(s)'
    });
    expect(synchronise).toHaveBeenCalledTimes(1);
  });
});
