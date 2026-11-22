import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, viewChild } from '@angular/core';

import { ConfirmDialogService } from '../../../shared/ui/feedback/feedback.service';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { Paie } from '../models/paie.model';
import { PaieFormComponent } from './paie-form.component';

/**
 * Création et modification d'un bulletin de paie en fenêtre de dialogue, dans la conversation de l'assistant (KAN-310, décision
 * du propriétaire du 2026-11-21) : le formulaire de la page (`PaieFormComponent`) est réutilisé tel quel. La fenêtre est modale
 * (focus piégé, Échap, focus rendu au bouton qui l'a ouverte : `stp-dialog`, fondé sur le CDK) ; fermer avec une saisie non
 * enregistrée demande confirmation, la création garde un brouillon dans le navigateur, et le formulaire n'existe que fenêtre
 * ouverte, donc un nouveau bulletin repart d'un formulaire neuf (ou du brouillon). L'agent n'écrit rien : seuls les clics
 * de l'utilisateur, avec ses droits, enregistrent.
 */
@Component({
  selector: 'app-paie-form-dialog',
  imports: [DialogComponent, PaieFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <stp-dialog [header]="titre()" width="min(64rem, calc(100vw - 2rem))" [(open)]="ouvert" [avantFermeture]="garde">
      @if (ouvert()) {
        <app-paie-form
          [integre]="true"
          [paieIdEntree]="paieId()"
          (enregistre)="surEnregistrement($event)"
          (annule)="fermer()"
        />
      }
    </stp-dialog>
  `
})
export class PaieFormDialogComponent {
  /** Fenêtre ouverte ou non. */
  readonly ouvert = model(false);
  /** Bulletin à modifier ; absent : nouveau bulletin. */
  readonly paieId = input<number | null>(null);
  /** Un bulletin a été créé ou modifié : les vues de la conversation doivent se recharger. */
  readonly enregistre = output<Paie>();

  private readonly confirmation = inject(ConfirmDialogService);
  private readonly formulaire = viewChild(PaieFormComponent);

  protected readonly titre = computed(() => (this.paieId() === null ? 'Nouveau bulletin de paie' : 'Modifier le bulletin'));

  /** Garde de fermeture du bouton Fermer, d'Échap et d'Annuler : une saisie non enregistrée demande confirmation. */
  protected readonly garde = (): Promise<boolean> => {
    const formulaire = this.formulaire();
    if (!formulaire?.saisieNonEnregistree()) {
      return Promise.resolve(true);
    }
    const creation = this.paieId() === null;
    return new Promise<boolean>((resoudre) =>
      this.confirmation.confirm({
        header: 'Fermer sans enregistrer ?',
        message: creation
          ? 'Ce bulletin n’est pas enregistré. Votre saisie reste gardée en brouillon dans ce navigateur : elle sera reprise à la prochaine ouverture.'
          : 'Les modifications de ce bulletin seront perdues.',
        acceptLabel: 'Fermer',
        rejectLabel: 'Rester',
        accept: () => resoudre(true),
        reject: () => resoudre(false)
      })
    );
  };

  protected fermer(): void {
    const garde = this.garde();
    void garde.then((fermer) => fermer && this.ouvert.set(false));
  }

  protected surEnregistrement(paie: Paie): void {
    this.ouvert.set(false);
    this.enregistre.emit(paie);
  }
}
