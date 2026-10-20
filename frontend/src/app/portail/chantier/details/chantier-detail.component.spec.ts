import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';

import { Chantier } from '../models/chantier.model';
import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { ChantierService } from '../services/chantier.service';
import { ChantierDetailComponent } from './chantier-detail.component';

const CHANTIER: Chantier = { id: 3, version: 0, code: 'C196', designation: 'Autoroute Marrakech', nom: null, sourceErp: false, actif: true };

describe('ChantierDetailComponent', () => {
  const service = { getById: vi.fn(), changerStatut: vi.fn() };
  let fixture: ComponentFixture<ChantierDetailComponent>;

  function afficher(permissions: string[], chantier: Chantier = CHANTIER) {
    service.getById.mockReset().mockReturnValue(of(chantier));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirRoute({ id: '3' }), fournirPermissions(permissions).providers, { provide: ChantierService, useValue: service }]
    });
    fixture = TestBed.createComponent(ChantierDetailComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const valeurs = (page: HTMLElement) => Array.from(page.querySelectorAll('dd')).map((d) => d.textContent?.trim());

  it('charge le chantier de l’adresse et affiche son code, sa désignation, son statut et sa source', () => {
    const page = afficher(['CHANTIER_READ']);

    expect(service.getById).toHaveBeenCalledWith(3);
    expect(page.querySelector('h1')?.textContent).toBe('C196');
    expect(valeurs(page)).toEqual(['Autoroute Marrakech', '-', 'En cours', 'Manuel']);
  });

  it('clôture le chantier après confirmation et affiche son nouveau statut', () => {
    service.changerStatut.mockReturnValue(of({ ...CHANTIER, actif: false }));
    const page = afficher(['CHANTIER_READ', 'CHANTIER_WRITE']);
    const confirmation = TestBed.inject(ConfirmDialogService);

    (Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Clôturer')) as HTMLButtonElement).click();
    confirmation.request()!.accept!();
    fixture.detectChanges();

    expect(service.changerStatut).toHaveBeenCalledWith(CHANTIER, false);
    expect(valeurs(page)).toContain('Clôturé');
    expect(Array.from(page.querySelectorAll('button')).some((b) => b.textContent?.includes('Rouvrir'))).toBe(true);
  });

  it('montre le nom quand il est renseigné, un chantier clôturé et une source ERP', () => {
    const page = afficher(['CHANTIER_READ'], { ...CHANTIER, nom: 'Nord', actif: false, sourceErp: true });

    expect(valeurs(page)).toEqual(['Autoroute Marrakech', 'Nord', 'Clôturé', 'ERP']);
    expect(page.querySelector('stp-badge.stp-badge--neutral')).not.toBeNull();
    expect(page.querySelector('stp-badge.stp-badge--info')).not.toBeNull();
  });

  it('propose « Modifier » seulement à qui peut écrire', () => {
    expect(afficher(['CHANTIER_READ', 'CHANTIER_WRITE']).querySelector('a[href="/chantiers/3/edit"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(afficher(['CHANTIER_READ']).querySelector('a[href="/chantiers/3/edit"]')).toBeNull();
  });
});
