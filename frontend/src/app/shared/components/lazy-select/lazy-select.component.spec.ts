import type { MockedObject } from 'vitest';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { of, Subject } from 'rxjs';

import { LazySelectComponent } from './lazy-select.component';
import { LazySelectPage, LazySelectSource } from './lazy-select.model';

interface Chantier {
  id: number;
  code: string;
}

const TOUS: Chantier[] = Array.from({ length: 70 }, (_, i) => ({ id: i + 1, code: `C${String(i + 1).padStart(3, '0')}` }));

@Component({
  selector: 'app-lazy-test',
  imports: [LazySelectComponent, FormField],
  template: `
    <app-lazy-select
      inputId="chantier"
      ariaLabel="Chantier"
      placeholder="Choisir un chantier"
      optionLabel="code"
      [source]="source"
      [multiple]="multiple()"
      [formField]="formulaire.choix"
    />
  `
})
class LazyTestComponent {
  source!: LazySelectSource<Chantier>;
  readonly multiple = signal(false);
  readonly modele = signal<{ choix: number | number[] | null }>({ choix: null });
  readonly formulaire = form(this.modele);
}

describe('LazySelectComponent', () => {
  let fixture: ComponentFixture<LazyTestComponent>;
  let hote: LazyTestComponent;
  let source: MockedObject<LazySelectSource<Chantier>>;

  const champ = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const options = () => Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim());

  function page(items: Chantier[], total = items.length): LazySelectPage<Chantier> {
    return { items, totalRecords: total };
  }

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function afficher(configurer?: (h: LazyTestComponent) => void): Promise<void> {
    source = {
      fetchPage: vi.fn().mockName('source.fetchPage'),
      fetchById: vi.fn().mockName('source.fetchById')
    } as unknown as MockedObject<LazySelectSource<Chantier>>;
    source.fetchPage.mockImplementation((numero, taille, recherche) => {
      const trouves = TOUS.filter((c) => c.code.includes(recherche.toUpperCase()));
      return of(page(trouves.slice(numero * taille, (numero + 1) * taille), trouves.length));
    });
    source.fetchById.mockImplementation((id) => of(TOUS.find((c) => c.id === Number(id))!));

    fixture = TestBed.createComponent(LazyTestComponent);
    hote = fixture.componentInstance;
    hote.source = source;
    configurer?.(hote);
    await stabiliser();
  }

  async function ouvrir(): Promise<void> {
    champ().click();
    await stabiliser();
  }

  async function saisir(texte: string): Promise<void> {
    champ().value = texte;
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    await stabiliser();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it('charge la première page de 30 dès qu’il est affiché', async () => {
    await afficher();

    expect(source.fetchPage).toHaveBeenCalledTimes(1);
    expect(source.fetchPage).toHaveBeenCalledWith(0, 30, '');
  });

  it('propose les libellés de la colonne demandée et écrit l’identifiant choisi', async () => {
    await afficher();
    await ouvrir();
    expect(options()).toHaveLength(30);
    expect(options()[0]).toBe('C001');

    (document.querySelectorAll('[role="option"]')[2] as HTMLElement).click();
    await stabiliser();

    expect(hote.modele().choix).toBe(3);
    expect(champ().value).toBe('C003');
  });

  it('retrouve le libellé de la valeur d’un enregistrement par son identifiant', async () => {
    await afficher((h) => h.modele.set({ choix: 5 }));

    expect(source.fetchById).toHaveBeenCalledWith(5);
    expect(champ().value).toBe('C005');
  });

  it('réutilise l’option déjà chargée quand l’utilisateur la choisit (aucun aller-retour réseau)', async () => {
    await afficher();
    await ouvrir();

    (document.querySelectorAll('[role="option"]')[4] as HTMLElement).click();
    await stabiliser();

    expect(champ().value).toBe('C005');
    expect(source.fetchById).not.toHaveBeenCalled();
  });

  it('résout par identifiant la valeur absente de la première page (mode édition)', async () => {
    await afficher((h) => h.modele.set({ choix: 64 }));

    expect(source.fetchById).toHaveBeenCalledWith(64);
    expect(champ().value).toBe('C064');
  });

  it('ne garde que la résolution la plus récente quand la valeur change vite', async () => {
    const lente = new Subject<Chantier>();
    await afficher();
    source.fetchById.mockImplementation((id) => (id === 60 ? lente : of(TOUS.find((c) => c.id === Number(id))!)));

    hote.modele.set({ choix: 60 });
    await stabiliser();
    hote.modele.set({ choix: 65 });
    await stabiliser();
    lente.next(TOUS[59]);
    await stabiliser();

    expect(champ().value).toBe('C065');
  });

  it('ne résout pas deux fois la même valeur', async () => {
    await afficher((h) => h.modele.set({ choix: 64 }));

    hote.modele.update((m) => ({ ...m }));
    await stabiliser();

    expect(source.fetchById).toHaveBeenCalledTimes(1);
  });

  it('cherche côté serveur après 300 ms de pause, une seule fois pour une rafale de frappes', async () => {
    await afficher();
    await ouvrir();
    source.fetchPage.mockClear();

    await saisir('C0');
    await saisir('C06');
    expect(source.fetchPage).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await stabiliser();

    expect(source.fetchPage).toHaveBeenCalledTimes(1);
    expect(source.fetchPage).toHaveBeenCalledWith(0, 30, 'C06');
    expect(options()).toHaveLength(10);
  });

  it('charge la page suivante quand la liste est défilée jusqu’en bas, jusqu’à tout avoir', async () => {
    await afficher();
    await ouvrir();
    const liste = document.querySelector('ul[role="listbox"]') as HTMLElement;
    liste.style.maxHeight = '120px';
    liste.style.overflowY = 'auto';

    liste.scrollTop = liste.scrollHeight;
    liste.dispatchEvent(new Event('scroll'));
    await stabiliser();
    expect(source.fetchPage).toHaveBeenLastCalledWith(1, 30, '');
    expect(options()).toHaveLength(60);

    liste.scrollTop = liste.scrollHeight;
    liste.dispatchEvent(new Event('scroll'));
    await stabiliser();
    expect(options()).toHaveLength(70);

    source.fetchPage.mockClear();
    liste.scrollTop = liste.scrollHeight;
    liste.dispatchEvent(new Event('scroll'));
    await stabiliser();
    expect(source.fetchPage).not.toHaveBeenCalled();
  });

  it('en sélection multiple, écrit un tableau d’identifiants et résout chacun', async () => {
    await afficher((h) => {
      h.multiple.set(true);
      h.modele.set({ choix: [2, 64] });
    });

    expect(source.fetchById).toHaveBeenCalledWith(2);
    expect(source.fetchById).toHaveBeenCalledWith(64);

    await ouvrir();
    (document.querySelectorAll('[role="option"]')[0] as HTMLElement).click();
    await stabiliser();

    expect(hote.modele().choix).toEqual([2, 64, 1]);
  });

  it('marque le champ « touché » en le quittant', async () => {
    await afficher();

    champ().dispatchEvent(new Event('blur'));
    await stabiliser();

    expect(hote.formulaire.choix().touched()).toBe(true);
  });

  it('donne le focus au champ interactif', async () => {
    await afficher();

    hote.formulaire.choix().focusBoundControl();

    expect(document.activeElement).toBe(champ());
  });

  it('recharge les options après un changement de source et ignore la réponse précédente', async () => {
    const retardee = new Subject<LazySelectPage<Chantier>>();
    await afficher();
    source.fetchPage.mockReturnValue(retardee);
    await ouvrir();
    await saisir('ancien');
    await new Promise((resolve) => setTimeout(resolve, 350));
    hote.source = {
      fetchPage: () => of(page([{ id: 100, code: 'NOUVEAU' }])),
      fetchById: () => of({ id: 100, code: 'NOUVEAU' })
    };
    await stabiliser();
    retardee.next(page([{ id: 101, code: 'ANCIEN' }]));
    await ouvrir();
    expect(options()).toEqual(['NOUVEAU']);
  });
});
