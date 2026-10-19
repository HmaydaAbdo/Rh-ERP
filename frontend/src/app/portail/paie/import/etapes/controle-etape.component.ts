import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { DateInputComponent } from '../../../../shared/ui/date-input/date-input.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../../../shared/ui/select/select.component';
import { TypeSalaire } from '../../../employee/models/employee.model';
import { PaieImportChamp } from '../../models/paie.model';
import { fichierChoisi, PaieImportStore } from '../paie-import.store';

const LIBELLES_CHAMPS: Record<PaieImportChamp, string> = {
  nomPrenom: 'Nom',
  fonction: 'Fonction',
  chantier: 'Chantier',
  equipe: 'Équipe',
  salaire: 'Salaire'
};

const TYPES_SALAIRE: { label: string; value: TypeSalaire }[] = [
  { label: 'Mensuel', value: 'MENSUEL' },
  { label: 'Journalier', value: 'JOURNALIER' }
];

/**
 * Étape « Contrôle » de l'assistant d'import (voir `PaieImportWizardComponent`) : chaque problème est rangé avec la façon de
 * le régler — erreurs à corriger dans le fichier (qu'on réimporte d'ici), CIN sans fiche à créer, fiches différentes du
 * fichier à mettre à jour. L'état et les appels sont dans `PaieImportStore`.
 */
@Component({
  selector: 'app-paie-import-etape-controle',
  imports: [DecimalPipe, ButtonComponent, DateInputComponent, IconComponent, SelectComponent],
  templateUrl: './controle-etape.component.html',
  styleUrl: './controle-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieImportEtapeControleComponent {
  protected readonly store = inject(PaieImportStore);
  protected readonly libellesChamps = LIBELLES_CHAMPS;
  protected readonly typesSalaire = TYPES_SALAIRE;

  protected surFichier(evenement: Event): void {
    const fichier = fichierChoisi(evenement);
    if (fichier) {
      this.store.analyser(fichier);
    }
  }

  /** Un écart de salaire se lit en montant ; les autres champs tels quels ; une valeur absente s'écrit « — ». */
  protected valeur(champ: PaieImportChamp, valeur: string | null): string {
    if (valeur === null || valeur === '') {
      return '—';
    }
    return champ === 'salaire' ? Number(valeur).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : valeur;
  }

  protected salaireChange(champs: { champ: PaieImportChamp }[]): boolean {
    return champs.some((c) => c.champ === 'salaire');
  }
}
