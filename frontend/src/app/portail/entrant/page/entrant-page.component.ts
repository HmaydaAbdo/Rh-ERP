import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent, BadgeSeverity } from '../../../shared/ui/badge/badge.component';
import { ColumnChooserComponent } from '../../../shared/ui/column-chooser/column-chooser.component';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { telechargerFichier } from '../../../shared/utils/telecharger-fichier';
import { EmployeeFiltres } from '../../employee/filtres/employee-filtres';
import { MouvementBarreComponent } from '../../mouvement/barre/mouvement-barre.component';
import { lireMouvementFiltres, moisCourant, MouvementFiltres, versParametresMouvement, versRequete } from '../../mouvement/mouvement-filtres';
import { libellePeriode } from '../../paie/paie-format';
import { Entrant, EntrantsMois, TypeEntree } from '../models/entrant.model';
import { EntrantService } from '../services/entrant.service';

const LIBELLES_TYPE: Record<TypeEntree, string> = { NOUVELLE_EMBAUCHE: 'Nouvelle embauche', RETOUR: 'Retour' };

/** Options du filtre « Type » : les deux sortes d'entrée connues de l'API. */
export const OPTIONS_TYPE: SelectOption<TypeEntree>[] = [
  { value: 'NOUVELLE_EMBAUCHE', label: LIBELLES_TYPE.NOUVELLE_EMBAUCHE },
  { value: 'RETOUR', label: LIBELLES_TYPE.RETOUR }
];

export function libelleType(type: TypeEntree): string {
  return LIBELLES_TYPE[type];
}

/** Une nouvelle embauche est une bonne nouvelle à saluer ; un retour se lit comme une information neutre. */
export function severiteType(type: TypeEntree): BadgeSeverity {
  return type === 'NOUVELLE_EMBAUCHE' ? 'success' : 'info';
}

/**
 * Entrants : qui est payé le mois choisi sans l'avoir été le mois civil précédent, nouvelle embauche ou retour. Même organisation
 * que « STC / Sortie » : titre, barre du mois et des filtres (dans l'URL), chiffres du mois, puis le tableau ; le PDF exporté
 * regroupe par chantier ce que l'écran affiche. Quand le mois ou le mois précédent n'a aucune paie, on ne peut pas dire qui
 * entre : l'écran l'explique au lieu de lister tout le monde.
 */
