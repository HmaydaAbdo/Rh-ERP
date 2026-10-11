import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ParametreService } from '../services/parametre.service';
import { ParametreListComponent } from './parametre-list.component';

const PARAMETRES = [
  {
    id: 1,
    cle: 'securite.jeton-acces.minutes',
    libelle: 'Durée de l’Access Token',
    description: 'Durée du jeton.',
    type: 'ENTIER' as const,
    unite: 'minutes',
    minimum: 1,
    maximum: 1440,
    valeur: '15'
  },
  {
    id: 2,
    cle: 'chantier.synchronisation.cron',
    libelle: 'Planification de la synchronisation des chantiers',
    description: 'Expression de planification.',
    type: 'CRON' as const,
    unite: null,
    minimum: null,
    maximum: null,
    valeur: '0 0 23 * * *'
  }
];

describe('ParametreListComponent', () => {
  let fixture: ComponentFixture<ParametreListComponent>;
  let service: { findAll: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { findAll: vi.fn().mockReturnValue(of(PARAMETRES)), update: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ParametreService, useValue: service },
        { provide: AuthService, useValue: { hasPermission: () => true } }
      ]
    });
  });

  async function afficher(): Promise<void> {
    fixture = TestBed.createComponent(ParametreListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('charge et affiche les paramètres du serveur', async () => {
    await afficher();

    expect(service.findAll).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Paramètres');
    const titres = fixture.nativeElement.querySelectorAll('app-parametre-item h2') as NodeListOf<Element>;
    expect(Array.from(titres).map((h) => h.textContent)).toEqual(PARAMETRES.map((p) => p.libelle));
  });

  it('distingue une erreur réseau d’une liste réellement vide et permet de réessayer', async () => {
    service.findAll.mockReturnValueOnce(throwError(() => new Error('Réponse API invalide'))).mockReturnValueOnce(of(PARAMETRES));
    await afficher();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger les paramètres');
    expect(fixture.nativeElement.textContent).not.toContain('Aucun paramètre disponible.');

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('app-parametre-item h2')).toHaveLength(2);
    expect(service.findAll).toHaveBeenCalledTimes(2);
  });
});
