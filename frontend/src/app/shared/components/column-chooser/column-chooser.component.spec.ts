import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ColumnState } from '../../table/table-columns';
import { ColumnChooserComponent } from './column-chooser.component';

@Component({
  selector: 'app-colonnes-test',
  imports: [ColumnChooserComponent],
  template: `<app-column-chooser [state]="etat()" />`
})
class ColonnesTestComponent {
  readonly etat = signal(
    new ColumnState([
      { field: 'nom', header: 'Nom' },
      { field: 'cin', header: 'CIN' },
      { field: 'fonction', header: 'Fonction' }
    ])
  );
}

describe('ColumnChooserComponent', () => {
  let fixture: ComponentFixture<ColonnesTestComponent>;
  let hote: ColonnesTestComponent;
  const champ = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const options = () => Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
  const visibles = () => hote.etat().visible.map((c) => c.field);

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function afficher(): Promise<void> {
    fixture = TestBed.createComponent(ColonnesTestComponent);
    hote = fixture.componentInstance;
    await stabiliser();
  }

  async function ouvrir(): Promise<void> {
    champ().click();
    await stabiliser();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it('résume le nombre de colonnes visibles et nomme le choix', async () => {
    await afficher();

    expect(champ().value).toBe('Colonnes (3)');
    expect(champ().getAttribute('aria-label')).toBe('Choisir les colonnes visibles');
  });

  it('liste toutes les colonnes, cochées quand elles sont visibles', async () => {
    await afficher();

    await ouvrir();

    expect(options().map((o) => o.textContent?.trim())).toEqual(['Nom', 'CIN', 'Fonction']);
    expect(options().every((o) => o.getAttribute('aria-selected') === 'true')).toBe(true);
  });

  it('masque une colonne décochée', async () => {
    await afficher();
    await ouvrir();

    options()[1].click();
    await stabiliser();

    expect(visibles()).toEqual(['nom', 'fonction']);
    expect(champ().value).toBe('Colonnes (2)');
  });

  it('garde toujours au moins une colonne : la dernière décochée est rétablie', async () => {
    await afficher();
    await ouvrir();
    options()[1].click();
    await stabiliser();
    options()[2].click();
    await stabiliser();

    options()[0].click();
    await stabiliser();

    expect(visibles()).toEqual(['nom']);
    expect(champ().value).toBe('Colonnes (1)');
  });

  it('réaffiche une colonne cochée de nouveau, à sa place', async () => {
    await afficher();
    await ouvrir();
    options()[0].click();
    await stabiliser();

    options()[0].click();
    await stabiliser();

    expect(visibles()).toEqual(['nom', 'cin', 'fonction']);
  });

  it('suit un nouvel état de colonnes fourni par le parent', async () => {
    await afficher();

    hote.etat.set(new ColumnState([{ field: 'a', header: 'A' }]));
    await stabiliser();

    expect(champ().value).toBe('Colonnes (1)');
  });
});
