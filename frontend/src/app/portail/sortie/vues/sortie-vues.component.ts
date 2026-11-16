import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { registerFrontendTool } from '@copilotkit/angular';

import { AuthService } from '../../../core/auth/services/auth.service';
import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/ui/collection-shell/collection-shell.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { EmployeeFiltres } from '../../employee/filtres/employee-filtres';
import { MouvementBarreComponent } from '../../mouvement/barre/mouvement-barre.component';
import { outilFiltresSorties } from '../filtres/sortie-outils-assistant';
import { SortieEtat } from '../sortie-etat';

const CONFIGURATION_SORTIE: CollectionShellConfig = {
  titre: 'STC / Sortie',
  libelleVue: 'Vues des sorties',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/sorties' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/sorties/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/sorties/analytique' }
  ]
};

/**
 * Coque des trois vues des sorties : titre, onglets, barre du mois et des filtres (dans l'URL) et export PDF, une seule fois
 * pour toutes les vues. L'état du mois (`SortieEtat`) est fourni ici : il est chargé une fois et lu par chaque vue.
 */
@Component({
  selector: 'app-sortie-vues',
  imports: [CollectionShellComponent, MouvementBarreComponent, SelectComponent],
  providers: [SortieEtat],
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
          (valueChange)="changerMotifs($event)"
          [options]="etat.optionsMotifs()"
          [multiple]="true"
          summaryLabel="{0} motifs"
          ariaLabel="Motif"
          placeholder="Motif"
        ></stp-select>
      </app-mouvement-barre>
    </app-collection-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortieVuesComponent {
  protected readonly configuration = CONFIGURATION_SORTIE;
  protected readonly etat = inject(SortieEtat);
  private readonly auth = inject(AuthService);
  protected readonly peutExporter = this.auth.hasPermission('EMPLOYEE_EXPORT');

  constructor() {
    // L'agent peut régler les filtres de cette page (outil côté navigateur, retiré avec la page) ; réservé au droit IA.
    if (this.auth.hasPermission('IA_UTILISER')) {
      registerFrontendTool(outilFiltresSorties(() => this.etat.filtres(), (filtres) => this.etat.appliquer(filtres)));
    }
  }

  protected choisirMois(periode: string): void {
    this.etat.appliquer({ ...this.etat.filtres(), periode }, false);
  }

  protected changerEmployes(employes: EmployeeFiltres): void {
    this.etat.appliquer({ ...this.etat.filtres(), employes });
  }

  protected changerMotifs(valeur: unknown): void {
    this.etat.appliquer({ ...this.etat.filtres(), valeurs: Array.isArray(valeur) ? (valeur as string[]) : [] });
  }
}
