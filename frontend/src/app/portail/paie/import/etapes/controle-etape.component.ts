import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { TableColumn } from '../../../../shared/table/table-columns';
import { TableCellDirective, TableComponent } from '../../../../shared/ui/table/table.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { DateInputComponent } from '../../../../shared/ui/date-input/date-input.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../../../shared/ui/select/select.component';
import { TypeSalaire } from '../../../employee/models/employee.model';
import { PaieImportChamp, PaieImportErreur } from '../../models/paie.model';
import { fichierChoisi, PaieImportStore } from '../paie-import.store';

const LIBELLES_CHAMPS: Record<PaieImportChamp, string> = {
  nomPrenom: 'Nom',
  fonction: 'Fonction',
  chantier: 'Chantier',
  equipe: 'Équipe',
  salaire: 'Salaire'
};

/** Libellés des types d'erreur du fichier, par champ en cause ; un champ inconnu s'affiche tel quel. */
const LIBELLES_ERREURS: Record<string, string> = {
  nomPrenom: 'Nom absent ou trop long',
  cin: 'CIN absent, trop long ou inconnu',
  fonction: 'Fonction absente ou inconnue',
  chantier: 'Chantier absent, inconnu ou clôturé',
  equipe: 'Équipe inconnue',
  observation: 'Observation trop longue',
  autre: 'Autres erreurs'
};

/** Au-delà de ce nombre, les erreurs du fichier se regroupent par type, détail à l'ouverture. */
const SEUIL_GROUPES = 8;

export interface GroupeErreurs {
  champ: string;
  libelle: string;
  erreurs: PaieImportErreur[];
  exemple: PaieImportErreur;
}

const TYPES_SALAIRE: { label: string; value: TypeSalaire }[] = [
  { label: 'Mensuel', value: 'MENSUEL' },
  { label: 'Journalier', value: 'JOURNALIER' }
];

/**
 * Étape « Contrôle » de l'assistant d'import (voir `PaieImportWizardComponent`) : chaque problème est rangé avec la façon de
 * le régler — erreurs à corriger dans le fichier (qu'on réimporte d'ici), chantiers clôturés à rouvrir, CIN sans fiche à créer, fiches différentes du
 * fichier à mettre à jour. L'état et les appels sont dans `PaieImportStore`.
 */
@Component({
  selector: 'app-paie-import-etape-controle',
  imports: [TableComponent, TableCellDirective, DecimalPipe, ButtonComponent, DateInputComponent, IconComponent, SelectComponent],
  templateUrl: './controle-etape.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieImportEtapeControleComponent {
  protected readonly colonnesErreurs: TableColumn[] = [
    { field: 'numeroLigne', header: 'Ligne' },
    { field: 'cin', header: 'CIN' },
    { field: 'nomPrenom', header: 'Nom' },
    { field: 'champ', header: 'Champ' },
    { field: 'valeur', header: 'Valeur reçue' },
    { field: 'raison', header: 'Problème' }
  ];
  protected readonly store = inject(PaieImportStore);
  protected readonly libellesChamps = LIBELLES_CHAMPS;
  protected readonly typesSalaire = TYPES_SALAIRE;
  protected readonly seuilGroupes = SEUIL_GROUPES;
  private readonly groupesOuverts = signal<string[]>([]);

  /** Les erreurs du fichier par type (champ en cause), du plus fréquent au moins fréquent. */
  protected readonly groupesErreurs = computed<GroupeErreurs[]>(() => {
    const groupes = new Map<string, PaieImportErreur[]>();
    for (const erreur of this.store.analyse()?.erreurs ?? []) {
      const cle = erreur.champ ?? 'autre';
      groupes.set(cle, [...(groupes.get(cle) ?? []), erreur]);
    }
    return [...groupes.entries()]
      .map(([champ, erreurs]) => ({ champ, libelle: LIBELLES_ERREURS[champ] ?? champ, erreurs, exemple: erreurs[0] }))
      .sort((a, b) => b.erreurs.length - a.erreurs.length);
  });

  protected readonly avertissementsRegles = computed(
    () => this.store.categories().find((c) => c.cle === 'avertissements')?.nombre === 0
  );

  protected groupeOuvert(champ: string): boolean {
    return this.groupesOuverts().includes(champ);
  }

  protected basculerGroupe(champ: string): void {
    this.groupesOuverts.update((ouverts) => (ouverts.includes(champ) ? ouverts.filter((c) => c !== champ) : [...ouverts, champ]));
  }

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
    return champ === 'salaire' ? Number(valeur).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : valeur;
  }

  protected salaireChange(champs: { champ: PaieImportChamp }[]): boolean {
    return champs.some((c) => c.champ === 'salaire');
  }

  protected confirmerZero(evenement: Event): void {
    this.store.confirmerSalaireZero.set((evenement.target as HTMLInputElement).checked);
  }

  protected confirmerPeriode(evenement: Event): void {
    this.store.confirmerPeriode((evenement.target as HTMLInputElement).checked);
  }
}
