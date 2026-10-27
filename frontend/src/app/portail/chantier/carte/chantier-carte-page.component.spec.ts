import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { ChantierCarte } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';

import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT } from './carte.config';
import { ChantierCarteComponent } from './chantier-carte.component';
import { ChantierCartePageComponent } from './chantier-carte-page.component';

describe('ChantierCartePageComponent', () => {
  const sites: ChantierCarte[] = [
    { id: 3, code: 'C057', designation: 'Dépôt Harbil', nom: 'Dépôt Harbil', nature: 'DEPOT', localisation: 'https://www.google.com/maps/search/?api=1&query=31,-8', latitude: 31, longitude: -8 },
    { id: 4, code: 'C168', designation: 'Nador', nom: null, nature: 'AO', localisation: 'https://www.google.com/maps/search/?api=1&query=35,-3', latitude: 35, longitude: -3 }
  ];

  function configurer(service: object): void {
    TestBed.configureTestingModule({ providers: [
      { provide: ChantierService, useValue: service },
      { provide: CARTE_CONFIG, useValue: { ...CARTE_CONFIG_PAR_DEFAUT, fond: { ...CARTE_CONFIG_PAR_DEFAUT.fond, archive: 'carte/fond/archive-inexistante.pmtiles' } } }
    ] });
  }

  it('affiche uniquement la carte et le filtre compact par nature', async () => {
    configurer({ carte: () => of(sites) });
    const fixture = TestBed.createComponent(ChantierCartePageComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h1')?.textContent).toContain('Chantiers');
    expect(element.querySelector('app-chantier-carte [role="region"]')).not.toBeNull();
    expect(element.querySelector('.carte-page__filtre')).not.toBeNull();
    expect(element.querySelectorAll('.carte-page__chantier')).toHaveLength(0);
    expect(element.querySelector('input[aria-label="Filtrer les chantiers par nature"]')).not.toBeNull();
    expect(element.textContent).not.toContain('Paie');
    expect(element.textContent).not.toContain('Employés');
    expect(element.textContent).toContain('2 sites');

    fixture.componentInstance['naturesChoisies'].set(['DEPOT']);
    fixture.detectChanges();
    const carte = fixture.debugElement.query(By.directive(ChantierCarteComponent)).componentInstance as ChantierCarteComponent;
    expect(carte.chantiers()).toEqual([sites[0]]);
    expect(fixture.nativeElement.querySelector('.carte-page__filtre').textContent).toContain('1 site');
  });

  it('signale une erreur et permet de recharger la carte', async () => {
    const carte = vi.fn().mockReturnValueOnce(throwError(() => new Error('indisponible'))).mockReturnValue(of([]));
    configurer({ carte });
    const fixture = TestBed.createComponent(ChantierCartePageComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Carte indisponible');
    fixture.nativeElement.querySelector('.carte-page__reessayer').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Aucun chantier ne correspond à cette nature.');
    expect(carte).toHaveBeenCalledTimes(2);
  });
});
