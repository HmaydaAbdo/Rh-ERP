import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { EquipeService } from '../services/equipe.service';
import { EquipeDetailComponent } from './equipe-detail.component';

describe('EquipeDetailComponent', () => {
  const service = { getById: vi.fn() };

  function afficher(permissions: string[]) {
    service.getById.mockReset().mockReturnValue(of({ id: 2, code: 'CH', libelle: 'Chauffeurs' }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirRoute({ id: '2' }), fournirPermissions(permissions).providers, { provide: EquipeService, useValue: service }]
    });
    const fixture = TestBed.createComponent(EquipeDetailComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('charge l’équipe de l’adresse et affiche son code et son libellé', () => {
    const page = afficher(['EQUIPE_READ']);

    expect(service.getById).toHaveBeenCalledWith(2);
    expect(page.querySelector('h1')?.textContent).toBe('Chauffeurs');
    expect(Array.from(page.querySelectorAll('dd')).map((d) => d.textContent)).toEqual(['CH', 'Chauffeurs']);
  });

  it('propose « Modifier » seulement à qui peut écrire', () => {
    expect(afficher(['EQUIPE_READ', 'EQUIPE_WRITE']).querySelector('a[href="/equipes/2/edit"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(afficher(['EQUIPE_READ']).querySelector('a[href="/equipes/2/edit"]')).toBeNull();
  });
});
