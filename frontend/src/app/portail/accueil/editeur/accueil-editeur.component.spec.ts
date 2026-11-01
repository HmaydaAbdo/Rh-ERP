import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Accueil } from '../services/accueil.service';
import { AccueilEditeurComponent } from './accueil-editeur.component';

const ACCUEIL: Accueil = {
  version: 1,
  personnalise: true,
  indicateurs: ['paie.masse', 'paie.effectif'],
  disponibles: [
    { code: 'paie.masse', libelle: 'Masse salariale', description: 'Masse du mois' },
    { code: 'paie.effectif', libelle: 'Bulletins de paie', description: 'Personnes payées' },
    { code: 'employe.effectif', libelle: 'Employés', description: 'Fiches Employé' }
  ]
};

describe('AccueilEditeurComponent', () => {
  let fixture: ComponentFixture<AccueilEditeurComponent>;
  let enregistres: string[][];
  const racine = () => fixture.nativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement;
  const clic = (nom: string) => {
    bouton(nom).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(AccueilEditeurComponent);
    fixture.componentRef.setInput('accueil', ACCUEIL);
    enregistres = [];
    fixture.componentInstance.enregistrer.subscribe((codes) => enregistres.push(codes));
    fixture.detectChanges();
  });

  it('montre les indicateurs affichés dans leur ordre, puis ceux qu’on peut ajouter', () => {
    const titres = Array.from(racine().querySelectorAll('.app-setting h2')).map((h) => h.textContent?.trim());

    expect(titres).toEqual(['Masse salariale', 'Bulletins de paie', 'Employés']);
    expect(bouton('Ajouter Employés')).not.toBeNull();
  });

  it('ne propose pas d’enregistrer tant que rien ne change', () => {
    expect((racine().querySelector('.app-wizard__pied button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('compose le choix : monter, ajouter, retirer, puis enregistrer dans l’ordre voulu', () => {
    clic('Monter Bulletins de paie');
    clic('Ajouter Employés');
    clic('Retirer Masse salariale');
    (racine().querySelector('.app-wizard__pied button') as HTMLButtonElement).click();

    expect(enregistres).toEqual([['paie.effectif', 'employe.effectif']]);
  });

  it('ne déplace pas le premier vers le haut ni le dernier vers le bas', () => {
    expect(bouton('Monter Masse salariale').disabled).toBe(true);
    expect(bouton('Descendre Bulletins de paie').disabled).toBe(true);
  });

  it('propose de rétablir seulement quand l’accueil est personnalisé', () => {
    const textes = () => Array.from(racine().querySelectorAll('.app-wizard__pied button')).map((b) => b.textContent?.trim());
    expect(textes()).toContain('Rétablir tous les indicateurs');

    fixture.componentRef.setInput('accueil', { ...ACCUEIL, personnalise: false });
    fixture.detectChanges();
    expect(textes()).not.toContain('Rétablir tous les indicateurs');
  });
});
