import { Component, ChangeDetectionStrategy } from '@angular/core';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { HeuresSuppExportEtat } from '../services/heures-supp-export-etat.service';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppVuesComponent } from './heures-supp-vues.component';

@Component({ standalone: true, imports: [RouterOutlet], template: '<router-outlet />', changeDetection: ChangeDetectionStrategy.OnPush })
class ChildView {}

describe('HeuresSuppVuesComponent', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'heures-supp', component: HeuresSuppVuesComponent, children: [
      { path: '', component: ChildView }, { path: 'cartes', component: ChildView }, { path: 'analytique', component: ChildView }
    ] }]), { provide: ChantierReferenceService, useValue: { fetchById: vi.fn().mockReturnValue(of({ code: 'C4' })) } }, { provide: HeuresSuppService, useValue: { periodes: vi.fn().mockReturnValue(of(['2026-10', '2026-09'])), telechargerModele: vi.fn().mockReturnValue(of(new Blob(['modele']))) } }] });
    harness = await RouterTestingHarness.create();
  });

  it('lit uniquement une période aaaa-MM valide depuis l’URL', async () => {
    const component = await harness.navigateByUrl('/heures-supp/cartes?periode=2026-10', HeuresSuppVuesComponent);
    expect(component['mois']()).toEqual(new Date(2026, 9, 1));

    await harness.navigateByUrl('/heures-supp?periode=2026-13', HeuresSuppVuesComponent);
    expect(component['mois']()).toBeNull();
  });

  it('met à jour le mois sans changer la vue et retire la période vidée', async () => {
    const component = await harness.navigateByUrl('/heures-supp/analytique?periode=2026-10&chantierIds=4', HeuresSuppVuesComponent);
    component['choisirMois'](new Date(2026, 10, 1));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('/heures-supp/analytique?');
    expect(TestBed.inject(Router).url).toContain('periode=2026-11');
    expect(TestBed.inject(Router).url).toContain('chantierIds=4');

    component['choisirMois'](null);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/heures-supp/analytique?chantierIds=4');
  });

  it('place le modèle Excel dans le menu du bouton Importer', async () => {
    const component = await harness.navigateByUrl('/heures-supp', HeuresSuppVuesComponent);
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:modele');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(component['menuImport'][0].label).toBe('Télécharger le modèle Excel');
    component['menuImport'][0].command();

    expect(TestBed.inject(HeuresSuppService).telechargerModele).toHaveBeenCalledOnce();
    expect(url).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
  });

  it('pose le bouton Exporter à côté d’Importer dans les trois vues et exporte le périmètre filtré dans l’ordre du tableau', async () => {
    const service = TestBed.inject(HeuresSuppService) as unknown as { exporterPdf: ReturnType<typeof vi.fn> };
    service.exporterPdf = vi.fn().mockReturnValue(of(new Blob(['%PDF'])));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const boutons = (): string[] => Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');

    for (const url of ['/heures-supp', '/heures-supp/cartes', '/heures-supp/analytique']) {
      await harness.navigateByUrl(`${url}?periode=2026-10&cin=AB1`, HeuresSuppVuesComponent);
      expect(boutons()).toContain('Exporter');
      expect(boutons().join('|')).not.toContain('Importer un chantier');
    }

    TestBed.inject(HeuresSuppExportEtat).tri.set('montant,desc');
    const component = harness.routeDebugElement!.componentInstance as HeuresSuppVuesComponent & Record<string, (...args: unknown[]) => unknown>;
    const exporter = (): HTMLButtonElement => Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Exporter')!;

    // Un mois sans chantier : l'export reste inactif et ne s'ouvre pas.
    expect(exporter().disabled).toBe(true);
    component['ouvrirExport']();
    expect(component['exportOuvert']()).toBe(false);

    // Un seul mois et un seul chantier : l'étape « mode » s'ouvre, le PDF suit le tri changé du tableau.
    await harness.navigateByUrl('/heures-supp?periode=2026-10&chantierIds=4', HeuresSuppVuesComponent);
    expect(exporter().disabled).toBe(false);
    exporter().click();
    expect(component['exportOuvert']()).toBe(true);
    (component['modeExport'] as unknown as { set(valeur: string): void }).set('signature_empreinte');
    component['exporterPdf']();
    expect(service.exporterPdf).toHaveBeenCalledWith({ periode: '2026-10', chantierIds: [4] }, 'montant,desc', 'signature_empreinte');
    expect(component['exportOuvert']()).toBe(false);

    // Deux chantiers : l'export n'est plus possible.
    await harness.navigateByUrl('/heures-supp?periode=2026-10&chantierIds=4,5', HeuresSuppVuesComponent);
    expect(exporter().disabled).toBe(true);
  });
});
