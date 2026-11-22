import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { registerFrontendTool } from '@copilotkit/angular';

import { AuthService } from '../../../core/auth/services/auth.service';
import { EtatVue } from '../../../shared/etat-vue/etat-vue';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/ui/collection-shell/collection-shell.component';
import { PaieActionsComponent } from '../actions/paie-actions.component';
import { lireFiltres, PaieFiltres, versParametres } from '../filtres/paie-filtres';
import { PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { PaieService } from '../services/paie.service';
import { outilFiltresPaie } from '../filtres/paie-outils-assistant';

/** Les trois vues de la paie, dans l'ordre des onglets (voir `paie.routes.ts`). */
const CONFIGURATION_PAIE: CollectionShellConfig = {
  titre: 'Paie',
  libelleVue: 'Vue de la paie',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/paie' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/paie/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/paie/analytique' }
  ]
};

/**
 * Coque des trois vues de la paie (tabulaire, cartes, analytique) : le titre, le sélecteur de vue, les actions (Exporter,
 * Importer, Nouveau bulletin — à droite, au niveau du titre et des onglets) et la barre de filtres,
 * une seule fois pour toutes — la même barre, entièrement visible, dans les trois vues. Les filtres sont dans l'URL (voir `filtres/paie-filtres.ts`) : la barre les écrit, chaque vue les lit — ce composant ne garde aucun état partagé de plus. Le sélecteur de vue
 * conserve les paramètres d'URL pour garder le même périmètre entre Cartes, Tabulaire et Analytique. Les écrans de saisie
 * (`/paie/new`, `/paie/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-paie-vues',
  imports: [CollectionShellComponent, IconComponent, PaieActionsComponent, PaieFiltresComponent, RouterLink],
  templateUrl: './paie-vues.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieVuesComponent {
  protected readonly configuration = CONFIGURATION_PAIE;
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly etat = inject(EtatVue);
  private readonly auth = inject(AuthService);

  /** Mois qui contiennent de la paie, pour griser les autres dans la barre. */
  protected readonly periodes = signal<string[]>([]);
  protected readonly filtres = computed<PaieFiltres>(() => lireFiltres(this.etat.params()));
  /** L'analytique a besoin d'un mois : la barre ne propose pas de l'effacer. */
  protected readonly moisRequis = signal(false);
  /** Page ouverte par « Agrandir » depuis la conversation (KAN-311) : un lien ramène à la conversation, dont le fil est repris. */
  protected readonly depuisAssistant =
    inject(Router).currentNavigation()?.extras.state?.['depuisAssistant'] === true || history.state?.depuisAssistant === true;
  /** Faux le temps d'un tour d'écran pour recréer la vue affichée (voir `rafraichirVue`). */
  protected readonly vueAffichee = signal(true);

  constructor() {
    // L'agent peut régler les filtres de cette page (outil côté navigateur, retiré avec la page) ; réservé au droit IA.
    if (this.auth.hasPermission('IA_UTILISER')) {
      registerFrontendTool(outilFiltresPaie(() => this.filtres(), () => this.moisRequis(), (filtres) => this.appliquer(filtres)));
    }
  }

  /** Les filtres deviennent l'URL de la vue courante (sans empiler l'historique à chaque saisie) ; ce sont les vues qui réagissent. Le périmètre et le mois restent synchronisés entre les vues. */
  protected appliquer(filtres: PaieFiltres): void {
    this.etat.modifier(versParametres(filtres), { remplacer: true });
  }

  /** Après un import : la vue affichée est recréée, elle recharge donc ses données (et les mois de la barre, voir
   * `surActivation`) sans que chaque vue ait à écouter l'import. */
  protected rafraichirVue(): void {
    this.vueAffichee.set(false);
    setTimeout(() => this.vueAffichee.set(true));
  }

  /** À chaque changement de vue : un import a pu ajouter un mois depuis la dernière fois. */
  protected surActivation(): void {
    const vue = this.route.firstChild?.snapshot.data['vue'];
    this.moisRequis.set(vue === 'analytique');
    this.paieService.listerPeriodes().subscribe((periodes) => this.periodes.set(periodes.map((p) => p.periode)));
  }
}
