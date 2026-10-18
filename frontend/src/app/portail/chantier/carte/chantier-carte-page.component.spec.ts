import { TestBed } from '@angular/core/testing';

import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT } from './carte.config';
import { ChantierCartePageComponent } from './chantier-carte-page.component';

describe('ChantierCartePageComponent', () => {
  it('affiche la carte sans titre de page', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CARTE_CONFIG,
          useValue: { ...CARTE_CONFIG_PAR_DEFAUT, fond: { ...CARTE_CONFIG_PAR_DEFAUT.fond, archive: 'carte/fond/archive-inexistante.pmtiles' } }
        }
      ]
    });
    const fixture = TestBed.createComponent(ChantierCartePageComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('h1')).toBeNull();
    expect(element.querySelector('app-chantier-carte [role="region"]')).not.toBeNull();
  });
});
