import type { MockedObject } from 'vitest';
import { Component } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { NotificationService } from '@shared/ui/feedback/feedback.service';
import { of } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { AUCUN_FILTRE } from '../filtres/paie-filtres';
import { Paie, PaiePeriodeResume } from '../models/paie.model';
import { PaieActualisationService } from '../services/paie-actualisation.service';
import { PaieService } from '../services/paie.service';
import { PaieVueIntegreeComponent } from './paie-vue-integree.component';

@Component({
  imports: [PaieVueIntegreeComponent],
  template: `
    <app-paie-vue-integree [depart]="premiere" />
    <app-paie-vue-integree [depart]="seconde" />
  `
})
class HoteComponent {
  premiere: Record<string, string> = { periode: '2026-08', nom: 'ali' };
  seconde: Record<string, string> = { periode: '2026-07', chantierIds: '3,4' };
}

const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-08', nombreBulletins: 10, nombreChantiers: 2, masse: 40000, stc: 1, stcMontant: 4000 },
  { periode: '2026-07', nombreBulletins: 8, nombreChantiers: 2, masse: 32000, stc: 0, stcMontant: 0 }
];

describe('PaieVueIntegreeComponent (la vue de la paie dans la conversation)', () => {
  let service: MockedObject<PaieService>;

  async function monter() {
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const vues = fixture.debugElement.queryAll(By.directive(PaieVueIntegreeComponent)).map((d) => d.componentInstance as PaieVueIntegreeComponent);
    return { fixture, vues, page: fixture.nativeElement as HTMLElement };
  }

  const recherches = () => vi.mocked(service.search).mock.calls.map((appel) => appel[0]);

  beforeEach(() => {
    service = {
      search: vi.fn().mockName('PaieService.search'),
      listerPeriodes: vi.fn().mockName('PaieService.listerPeriodes')
    } as unknown as MockedObject<PaieService>;
    service.search.mockReturnValue(of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } } as Page<Paie>));
    service.listerPeriodes.mockReturnValue(of(PERIODES));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        NotificationService,
        { provide: PaieService, useValue: service }
      ]
    });
  });

  it('affiche la barre de filtres et le tableau, réglés sur les filtres de départ', async () => {
    const { page } = await monter();

    expect(page.querySelectorAll('app-paie-filtres')).toHaveLength(2);
    expect(page.querySelectorAll('app-paie-list')).toHaveLength(2);
    expect(recherches()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ periode: '2026-08', nomPrenom: 'ali' }),
        expect.objectContaining({ periode: '2026-07', chantierIds: [3, 4] })
      ])
    );
  });

  it("ignore une valeur de départ invalide (mois mal formé, identifiant non entier)", async () => {
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.componentInstance.premiere = { periode: '2026-13', chantierIds: 'abc,-2' };
    fixture.componentInstance.seconde = {};
    fixture.detectChanges();
    await fixture.whenStable();

    expect(recherches()[0]).toEqual(expect.objectContaining({ periode: undefined, chantierIds: undefined }));
  });

  it("filtre dans la vue sans toucher à l'URL de la page ni à l'autre vue", async () => {
    const { fixture, vues } = await monter();
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigate');
    const avant = recherches().length;

    vues[0]['appliquer']({ ...AUCUN_FILTRE, periode: '2026-08', nomPrenom: 'ali', cin: 'AB1' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigation).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(vues[0]['filtres']().cin).toBe('AB1');
    expect(vues[1]['filtres']().cin).toBe('');
    expect(recherches().length).toBeGreaterThan(avant);
    expect(recherches().at(-1)).toEqual(expect.objectContaining({ cin: 'AB1', nomPrenom: 'ali' }));
  });

  it("charge les mois qui contiennent de la paie pour la barre", async () => {
    const { vues } = await monter();

    expect(vues[0]['periodes']()).toEqual(['2026-08', '2026-07']);
  });

  it("ne propose aucune action de ligne qui quitterait la conversation", async () => {
    const { page } = await monter();

    expect(page.querySelector('app-paie-list app-collection-table')).not.toBeNull();
    expect(page.querySelector('.stp-table__actions-header')).toBeNull();
  });

  describe('import (KAN-309)', () => {
    it('recharge toutes les vues de la conversation et les mois de la barre après un import réussi', async () => {
      const { fixture } = await monter();
      const recherchesAvant = recherches().length;
      const periodesAvant = vi.mocked(service.listerPeriodes).mock.calls.length;

      TestBed.inject(PaieActualisationService).signaler();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(recherches().length - recherchesAvant).toBe(2);
      expect(vi.mocked(service.listerPeriodes).mock.calls.length - periodesAvant).toBe(2);
      expect(fixture.nativeElement.querySelectorAll('app-paie-list')).toHaveLength(2);
    });

    it("garde les filtres de chaque vue quand elle se recharge", async () => {
      const { fixture, vues } = await monter();

      TestBed.inject(PaieActualisationService).signaler();
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(vues[0]['filtres']().nomPrenom).toBe('ali');
      expect(recherches().at(-1)).toEqual(expect.objectContaining({ periode: '2026-07' }));
    });

    it("ne montre ni Importer ni Exporter sans les droits, et jamais « Nouveau bulletin »", async () => {
      const { page } = await monter();

      expect(page.querySelectorAll('app-paie-actions')).toHaveLength(2);
      expect(page.querySelector('app-paie-actions button')).toBeNull();
    });
  });

  describe('sélecteur de vue (KAN-308)', () => {
    async function choisir(fixture: Awaited<ReturnType<typeof monter>>['fixture'], numero: number, vue: number): Promise<void> {
      const boutons = fixture.nativeElement.querySelectorAll('app-paie-vue-integree')[numero].querySelectorAll('app-vue-switcher button');
      (boutons[vue] as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('propose Tabulaire, Cartes et Analytique, la vue de départ étant la vue active', async () => {
      const { page } = await monter();

      const boutons = Array.from(page.querySelectorAll('app-paie-vue-integree')[0].querySelectorAll('app-vue-switcher button'));
      expect(boutons.map((b) => b.textContent?.trim())).toEqual(['Tabulaire', 'Cartes', 'Analytique']);
      expect(boutons.map((b) => b.getAttribute('aria-current'))).toEqual(['page', null, null]);
    });

    it('change de vue dans la conversation seulement : ni l’URL de la page ni l’autre vue ne bougent', async () => {
      const { fixture, page } = await monter();
      const url = TestBed.inject(Router).url;

      await choisir(fixture, 0, 1);

      const premiere = page.querySelectorAll('app-paie-vue-integree')[0];
      expect(premiere.querySelector('app-paie-cartes')).not.toBeNull();
      expect(premiere.querySelector('app-paie-list')).toBeNull();
      expect(page.querySelectorAll('app-paie-list')).toHaveLength(1);
      expect(TestBed.inject(Router).url).toBe(url);
    });

    it('garde les filtres en changeant de vue', async () => {
      const { fixture, vues } = await monter();

      await choisir(fixture, 0, 2);

      expect(vues[0]['filtres']().nomPrenom).toBe('ali');
      expect(vues[0]['filtres']().periode).toBe('2026-08');
    });

    it('ne propose aucune suppression en groupe dans les cartes', async () => {
      const { fixture, page } = await monter();

      await choisir(fixture, 0, 1);

      expect(page.querySelector('app-paie-cartes [aria-label^="Supprimer les bulletins"]')).toBeNull();
    });
  });
});
