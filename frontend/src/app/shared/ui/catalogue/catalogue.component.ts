import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { form, FormField, required } from '@angular/forms/signals';
import type { ChartData, ChartOptions } from 'chart.js';

import { ColumnState } from '../../table/table-columns';
import { BadgeComponent } from '../badge/badge.component';
import { ButtonComponent } from '../button/button.directive';
import { ChartComponent } from '../chart/chart.component';
import { DateInputComponent } from '../date-input/date-input.component';
import { DialogComponent } from '../dialog/dialog.component';
import { FieldErrorComponent } from '../field-error/field-error.component';
import { IconComponent } from '../icon/icon.component';
import { MessageComponent } from '../message/message.component';
import { MenuAction, MenuButtonComponent } from '../menu/menu-button.component';
import { MonthInputComponent } from '../month-input/month-input.component';
import { NumberInputComponent } from '../number-input/number-input.component';
import { PasswordInputComponent } from '../password-input/password-input.component';
import { SplitButtonComponent } from '../menu/split-button.component';
import { SelectComponent, SelectOption } from '../select/select.component';
import { TableCellDirective, TableComponent, TableRowActionsDirective } from '../table/table.component';
import { ThemeService } from '../../../core/theme/theme.service';

interface Ligne {
  id: number;
  nom: string;
  fonction: string;
  actif: boolean;
}

interface ValeursCatalogue {
  simple: number | null;
  multiple: number[];
  recherche: number | null;
  nombre: number | null;
  date: Date | null;
  mois: Date | null;
  motDePasse: string;
  champErreur: string;
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
    ChartComponent,
    DateInputComponent,
    DialogComponent,
    FieldErrorComponent,
    IconComponent,
    MessageComponent,
    MenuButtonComponent,
    MonthInputComponent,
    NumberInputComponent,
    PasswordInputComponent,
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

  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);
  protected readonly valeurs = signal<ValeursCatalogue>({
    simple: 2,
    multiple: [1, 3],
    recherche: null,
    nombre: 12500.5,
    date: new Date(2026, 9, 13),
    mois: new Date(2026, 9, 1),
    motDePasse: 'Staport2026!',
    champErreur: ''
  });
  protected readonly formulaire = form(this.valeurs, (chemin) => {
    required(chemin.champErreur, { message: 'Ce champ est obligatoire.' });
  });

  protected readonly chartData = computed<ChartData<'bar'>>(() => {
    this.theme.theme();
    return {
      labels: ['Août', 'Septembre', 'Octobre'],
      datasets: [{ label: 'Masse salariale (DH)', data: [125000, 143500, 138000], backgroundColor: this.couleurGraphique() }]
    };
  });
  protected readonly chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: true } }
  };

  protected couleurGraphique(): string {
    this.theme.theme();
    return this.document.defaultView?.getComputedStyle(this.document.documentElement).getPropertyValue('--chart-1').trim() ?? '';
  }

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
