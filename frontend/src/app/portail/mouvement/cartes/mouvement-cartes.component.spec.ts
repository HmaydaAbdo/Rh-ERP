import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LigneMouvement } from '../mouvement-agregats';
import { MouvementCartesComponent } from './mouvement-cartes.component';

const LIGNES: LigneMouvement[] = [
  { employeId: 1, nomPrenom: 'A', categorie: 'Retour', categorieCle: 'RETOUR', chantierId: 3, chantier: 'C57', fonctionId: 1, fonction: 'Maçon', montant: 1000 },
  { employeId: 2, nomPrenom: 'B', categorie: 'Nouvelle embauche', categorieCle: 'NOUVELLE_EMBAUCHE', chantierId: 3, chantier: 'C57', fonctionId: 1, fonction: 'Maçon', montant: 2000 },
  { employeId: 3, nomPrenom: 'C', categorie: 'Retour', categorieCle: 'RETOUR', chantierId: 4, chantier: 'C58', fonctionId: 2, fonction: 'Grutier', montant: null }
];

describe('MouvementCartesComponent', () => {
  let fixture: ComponentFixture<MouvementCartesComponent>;

  function creer(lignes: LigneMouvement[] = LIGNES, message: string | null = null): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(MouvementCartesComponent);
    fixture.componentRef.setInput('lignes', lignes);
    fixture.componentRef.setInput('route', '/entrants');
    fixture.componentRef.setInput('libelleUnite', 'Entrants');
    fixture.componentRef.setInput('libelleCategorie', 'Type d’entrée');
    fixture.componentRef.setInput('message', message);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche une carte par chantier avec le nombre, la répartition et le montant', () => {
    const racine = creer();

    const cartes = Array.from(racine.querySelectorAll('.app-entity'));
    expect(cartes.map((c) => c.querySelector('.app-entity__name')?.textContent?.trim())).toEqual(['C57', 'C58']);
    expect(cartes[0].textContent).toContain('Nouvelle embauche : 1, Retour : 1');
    expect(cartes[0].textContent).toContain('3');
    expect(racine.querySelector('[role="status"]')?.textContent).toContain('3 entrants · 2 groupes');
  });

  it('renvoie vers la liste filtrée sur le groupe, en gardant le mois', () => {
    const racine = creer();

    const lien = racine.querySelector('.app-entity__footer a') as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/entrants?chantierIds=3');
    expect(lien.getAttribute('aria-label')).toBe('Voir la liste : C57');
  });

  it('change de regroupement', () => {
    const racine = creer();

    (fixture.componentInstance as unknown as { changerDimension(v: unknown): void }).changerDimension('categorie');
    fixture.detectChanges();

    expect(Array.from(racine.querySelectorAll('.app-entity__name')).map((n) => n.textContent?.trim())).toEqual(['Retour', 'Nouvelle embauche']);
    expect((racine.querySelector('.app-entity__footer a') as HTMLAnchorElement).getAttribute('href')).toBe('/entrants?valeurs=RETOUR');
  });

  it('explique l’absence de résultat et relaie l’avertissement du domaine', () => {
    const racine = creer([], 'Entrants indisponibles');

    expect(racine.textContent).toContain('Aucun élément ne correspond');
    expect(racine.querySelector('stp-message')?.textContent).toContain('Entrants indisponibles');
  });
});
