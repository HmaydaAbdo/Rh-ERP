import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieCartesComponent } from './paie-cartes.component';

const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-09', nombreBulletins: 1000, nombreChantiers: 3, masse: 900000, stc: 4, stcMontant: 30000 },
  { periode: '2026-08', nombreBulletins: 969, nombreChantiers: 3, masse: 800000, stc: 2, stcMontant: 18000 },
  { periode: '2026-06', nombreBulletins: 900, nombreChantiers: 3, masse: 700000, stc: 0, stcMontant: 0 }
];

function analyse(periode: string): PaieAnalytique {
  const aout = periode === '2026-08';
  return {
    periode,
    kpis: { masse: aout ? 800000 : 700000, effectif: 158, coutMoyen: 5000, nombreChantiers: 2, stc: 2, stcMontant: 18000 },
    moisPrecedent: null,
    parChantier: [
      { id: 1, code: 'C168', libelle: 'Nador', masse: 720000, effectif: 148, stc: 2, stcMontant: 18000 },
      { id: 2, code: 'C196', libelle: null, masse: 80000, effectif: 10, stc: 0, stcMontant: 0 }
    ],
    parEquipe: [
      { id: 5, code: 'CH', libelle: 'Chauffeurs', masse: 400000, effectif: 80, stc: 1, stcMontant: 9000 },
      { id: null, code: null, libelle: null, masse: 20000, effectif: 5, stc: 0, stcMontant: 0 }
    ],
    parFonction: [], tranches: [], evolution: [], qualite: { sansEquipe: 5, sansObservation: 0 }
  };
}

