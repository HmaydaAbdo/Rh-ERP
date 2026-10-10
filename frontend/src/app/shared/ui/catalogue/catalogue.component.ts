import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';

import { ColumnState } from '../../table/table-columns';
import { BadgeComponent } from '../badge/badge.component';
import { ButtonComponent } from '../button/button.directive';
import { DialogComponent } from '../dialog/dialog.component';
import { MenuAction, MenuButtonComponent } from '../menu/menu-button.component';
import { SplitButtonComponent } from '../menu/split-button.component';
import { SelectComponent, SelectOption } from '../select/select.component';
import { TableCellDirective, TableComponent, TableRowActionsDirective } from '../table/table.component';

interface Ligne {
  id: number;
  nom: string;
  fonction: string;
  actif: boolean;
}

/**
 * Catalogue des composants Staport (voir `conventions/design-system.md`) : chaque composant partagé y est montré dans ses états
 * pour être vérifié au clavier, en thème clair et sombre, sans backend. Route `/catalogue` disponible en développement seulement.
 */
@Component({
  selector: 'app-catalogue',
  imports: [
    FormField,
    BadgeComponent,
    ButtonComponent,
    DialogComponent,
    MenuButtonComponent,
    SplitButtonComponent,
    SelectComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogue.component.html',
  host: { class: 'block p-6' }
})
export class CatalogueComponent {
  protected readonly dialogOpen = signal(false);
  protected readonly last = signal('');

  protected readonly actions: MenuAction[] = [
    { label: 'Télécharger le modèle', icon: 'download', command: () => this.last.set('modèle') },
    { label: 'Exporter', icon: 'file-spreadsheet', command: () => this.last.set('export') }
  ];

  protected readonly options: SelectOption<number>[] = [
    { label: 'Chantier Marrakech', value: 1 },
    { label: 'Chantier Casablanca', value: 2 },
    { label: 'Autoroute Rabat–Fès', value: 3 },
    { label: 'Barrage Souss', value: 4 }
  ];

  protected readonly valeurs = signal<{ simple: number | null; multiple: number[]; recherche: number | null }>({ simple: 2, multiple: [1, 3], recherche: null });
  protected readonly formulaire = form(this.valeurs);

  protected readonly columns = new ColumnState([
    { field: 'nom', header: 'Nom' },
    { field: 'fonction', header: 'Fonction' },
    { field: 'actif', header: 'Statut' }
  ]);

  protected readonly lignes: Ligne[] = Array.from({ length: 27 }, (_, index) => ({
    id: index + 1,
    nom: `Employé ${String(index + 1).padStart(2, '0')}`,
    fonction: ['CH. CAMION', 'OP. PELLE', 'MAÇON'][index % 3],
    actif: index % 4 !== 0
  }));
}