@Component({
  selector: 'app-entrant-page',
  imports: [DecimalPipe, BadgeComponent, ColumnChooserComponent, MessageComponent, MouvementBarreComponent, RouterLink, SelectComponent, TableComponent, TableCellDirective],
  templateUrl: './entrant-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrantPageComponent {
  private readonly service = inject(EntrantService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private requete: Subscription | null = null;

  protected readonly peutExporter = inject(AuthService).hasPermission('EMPLOYEE_EXPORT');
  protected readonly filtres = signal<MouvementFiltres>(lireMouvementFiltres(this.route.snapshot.queryParamMap, moisCourant()));
  protected readonly resultat = signal<EntrantsMois | null>(null);
  protected readonly chargement = signal(false);
  protected readonly exportEnCours = signal(false);

  protected readonly libelleMois = computed(() => libellePeriode(this.filtres().periode));
  protected readonly lignes = computed<Entrant[]>(() => this.resultat()?.entrants ?? []);
  protected readonly optionsType = OPTIONS_TYPE;

  /** Les chiffres du mois, calculés sur les lignes affichées. */
  protected readonly chiffres = computed(() => {
    const resultat = this.resultat();
    if (!resultat?.comparable) {
      return null;
    }
    const montants = resultat.entrants.map((e) => e.montantBulletin).filter((m): m is number => m !== null && m !== undefined);
    return {
      nombre: resultat.nombre,
      nouvelles: resultat.nouvellesEmbauches,
      retours: resultat.retours,
      chantiers: new Set(resultat.entrants.map((e) => e.chantierId)).size,
      montant: montants.length > 0 ? montants.reduce((a, b) => a + b, 0) : null
    };
  });

  protected readonly libelleType = libelleType;
  protected readonly severiteType = severiteType;
  protected readonly libellePeriode = libellePeriode;

  protected readonly colonnes = new ColumnState([
    { field: 'nomPrenom', header: 'Nom et prénom', minWidth: 220, cellClass: 'font-semibold' },
    { field: 'cin', header: 'CIN', minWidth: 110 },
    { field: 'type', header: 'Type d’entrée', shortHeader: 'Type', minWidth: 150 },
    { field: 'fonction', header: 'Fonction', minWidth: 170 },
    { field: 'chantier', header: 'Chantier', minWidth: 120 },
    { field: 'chantierDesignation', header: 'Désignation du chantier', shortHeader: 'Désign. chantier', minWidth: 190 },
    { field: 'equipe', header: 'Équipe', minWidth: 130 },
    { field: 'dateEmbauche', header: 'Date d’embauche', shortHeader: 'Embauche', minWidth: 120 },
    { field: 'chantierPrecedent', header: 'Venant de (dernier chantier)', shortHeader: 'Venant de', minWidth: 140 },
    { field: 'dernierePaiePrecedente', header: 'Dernier bulletin avant', shortHeader: 'Dern. bulletin', minWidth: 130 },
    { field: 'joursTravailles', header: 'Jours travaillés', shortHeader: 'Jours', align: 'text-center', minWidth: 90 },
    { field: 'montantBulletin', header: 'Montant du bulletin (DH)', shortHeader: 'Montant (DH)', align: 'text-end', cellClass: 'font-bold', minWidth: 130 },
    { field: 'salaire', header: 'Salaire de la fiche (DH)', shortHeader: 'Salaire (DH)', align: 'text-end', minWidth: 120 },
    { field: 'observation', header: 'Observation du bulletin', shortHeader: 'Obs', minWidth: 150 },
    { field: 'statutActuel', header: 'Situation actuelle', shortHeader: 'Situation', minWidth: 150 }
  ]);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const filtres = lireMouvementFiltres(params, moisCourant());
      this.filtres.set(filtres);
      this.charger(filtres);
    });
    this.destroyRef.onDestroy(() => this.requete?.unsubscribe());
  }

  protected choisirMois(periode: string): void {
    this.appliquer({ ...this.filtres(), periode }, false);
  }

  protected changerEmployes(employes: EmployeeFiltres): void {
    this.appliquer({ ...this.filtres(), employes });
  }

  protected changerTypes(valeur: unknown): void {
    this.appliquer({ ...this.filtres(), valeurs: Array.isArray(valeur) ? (valeur as string[]) : [] });
  }

  /** Le mois et les filtres deviennent l'URL de l'écran ; c'est son changement qui recharge la liste. */
  private appliquer(filtres: MouvementFiltres, remplacer = true): void {
    void this.router.navigate([], { replaceUrl: remplacer, queryParams: versParametresMouvement(filtres), queryParamsHandling: 'merge' });
  }

  protected exporter(): void {
    const filtres = this.filtres();
    this.exportEnCours.set(true);
    this.service
      .exporterPdf(versRequete(filtres, 'types'))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.exportEnCours.set(false))
      )
      .subscribe({
        next: (pdf) => telechargerFichier(pdf, `Entrants_${filtres.periode}.pdf`),
        error: () => this.notifications.add({ severity: 'error', summary: 'Impossible de générer le PDF des entrants.' })
      });
  }

  private charger(filtres: MouvementFiltres): void {
    this.requete?.unsubscribe();
    this.chargement.set(true);
    this.requete = this.service
      .entrantsDuMois(versRequete(filtres, 'types'))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.chargement.set(false))
      )
      .subscribe({
        next: (resultat) => this.resultat.set(resultat),
        error: () => {
          this.resultat.set(null);
          this.notifications.add({ severity: 'error', summary: 'Impossible de charger les entrants du mois.' });
        }
      });
  }
}
