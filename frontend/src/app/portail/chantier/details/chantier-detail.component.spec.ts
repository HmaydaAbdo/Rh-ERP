import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Chantier } from '../models/chantier.model';
import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { ChantierService } from '../services/chantier.service';
import { ChantierDetailComponent } from './chantier-detail.component';

const CHANTIER: Chantier = { id: 3, version: 0, code: 'C196', designation: 'Autoroute Marrakech', nom: null, sourceErp: false, actif: true };

describe('ChantierDetailComponent', () => {
  const service = { getById: vi.fn() };

  function afficher(permissions: string[], chantier: Chantier = CHANTIER) {
    service.getById.mockReset().mockReturnValue(of(chantier));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirRoute({ id: '3' }), fournirPermissions(permissions).providers, { provide: ChantierService, useValue: service }]
    });
    const fixture = TestBed.createComponent(ChantierDetailComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const valeurs = (page: HTMLElement) => Array.from(page.querySelectorAll('dd')).map((d) => d.textContent?.trim());

  it('charge le chantier de l’adresse et affiche son code, sa désignation, son statut et sa source', () => {
    const page = afficher(['CHANTIER_READ']);

    expect(service.getById).toHaveBeenCalledWith(3);
    expect(page.querySelector('h1')?.textContent).toBe('C196');
    expect(valeurs(page)).toEqual(['Autoroute Marrakech', '-', 'Actif', 'Manuel']);
  });

  it('montre le nom quand il est renseigné, un chantier inactif et une source ERP', () => {
    const page = afficher(['CHANTIER_READ'], { ...CHANTIER, nom: 'Nord', actif: false, sourceErp: true });

    expect(valeurs(page)).toEqual(['Autoroute Marrakech', 'Nord', 'Inactif', 'ERP']);
    expect(page.querySelector('stp-badge.stp-badge--danger')).not.toBeNull();
    expect(page.querySelector('stp-badge.stp-badge--info')).not.toBeNull();
  });

  it('propose « Modifier » seulement à qui peut écrire', () => {
    expect(afficher(['CHANTIER_READ', 'CHANTIER_WRITE']).querySelector('a[href="/chantiers/3/edit"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(afficher(['CHANTIER_READ']).querySelector('a[href="/chantiers/3/edit"]')).toBeNull();
  });
});
