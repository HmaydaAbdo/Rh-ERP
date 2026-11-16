import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeService } from '../../../core/theme/theme.service';
import { LigneMouvement } from '../mouvement-agregats';
import { MouvementAnalytiqueComponent } from './mouvement-analytique.component';

const LIGNES: LigneMouvement[] = [
  { employeId: 1, nomPrenom: 'A', categorie: 'Retour', categorieCle: 'RETOUR', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'E1', fonctionId: 1, fonction: 'Maçon', montant: 1000 },
  { employeId: 2, nomPrenom: 'B', categorie: 'Nouvelle embauche', categorieCle: 'NOUVELLE_EMBAUCHE', chantierId: 4, chantier: 'C58', fonctionId: 1, fonction: 'Maçon', montant: 2000 }
];

describe('MouvementAnalytiqueComponent', () => {
  let fixture: ComponentFixture<MouvementAnalytiqueComponent>;

  function creer(lignes: LigneMouvement[] = LIGNES): HTMLElement {
    TestBed.configureTestingModule({ providers: [{ provide: ThemeService, useValue: { theme: signal('light') } }] });
    fixture = TestBed.createComponent(MouvementAnalytiqueComponent);
    fixture.componentRef.setInput('lignes', lignes);
    fixture.componentRef.setInput('libelleUnite', 'Entrants');
    fixture.componentRef.setInput('libelleCategorie', 'Type d’entrée');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche les chiffres du mois', () => {
    const chiffres = creer().querySelector('.app-kpis')?.textContent ?? '';

    expect(chiffres).toContain('Entrants du mois');
    expect(chiffres).toContain('Nouvelle embauche 1 · Retour 1');
    expect(chiffres).toContain('Chantiers concernés');
    expect(chiffres).toMatch(/Montant des bulletins\s*3\D?000 DH/);
  });

  it('propose un graphique et son tableau de données par chantier, équipe et fonction', () => {
    const racine = creer();

    expect(Array.from(racine.querySelectorAll('.app-panel h2')).map((h) => h.textContent?.trim())).toEqual(['Répartition par chantier', 'Répartition par équipe', 'Répartition par fonction']);
    expect(racine.querySelectorAll('stp-chart').length).toBe(3);
    expect(racine.querySelectorAll('details.app-data-details').length).toBe(3);
  });

  it('dit qu’il n’y a rien à analyser quand le mois est vide', () => {
    const racine = creer([]);

    expect(racine.textContent).toContain('Aucune donnée pour ce mois');
    expect(racine.querySelector('stp-chart')).toBeNull();
  });
});