describe('PaieCartesComponent', () => {
  let paie: MockedObject<PaieService>;
  let messages: MockedObject<NotificationService>;
  let harness: RouterTestingHarness;
  let autorise: (permission: string) => boolean;

  async function ouvrir(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url, PaieCartesComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  const bouton = (page: HTMLElement, libelle: string) => page.querySelector(`button[aria-label="${libelle}"]`) as HTMLButtonElement | null;

  beforeEach(async () => {
    autorise = () => true;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      rechercherPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockImplementation((criteres: { periode: string }) => of(analyse(criteres.periode))),
      supprimerGroupe: vi.fn().mockReturnValue(of({ supprimes: 969 }))
    } as unknown as MockedObject<PaieService>;
    messages = { add: vi.fn() } as unknown as MockedObject<NotificationService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'paie/cartes', component: PaieCartesComponent }]),
        { provide: PaieService, useValue: paie },
        { provide: EmployeeService, useValue: { regrouper: vi.fn().mockReturnValue(of([])), search: vi.fn() } },
        { provide: NotificationService, useValue: messages },
        { provide: AuthService, useValue: { hasPermission: (permission: string) => autorise(permission) } },
        { provide: ChantierReferenceService, useValue: { fetchById: () => of({ id: 1, code: 'C168' }) } },
        { provide: EquipeReferenceService, useValue: { fetchById: () => of({ id: 5, code: 'CH' }) } },
        { provide: FunctionReferenceService, useValue: { fetchById: () => of({ id: 7, libelle: 'MACON' }) } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les mois qui ont de la paie tant qu’aucun mois n’est choisi, du plus récent au plus ancien', async () => {
    const page = await ouvrir('/paie/cartes?nom=ali');
    const cartes = Array.from(page.querySelectorAll('.perimetre-carte'));

    expect(cartes.map((c) => c.querySelector('.perimetre-carte__code')?.textContent?.trim())).toEqual(['septembre 2026', 'août 2026', 'juin 2026']);
    expect(paie.rechercherPeriodes).toHaveBeenCalledWith(expect.objectContaining({ nomPrenom: 'ali', periode: undefined }));
    expect(paie.analyser).not.toHaveBeenCalled();
    expect(page.querySelector('.perimetre-cartes__periode')).toBeNull();
  });

  it('compare chaque mois au mois contigu, et seulement à lui', async () => {
    const page = await ouvrir('/paie/cartes');
    const [septembre, aout, juin] = Array.from(page.querySelectorAll('.perimetre-carte')).map((c) => c.textContent ?? '');

    // Septembre se compare à août, le mois contigu.
    expect(septembre).toContain('+12,5 %');
    expect(septembre).toContain('+31');
    // Juillet n'a pas de paie : août et juin ne sont comparés à rien, jamais à un mois plus ancien.
    expect(aout).not.toContain('%');
    expect(juin).not.toContain('%');
  });

  it('ouvrir un mois le choisit, puis descend aux chantiers du mois', async () => {
    const page = await ouvrir('/paie/cartes');
    (page.querySelector('button[aria-label="Ouvrir août 2026"]') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(TestBed.inject(Router).url).toContain('periode=2026-08');
    expect(page.querySelector('.perimetre-cartes__etape')?.textContent).toContain('août 2026');
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
    expect(page.querySelector('button[aria-pressed="true"]')?.textContent).toContain('Chantier');
  });

  it('transmet les filtres de la barre à chaque niveau et ajoute « Sans équipe » parmi les équipes', async () => {
    const page = await ouvrir('/paie/cartes?periode=2026-08&nom=ali&cin=AB1&fonctionIds=5&chantierIds=1&par=equipe');

    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08', nomPrenom: 'ali', cin: 'AB1', fonctionIds: [5], chantierIds: [1] }));
    expect(Array.from(page.querySelectorAll('.perimetre-carte__code')).map((c) => c.textContent?.trim())).toEqual(['Chauffeurs', 'Sans équipe']);
  });

  describe('suppression en groupe', () => {
    it('n’est proposée qu’avec PAIE_PURGE : PAIE_DELETE (un bulletin) ne suffit pas', async () => {
      autorise = (permission) => permission !== 'PAIE_PURGE';
      let page = await ouvrir('/paie/cartes');
      expect(bouton(page, 'Supprimer les bulletins de août 2026')).toBeNull();

      autorise = () => true;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'paie/cartes', component: PaieCartesComponent }]),
          { provide: PaieService, useValue: paie },
          { provide: EmployeeService, useValue: { regrouper: vi.fn().mockReturnValue(of([])), search: vi.fn() } },
          { provide: NotificationService, useValue: messages },
          { provide: AuthService, useValue: { hasPermission: () => true } },
          { provide: ChantierReferenceService, useValue: { fetchById: () => of({ id: 1, code: 'C168' }) } },
          { provide: EquipeReferenceService, useValue: { fetchById: () => of({ id: 5, code: 'CH' }) } },
          { provide: FunctionReferenceService, useValue: { fetchById: () => of({ id: 7, libelle: 'MACON' }) } }
        ]
      });
      harness = await RouterTestingHarness.create();
      page = await ouvrir('/paie/cartes');
      expect(bouton(page, 'Supprimer les bulletins de août 2026')).not.toBeNull();
    });

    it('vise les bulletins du mois que comptait la carte, avec les filtres de la barre sauf le mois', async () => {
      const page = await ouvrir('/paie/cartes?nom=ali&fonctionIds=5,6');
      bouton(page, 'Supprimer les bulletins de août 2026')!.click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();

      const dialogue = document.querySelector('[role="dialog"]')!;
      expect(dialogue.textContent).toContain('969 bulletin(s)');
      expect(dialogue.textContent).toContain('Mois : août 2026');
      expect(dialogue.textContent).toContain('Nom et prénom contient « ali »');
      expect(dialogue.textContent).toContain('2 fonctions sélectionnées');
    });

    it('n’active la suppression qu’une fois le nombre retapé à l’identique, puis supprime et recharge', async () => {
      const page = await ouvrir('/paie/cartes');
      bouton(page, 'Supprimer les bulletins de août 2026')!.click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      const confirmer = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Supprimer') as HTMLButtonElement;
      const champ = document.querySelector('#confirmation-suppression') as HTMLInputElement;
      expect(confirmer.disabled).toBe(true);

      champ.value = '96';
      champ.dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
      expect(confirmer.disabled).toBe(true);

      champ.value = ' 969 ';
      champ.dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
      expect(confirmer.disabled).toBe(false);

      paie.rechercherPeriodes.mockClear();
      confirmer.click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();

      expect(paie.supprimerGroupe).toHaveBeenCalledWith({ criteres: expect.objectContaining({ periode: '2026-08' }), nombreAttendu: 969 });
      expect(messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: 'Bulletins supprimés' }));
      expect(paie.rechercherPeriodes).toHaveBeenCalledTimes(1);
    });

    it('vise le chantier de la carte dans le mois choisi, en remplaçant le filtre chantier', async () => {
      const page = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1,2&par=chantier');
      bouton(page, 'Supprimer les bulletins de chantier C196')!.click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      const champ = document.querySelector('#confirmation-suppression') as HTMLInputElement;
      champ.value = '10';
      champ.dispatchEvent(new Event('input'));
      harness.fixture.detectChanges();
      (Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Supprimer') as HTMLButtonElement).click();

      expect(paie.supprimerGroupe).toHaveBeenCalledWith({ criteres: expect.objectContaining({ periode: '2026-08', chantierIds: [2] }), nombreAttendu: 10 });
    });

    it('ne cible pas les bulletins sans équipe : l’API ne sait pas les isoler', async () => {
      const page = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1&par=equipe');

      expect(bouton(page, 'Supprimer les bulletins de équipe Chauffeurs')).not.toBeNull();
      expect(bouton(page, 'Supprimer les bulletins de équipe Sans équipe')).toBeNull();
    });

    it('annule sans rien supprimer', async () => {
      const page = await ouvrir('/paie/cartes');
      bouton(page, 'Supprimer les bulletins de août 2026')!.click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();

      (Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent?.trim() === 'Annuler') as HTMLButtonElement).click();
      harness.fixture.detectChanges();

      expect(paie.supprimerGroupe).not.toHaveBeenCalled();
    });
  });
});
