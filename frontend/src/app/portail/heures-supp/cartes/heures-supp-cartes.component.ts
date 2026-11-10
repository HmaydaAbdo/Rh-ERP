import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { cleIds, Dimension, LIBELLES_DIMENSIONS, Niveau, Portee } from '../../perimetre/perimetre';
import { GroupeCarte, nomGroupe } from '../../perimetre/perimetre-groupes';
import { HeuresSuppSearchCriteria } from '../models/heures-supp.model';
import { libellePeriode } from '../../paie/paie-format';
import { moduleHeuresSupp } from '../heures-supp-module';
import { HeuresSuppService } from '../services/heures-supp.service';

interface Suppression {
  cible: string;
  criteres: HeuresSuppSearchCriteria;
  nombre: number;
  filtres: string[];
}

@Component({
  selector: 'app-heures-supp-cartes',
  imports: [FormField, ButtonComponent, DialogComponent, MessageComponent, CartesPerimetreComponent],
  templateUrl: './heures-supp-cartes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppCartesComponent {
  protected readonly module = moduleHeuresSupp();
  private readonly service = inject(HeuresSuppService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(NotificationService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });
  private readonly cartes = viewChild.required(CartesPerimetreComponent);

  readonly suppression = signal<Suppression | null>(null);
  readonly suppressionEnCours = signal(false);
  private readonly saisieConfirmation = signal({ nombre: '' });
  readonly confirmationForm = form(this.saisieConfirmation);
  readonly confirmationValide = computed(() => {
    const suppression = this.suppression();
    return suppression !== null && this.saisieConfirmation().nombre.trim() === String(suppression.nombre);
  });

  protected peutSupprimer(groupe: GroupeCarte, niveau: Niveau): boolean {
    return this.auth.hasPermission('HEURES_SUP_PURGE')
      && niveau !== 'EMPLOYES'
      && (groupe.heuresSupp?.nombreLignes ?? 0) > 0;
  }

  protected libelleBouton(groupe: GroupeCarte, niveau: Niveau): string {
    if (niveau === 'PERIODE') return `Supprimer les heures supplémentaires de ${groupe.libelle}`;
    const dimension = niveau as Dimension;
    const complement = dimension === 'CHANTIER' ? 'du chantier' : dimension === 'EQUIPE' ? 'de l’équipe' : 'de la fonction';
    return `Supprimer les heures supplémentaires ${complement} ${nomGroupe(dimension, groupe)}`;
  }

  protected demander(groupe: GroupeCarte, niveau: Niveau, periode: string | null, portee: Portee): void {
    const params = this.params();
    let criteres: HeuresSuppSearchCriteria;
    let cible: string;
    if (niveau === 'PERIODE') {
      const mois = groupe.code;
      if (!mois) return;
      criteres = this.module.critereHeuresSupp!(params, portee, mois);
      cible = `Mois : ${groupe.libelle}`;
    } else {
      if (!periode) return;
      const dimension = niveau as Dimension;
      criteres = this.module.critereHeuresSupp!(params, { ...portee, [cleIds(dimension)]: [groupe.id] }, periode);
      cible = `${LIBELLES_DIMENSIONS[dimension]} ${nomGroupe(dimension, groupe)}, ${libellePeriode(periode)}`;
    }
    this.viderConfirmation();
    this.suppression.set({ cible, criteres, nombre: groupe.heuresSupp?.nombreLignes ?? 0, filtres: this.decrireFiltres(criteres) });
  }

  protected annulerSuppression(): void {
    if (!this.suppressionEnCours()) {
      this.suppression.set(null);
      this.viderConfirmation();
    }
  }

  protected confirmerSuppression(): void {
    const suppression = this.suppression();
    if (!suppression || !this.confirmationValide() || this.suppressionEnCours()) return;
    this.suppressionEnCours.set(true);
    this.service.supprimerGroupe(suppression.criteres, suppression.nombre)
      .pipe(finalize(() => this.suppressionEnCours.set(false)))
      .subscribe({
        next: (supprimees) => {
          this.messages.add({
            severity: 'success',
            summary: 'Heures supplémentaires supprimées',
            detail: `${supprimees} ligne(s) supprimée(s) — ${suppression.cible}`,
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

  private decrireFiltres(criteres: HeuresSuppSearchCriteria): string[] {
    const lignes: string[] = [];
    if (criteres.nomPrenom) lignes.push(`Nom et prénom contient « ${criteres.nomPrenom} »`);
    if (criteres.cin) lignes.push(`CIN contient « ${criteres.cin} »`);
    const compter = (ids: number[] | undefined): number => ids?.length ?? 0;
    if (compter(criteres.chantierIds) > 1) lignes.push(`${compter(criteres.chantierIds)} chantiers sélectionnés`);
    if (compter(criteres.equipeIds) > 1) lignes.push(`${compter(criteres.equipeIds)} équipes sélectionnées`);
    if (compter(criteres.fonctionIds) > 1) lignes.push(`${compter(criteres.fonctionIds)} fonctions sélectionnées`);
    return lignes;
  }
}
