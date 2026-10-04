import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieListComponent } from './paie-list.component';

describe('PaieListComponent — filtres de la barre commune', () => {
  let service: jasmine.SpyObj<PaieService>;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    service = jasmine.createSpyObj<PaieService>('PaieService', ['search']);
    service.search.and.returnValue(of({ content: [], totalElements: 0 } as unknown as Page<Paie>));

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [
        provideRouter([{ path: 'paie', component: PaieListComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
        { provide: PaieService, useValue: service }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('ne filtre rien quand l\'URL n\'a pas de paramètre', async () => {
    await harness.navigateByUrl('/paie', PaieListComponent);

    expect(service.search).toHaveBeenCalledTimes(1);
    expect(service.search.calls.mostRecent().args[0]).toEqual({
      nomPrenom: undefined,
      cin: undefined,
      periode: undefined,
      fonctionIds: undefined,
      chantierIds: undefined,
      equipeIds: undefined
    });
  });

  it('applique tous les filtres de l\'URL à la première recherche', async () => {
    await harness.navigateByUrl(
      '/paie?periode=2026-08&nom=ali&cin=AB1&chantierIds=3&fonctionIds=5,6&equipeIds=7,8',
      PaieListComponent
    );

    expect(service.search).toHaveBeenCalledTimes(1);
    expect(service.search.calls.mostRecent().args[0]).toEqual({
      nomPrenom: 'ali',
      cin: 'AB1',
      periode: '2026-08',
      fonctionIds: [5, 6],
      chantierIds: [3],
      equipeIds: [7, 8]
    });
  });

  it('ignore les valeurs invalides de l\'URL', async () => {
    await harness.navigateByUrl('/paie?periode=2026-13&chantierIds=abc,-2&equipeIds=', PaieListComponent);

    expect(service.search.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ periode: undefined, chantierIds: undefined, equipeIds: undefined })
    );
  });

  it('relance la recherche, première page, quand les filtres de l\'URL changent', async () => {
    const composant = await harness.navigateByUrl('/paie', PaieListComponent);
    composant.first = 30;

    await harness.navigateByUrl('/paie?cin=AB1', PaieListComponent);

    expect(service.search).toHaveBeenCalledTimes(2);
    expect(service.search.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ cin: 'AB1' }));
    expect(service.search.calls.mostRecent().args[1].page).toBe(0);
    expect(composant.first).toBe(0);
  });

  it('ne relance rien quand l\'URL change sans changer les filtres', async () => {
    await harness.navigateByUrl('/paie?cin=AB1', PaieListComponent);

    await harness.navigateByUrl('/paie?cin=AB1#haut', PaieListComponent);

    expect(service.search).toHaveBeenCalledTimes(1);
  });
});
