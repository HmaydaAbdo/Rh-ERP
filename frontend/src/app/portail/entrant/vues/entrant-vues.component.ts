import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { registerFrontendTool } from '@copilotkit/angular';

import { AuthService } from '../../../core/auth/services/auth.service';
import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/ui/collection-shell/collection-shell.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { EmployeeFiltres } from '../../employee/filtres/employee-filtres';
import { MouvementBarreComponent } from '../../mouvement/barre/mouvement-barre.component';
import { EntrantEtat } from '../entrant-etat';
import { outilFiltresEntrants } from '../filtres/entrant-outils-assistant';
import { OPTIONS_TYPE } from '../list/entrant-list.component';

const CONFIGURATION_ENTRANT: CollectionShellConfig = {
  titre: 'Entrants',
  libelleVue: 'Vues des entrants',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/entrants' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/entrants/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/entrants/analytique' }
  ]
};

/**
 * Coque des trois vues des entrants : titre, onglets, barre du mois et des filtres (dans l'URL) et export PDF, une seule fois
 * pour toutes les vues. L'état du mois (`EntrantEtat`) est fourni ici : il est chargé une fois et lu par chaque vue.
 */
@Component({
  selector: 'app-entrant-vues',
  imports: [CollectionShellComponent, MouvementBarreComponent, SelectComponent],
  providers: [EntrantEtat],
  template: `
    <app-collection-shell [configuration]="configuration">
      <app-mouvement-barre
        collection-filters
        [periode]="etat.filtres().periode"
        [filtres]="etat.filtres().employes"
        [exportVisible]="peutExporter"
        [exportEnCours]="etat.exportEnCours()"
        (periodeChange)="choisirMois($event)"
        (filtresChange)="changerEmployes($event)"
        (exporter)="etat.exporter()"
      >
        <stp-select
          [value]="etat.filtres().valeurs"
          (valueChange)="changerTypes($event)"
          [options]="optionsType"
          [multiple]="true"
          summaryLabel="{0} types"
          ariaLabel="Type d’entrée"
          placeholder="Type d’entrée"
        ></stp-select>
      </app-mouvement-barre>
    </app-collection-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrantVuesComponent {
  protected readonly configuration = CONFIGURATION_ENTRANT;
  protected readonly etat = inject(EntrantEtat);
  protected readonly optionsType = OPTIONS_TYPE;
  private readonly auth = inject(AuthService);
  protected readonly peutExporter = this.auth.hasPermission('EMPLOYEE_EXPORT');

  constructor() {
    // L'agent peut régler les filtres de cette page (outil côté navigateur, retiré avec la page) ; réservé au droit IA.
    if (this.auth.hasPermission('IA_UTILISER')) {
      registerFrontendTool(outilFiltresEntrants(() => this.etat.filtres(), (filtres) => this.etat.appliquer(filtres)));
    }
  }

  protected choisirMois(periode: string): void {
    this.etat.appliquer({ ...this.etat.filtres(), periode }, false);
  }

  protected changerEmployes(employes: EmployeeFiltres): void {
    this.etat.appliquer({ ...this.etat.filtres(), employes });
  }

  protected changerTypes(valeur: unknown): void {
    this.etat.appliquer({ ...this.etat.filtres(), valeurs: Array.isArray(valeur) ? (valeur as string[]) : [] });
  }
}
