import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { cleIds, Dimension, LIBELLES_DIMENSIONS, Niveau, Portee } from '../../perimetre/perimetre';
import { GroupeCarte, nomGroupe } from '../../perimetre/perimetre-groupes';
import { PaieSearchCriteria } from '../models/paie.model';
import { libellePeriode } from '../paie-format';
import { MODULE_PAIE } from '../paie-module';
import { PaieService } from '../services/paie.service';

/** Une suppression en groupe en attente de confirmation : ce qui sera supprimé, décrit pour l'utilisateur. */
interface Suppression {
  /** Le groupe visé, en une ligne (« Mois : août 2026 », « Chantier C168, août 2026 »…). */
  cible: string;
  criteres: PaieSearchCriteria;
  /** Nombre de bulletins que la carte comptait : celui que l'utilisateur doit retaper, et que le serveur revérifie. */
  nombre: number;
  /** Les filtres qui restreignent le groupe, un par ligne. */
  filtres: string[];
}

/**
 * Vue Cartes de la paie : le parcours guidé (mois, chantier, équipe, fonction, employés) est celui
 * des vues partagées (voir `portail/perimetre/`). Ce composant n'ajoute que ce qui est propre à la paie : sur chaque carte,
 * la **suppression d'un coup** des bulletins qu'elle compte (permission `PAIE_PURGE`, distincte de `PAIE_DELETE` qui ne couvre
 * qu'un bulletin), après une confirmation qui demande de retaper leur nombre (voir docs/paie/README.md, « Suppression en groupe »).
 */
@Component({
  selector: 'app-paie-cartes',
  imports: [FormField, ButtonComponent, DialogComponent, IconComponent, CartesPerimetreComponent],
  templateUrl: './paie-cartes.component.html',
  styleUrl: './paie-cartes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieCartesComponent {
  protected readonly module = MODULE_PAIE;
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(NotificationService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });
  private readonly cartes = viewChild.required(CartesPerimetreComponent);

  readonly suppression = signal<Suppression | null>(null);
  readonly suppressionEnCours = signal(false);
  private readonly saisieConfirmation = signal({ nombre: '' });
  readonly confirmationForm = form(this.saisieConfirmation);
  /** La suppression n'est possible qu'une fois son nombre de bulletins retapé à l'identique. */
  readonly confirmationValide = computed(() => {
    const suppression = this.suppression();
    return suppression !== null && this.saisieConfirmation().nombre.trim() === String(suppression.nombre);
  });

  /** La suppression en groupe a sa permission propre : supprimer un bulletin (PAIE_DELETE) ne suffit pas. */
  canPurge(): boolean {
    return this.authService.hasPermission('PAIE_PURGE');
  }

  /** Une carte se supprime si elle compte des bulletins ; les bulletins sans équipe ne se ciblent pas ainsi (l'API ne sait pas les isoler). */
  peutSupprimer(groupe: GroupeCarte, niveau: Niveau): boolean {
    return this.canPurge() && (groupe.paie?.effectif ?? 0) > 0 && niveau !== 'EMPLOYES' && !(niveau === 'EQUIPE' && groupe.id === 0);
  }

  libelleBouton(groupe: GroupeCarte, niveau: Niveau): string {
    return niveau === 'PERIODE' ? `Supprimer les bulletins de ${groupe.libelle}` : `Supprimer les bulletins de ${LIBELLES_DIMENSIONS[niveau as Dimension].toLowerCase()} ${nomGroupe(niveau as Dimension, groupe)}`;
  }

  /** Demande la suppression des bulletins que comptait la carte : ceux du mois, du groupe et des filtres de la barre. */
  demander(groupe: GroupeCarte, niveau: Niveau, periode: string | null, portee: Portee): void {
    const params = this.params();
    let criteres: PaieSearchCriteria;
    let cible: string;
    if (niveau === 'PERIODE') {
      criteres = this.module.criterePaie(params, portee, groupe.code);
      cible = `Mois : ${groupe.libelle}`;
    } else {
      const dimension = niveau as Dimension;
      criteres = this.module.criterePaie(params, { ...portee, [cleIds(dimension)]: [groupe.id] }, periode);
      cible = `${LIBELLES_DIMENSIONS[dimension]} ${nomGroupe(dimension, groupe)}, ${libellePeriode(periode)}`;
    }
    this.viderConfirmation();
    this.suppression.set({ cible, criteres, nombre: groupe.paie?.effectif ?? 0, filtres: this.decrireFiltres(criteres) });
  }

  annulerSuppression(): void {
    if (!this.suppressionEnCours()) {
      this.suppression.set(null);
      this.viderConfirmation();
    }
  }

  confirmerSuppression(): void {
    const suppression = this.suppression();
    if (!suppression || !this.confirmationValide() || this.suppressionEnCours()) {
      return;
    }
    this.suppressionEnCours.set(true);
    this.paieService
      .supprimerGroupe({ criteres: suppression.criteres, nombreAttendu: suppression.nombre })
      .pipe(finalize(() => this.suppressionEnCours.set(false)))
      .subscribe({
        next: (resultat) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Bulletins supprimés',
            detail: `${resultat.supprimes} bulletin(s) supprimé(s) — ${suppression.cible}`,
            life: 6000
          });
          this.suppression.set(null);
          this.viderConfirmation();
          this.cartes().recharger();
        }
      });
  }

  private viderConfirmation(): void {
    this.confirmationForm().reset({ nombre: '' });
  }

  /** Les filtres qui restreignent le groupe, hors le mois et le groupe visé eux-mêmes — à relire avant de confirmer. */
  private decrireFiltres(criteres: PaieSearchCriteria): string[] {
    const lignes: string[] = [];
    if (criteres.nomPrenom) {
      lignes.push(`Nom et prénom contient « ${criteres.nomPrenom} »`);
    }
    if (criteres.cin) {
      lignes.push(`CIN contient « ${criteres.cin} »`);
    }
    const nombre = (ids: number[] | undefined): number => ids?.length ?? 0;
    if (nombre(criteres.fonctionIds) > 1) {
      lignes.push(`${nombre(criteres.fonctionIds)} fonctions sélectionnées`);
    }
    if (nombre(criteres.chantierIds) > 1) {
      lignes.push(`${nombre(criteres.chantierIds)} chantiers sélectionnés`);
    }
    if (nombre(criteres.equipeIds) > 1) {
      lignes.push(`${nombre(criteres.equipeIds)} équipes sélectionnées`);
    }
    return lignes;
  }
}
