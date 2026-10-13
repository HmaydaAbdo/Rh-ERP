import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, FormField, required } from '@angular/forms/signals';

import { fournirSignalForms } from '../../forms/signal-forms.config';
import { SelectComponent, SelectOption } from './select.component';

const OPTIONS: SelectOption<number>[] = [
  { label: 'Chantier Marrakech', value: 1 },
  { label: 'Chantier Casablanca', value: 2 },
  { label: 'Autoroute Rabat–Fès', value: 3 },
  { label: 'Barrage Souss', value: 4 }
];

@Component({
  selector: 'app-select-test',
  imports: [SelectComponent, FormField],
  template: `
    <stp-select
      ariaLabel="Chantier"
      placeholder="Choisir"
      summaryLabel="{0} chantiers"
      [formField]="formulaire.choix"
      [options]="options()"
      [selectedOptions]="connus()"
      [multiple]="multiple()"
      [filterable]="filtrable()"
      [externalFilter]="filtreExterne()"
      [clearable]="effacable()"
      [loading]="chargement()"
      (filterChange)="filtres.push($event)"
      (loadMore)="pages.update((n) => n + 1)"
    />
  `
})
class SelectTestComponent {
  readonly modele = signal<{ choix: number | number[] | null }>({ choix: null });
  readonly desactive = signal(false);
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.choix, { message: 'Un chantier est obligatoire.' });
    disabled(chemin.choix, () => this.desactive());
  });
  readonly options = signal(OPTIONS);
  readonly connus = signal<SelectOption<number>[]>([]);
  readonly multiple = signal(false);
  readonly filtrable = signal(false);
  readonly filtreExterne = signal(false);
  readonly effacable = signal(true);
  readonly chargement = signal(false);
  readonly filtres: string[] = [];
  readonly pages = signal(0);
}

