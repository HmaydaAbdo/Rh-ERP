import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { soumettre } from '../../../shared/testing/formulaire';
import { ParametreService } from '../services/parametre.service';
import { ParametreItemComponent } from './parametre-item.component';

const PARAMETRE = {
  id: 5,
  cle: 'paie.analytique.pas-tranche',
  libelle: 'Pas des tranches de l’analytique de paie',
  description: 'Largeur des tranches.',
  type: 'ENTIER' as const,
  unite: 'DH',
  minimum: 1,
  maximum: 100000,
  valeur: '500'
};

describe('ParametreItemComponent', () => {
  let fixture: ComponentFixture<ParametreItemComponent>;
  let service: { update: ReturnType<typeof vi.fn> };
  const racine = () => fixture.nativeElement as HTMLElement;
  const valeur = () => racine().querySelector('input') as HTMLInputElement;

  async function afficher(editable = true): Promise<void> {
    service = { update: vi.fn().mockReturnValue(of({ ...PARAMETRE, valeur: '1200' })) };
    TestBed.configureTestingModule({ providers: [{ provide: ParametreService, useValue: service }] });
    fixture = TestBed.createComponent(ParametreItemComponent);
    fixture.componentRef.setInput('parametre', PARAMETRE);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function saisirValeur(texte: string): Promise<void> {
    valeur().value = texte;
    valeur().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('affiche la description, la valeur et les bornes données par le serveur', async () => {
    await afficher();

    expect(racine().querySelector('h2')?.textContent).toBe(PARAMETRE.libelle);
    expect(valeur().value).toBe('500');
    expect(racine().textContent).toContain('Valeur comprise entre 1 et 100000.');
  });

  it('refuse une valeur entière hors bornes sans appeler le serveur', async () => {
    await afficher();
    await saisirValeur('100001');
    soumettre(racine());
    await fixture.whenStable();

    expect(service.update).not.toHaveBeenCalled();
    expect(racine().querySelector('[role="alert"]')?.textContent).toContain('compris entre 1 et 100000');
  });

  it('enregistre une valeur conforme et émet la réponse serveur', async () => {
    await afficher();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await saisirValeur('1200');
    soumettre(racine());
    await fixture.whenStable();

    expect(service.update).toHaveBeenCalledWith(5, { valeur: '1200' });
    expect(saved).toHaveBeenCalledWith({ ...PARAMETRE, valeur: '1200' });
  });

  it('affiche le paramètre en lecture seule sans bouton de sauvegarde', async () => {
    await afficher(false);

    expect(valeur().disabled).toBe(true);
    expect(racine().querySelector('button')).toBeNull();
  });
});
