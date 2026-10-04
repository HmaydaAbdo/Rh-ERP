import { Component, Input } from '@angular/core';

import { libelleChamp } from '../audit-format';
import { AuditChamp } from '../models/audit.model';

/**
 * Ce qui change dans un enregistrement, champ par champ : avant / après pour une valeur, éléments ajoutés et retirés pour
 * une collection de droits. Les valeurs arrivent déjà formatées du serveur ; une relation s'écrit « identifiant — libellé ».
 */
@Component({
  selector: 'app-audit-champs',
  standalone: true,
  templateUrl: './audit-champs.component.html',
  styleUrl: './audit-champs.component.scss'
})
export class AuditChampsComponent {
  @Input({ required: true }) champs: AuditChamp[] = [];

  readonly libelleChamp = libelleChamp;
}