describe('SelectComponent', () => {
  let fixture: ComponentFixture<SelectTestComponent>;
  let hote: SelectTestComponent;

  const champ = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const options = () => Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
  const libelles = () => options().map((o) => o.textContent?.trim());
  const valeur = () => hote.modele().choix;

  async function afficher(configurer?: (h: SelectTestComponent) => void): Promise<void> {
    fixture = TestBed.createComponent(SelectTestComponent);
    hote = fixture.componentInstance;
    configurer?.(hote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function ouvrir(): Promise<void> {
    champ().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function choisir(libelle: string): Promise<void> {
    options().find((o) => o.textContent?.includes(libelle))!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function saisir(texte: string): Promise<void> {
    champ().value = texte;
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [fournirSignalForms()] }));

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  describe('sélection simple', () => {
    it('n’attribue pas d’identifiant au champ quand aucun n’est demandé (jamais id="null")', async () => {
      await afficher();

      expect(champ().hasAttribute('id')).toBe(false);
    });

    it('affiche le placeholder, un nom accessible et le rôle combobox', async () => {
      await afficher();

      expect(champ().placeholder).toBe('Choisir');
      expect(champ().getAttribute('aria-label')).toBe('Chantier');
      expect(champ().getAttribute('role')).toBe('combobox');
      expect(champ().getAttribute('aria-expanded')).toBe('false');
    });

    it('s’ouvre au clic et propose chaque option', async () => {
      await afficher();

      await ouvrir();

      expect(champ().getAttribute('aria-expanded')).toBe('true');
      expect(libelles()).toEqual(['Chantier Marrakech', 'Chantier Casablanca', 'Autoroute Rabat–Fès', 'Barrage Souss']);
    });

    it('écrit la valeur de l’option choisie dans le formulaire, affiche son libellé et se referme', async () => {
      await afficher();
      await ouvrir();

      await choisir('Casablanca');

      expect(valeur()).toBe(2);
      expect(champ().value).toBe('Chantier Casablanca');
      expect(options()).toEqual([]);
    });

    it('affiche le libellé d’une valeur écrite par le formulaire (chargement d’un enregistrement)', async () => {
      await afficher();

      hote.modele.set({ choix: 3 });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(champ().value).toBe('Autoroute Rabat–Fès');
    });

    it('garde le libellé d’une valeur qui n’est plus dans la liste filtrée, grâce à `selectedOptions`', async () => {
      await afficher((h) => {
        h.options.set([]);
        h.connus.set([{ label: 'Chantier Marrakech', value: 1 }]);
        h.modele.set({ choix: 1 });
      });

      expect(champ().value).toBe('Chantier Marrakech');
    });

    it('efface la sélection par le bouton dédié', async () => {
      await afficher((h) => h.modele.set({ choix: 2 }));
      const effacer = fixture.nativeElement.querySelector('button[aria-label="Effacer la sélection"]') as HTMLButtonElement;

      effacer.click();
      fixture.detectChanges();

      expect(valeur()).toBeNull();
      expect(champ().value).toBe('');
      expect(fixture.nativeElement.querySelector('button[aria-label="Effacer la sélection"]')).toBeNull();
    });

    it('ne propose pas d’effacer quand `clearable` est faux', async () => {
      await afficher((h) => {
        h.modele.set({ choix: 2 });
        h.effacable.set(false);
      });

      expect(fixture.nativeElement.querySelector('button[aria-label="Effacer la sélection"]')).toBeNull();
    });

    it('marque le champ « touché » quand on le quitte, ce qui révèle l’erreur de la règle', async () => {
      await afficher();
      expect(hote.formulaire.choix().touched()).toBe(false);

      champ().dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(hote.formulaire.choix().touched()).toBe(true);
      expect(hote.formulaire.choix().errors()[0].message).toBe('Un chantier est obligatoire.');
      expect(fixture.nativeElement.querySelector('stp-select').className).toContain('ng-invalid');
    });

    it('ne laisse pas saisir de texte quand il n’est pas filtrable', async () => {
      await afficher();
      const evenement = new Event('beforeinput', { cancelable: true });

      champ().dispatchEvent(evenement);

      expect(evenement.defaultPrevented).toBe(true);
    });

    it('désactivé par le formulaire : ni ouverture ni bouton d’effacement', async () => {
      await afficher((h) => {
        h.modele.set({ choix: 2 });
        h.desactive.set(true);
      });

      expect(champ().getAttribute('aria-disabled')).toBe('true');
      champ().click();
      fixture.detectChanges();
      expect(options()).toEqual([]);
      expect(fixture.nativeElement.querySelector('button[aria-label="Effacer la sélection"]')).toBeNull();
    });

    it('donne le focus au champ (premier champ invalide d’un formulaire refusé)', async () => {
      await afficher();

      hote.formulaire.choix().focusBoundControl();

      expect(document.activeElement).toBe(champ());
    });
  });

  describe('sélection multiple', () => {
    it('coche plusieurs options et écrit un tableau de valeurs', async () => {
      await afficher((h) => h.multiple.set(true));
      await ouvrir();

      expect(document.querySelectorAll('.stp-select__checkbox')).toHaveLength(4);
      expect(document.querySelectorAll('.stp-select__checkbox--checked')).toHaveLength(0);

      await choisir('Marrakech');
      expect(document.querySelectorAll('.stp-select__checkbox--checked')).toHaveLength(1);
      await choisir('Souss');

      expect(valeur()).toEqual([1, 4]);
      expect(champ().value).toBe('2 chantiers');
      expect(document.querySelectorAll('.stp-select__checkbox--checked')).toHaveLength(2);
    });

    it('affiche le libellé seul avec une valeur, puis le résumé à partir de deux', async () => {
      await afficher((h) => {
        h.multiple.set(true);
        h.modele.set({ choix: [3] });
      });
      expect(champ().value).toBe('Autoroute Rabat–Fès');

      hote.modele.set({ choix: [3, 4, 1] });
      fixture.detectChanges();
      expect(champ().value).toBe('3 chantiers');
    });

    it('décoche une option cochée', async () => {
      await afficher((h) => {
        h.multiple.set(true);
        h.modele.set({ choix: [1, 2] });
      });
      await ouvrir();

      await choisir('Marrakech');

      expect(valeur()).toEqual([2]);
    });

    it('garde les valeurs choisies qui ne figurent pas dans les options affichées (autre page, écartées par le filtre)', async () => {
      await afficher((h) => {
        h.multiple.set(true);
        h.options.set(OPTIONS.slice(0, 2));
        h.connus.set([{ label: 'Barrage Souss', value: 4 }]);
        h.modele.set({ choix: [1, 4] });
      });
      await ouvrir();

      await choisir('Casablanca');
      expect(valeur()).toEqual([1, 4, 2]);

      await choisir('Marrakech');
      expect(valeur()).toEqual([4, 2]);
    });

    it('efface toute la sélection', async () => {
      await afficher((h) => {
        h.multiple.set(true);
        h.modele.set({ choix: [1, 2] });
      });

      (fixture.nativeElement.querySelector('button[aria-label="Effacer la sélection"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(valeur()).toEqual([]);
    });
  });

  describe('filtre', () => {
    it('filtre les options à la frappe sans tenir compte des accents ni de la casse', async () => {
      await afficher((h) => h.filtrable.set(true));
      await ouvrir();

      await saisir('FES');

      expect(libelles()).toEqual(['Autoroute Rabat–Fès']);
    });

    it('s’ouvre au clic, sans se refermer au clic suivant (placement du curseur dans la saisie)', async () => {
      await afficher((h) => h.filtrable.set(true));

      await ouvrir();
      expect(champ().getAttribute('aria-expanded')).toBe('true');
      expect(options()).toHaveLength(4);

      await ouvrir();
      expect(champ().getAttribute('aria-expanded')).toBe('true');
    });

    it('annonce l’absence de résultat', async () => {
      await afficher((h) => h.filtrable.set(true));
      await ouvrir();

      await saisir('zzz');

      expect(libelles()).toEqual([]);
      expect(document.querySelector('.stp-select__empty')?.textContent).toBe('Aucun résultat');
    });

    it('signale le chargement quand la liste vient d’une source distante', async () => {
      await afficher((h) => {
        h.filtrable.set(true);
        h.filtreExterne.set(true);
      });
      await ouvrir();
      await saisir('zzz');

      hote.options.set([]);
      hote.chargement.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(document.querySelector('.stp-select__empty')?.textContent).toBe('Chargement…');
      expect(fixture.nativeElement.querySelector('.stp-select__icon.stp-spin')).not.toBeNull();
    });

    it('avec un filtre externe, laisse le parent filtrer : toutes les options restent, la saisie est émise', async () => {
      await afficher((h) => {
        h.filtrable.set(true);
        h.filtreExterne.set(true);
      });
      await ouvrir();

      await saisir('fes');

      expect(libelles()).toHaveLength(4);
      expect(hote.filtres).toContain('fes');
    });

    it('émet un filtre vide à l’effacement', async () => {
      await afficher((h) => {
        h.filtrable.set(true);
        h.filtreExterne.set(true);
        h.modele.set({ choix: 1 });
      });

      (fixture.nativeElement.querySelector('button[aria-label="Effacer la sélection"]') as HTMLButtonElement).click();

      expect(hote.filtres.at(-1)).toBe('');
    });

    it('demande la page suivante quand la liste est défilée jusqu’en bas', async () => {
      await afficher((h) => {
        h.options.set(Array.from({ length: 40 }, (_, i) => ({ label: `Option ${i}`, value: i })));
      });
      await ouvrir();
      const liste = document.querySelector('ul[role="listbox"]') as HTMLElement;
      liste.style.maxHeight = '100px';
      liste.style.overflowY = 'auto';

      liste.scrollTop = liste.scrollHeight;
      liste.dispatchEvent(new Event('scroll'));

      expect(hote.pages()).toBe(1);
    });
  });
});
