import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { FunctionService } from '../services/function.service';
import { FunctionDetailComponent } from './function-detail.component';

describe('FunctionDetailComponent', () => {
  const service = { getById: vi.fn() };

  function afficher(permissions: string[]) {
    service.getById.mockReset().mockReturnValue(of({ id: 4, libelle: 'MACON' }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirRoute({ id: '4' }), fournirPermissions(permissions).providers, { provide: FunctionService, useValue: service }]
    });
    const fixture = TestBed.createComponent(FunctionDetailComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('charge la fonction de l’adresse et l’affiche', () => {
    const page = afficher(['FUNCTION_READ']);

    expect(service.getById).toHaveBeenCalledWith(4);
    expect(page.querySelector('h1')?.textContent).toBe('MACON');
    expect(page.querySelector('dd')?.textContent).toBe('MACON');
    expect(page.querySelector('.app-back')?.getAttribute('href')).toBe('/functions');
  });

  it('propose « Modifier » à qui peut écrire', () => {
    const page = afficher(['FUNCTION_READ', 'FUNCTION_WRITE']);

    expect(page.querySelector('a[href="/functions/4/edit"]')?.textContent).toContain('Modifier');
  });

  it('ne propose pas « Modifier » sans la permission d’écriture', () => {
    const page = afficher(['FUNCTION_READ']);

    expect(page.querySelector('a[href="/functions/4/edit"]')).toBeNull();
  });
});
