import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { finalize } from 'rxjs';

import { AuditChampsComponent } from '../champs/audit-champs.component';
import { LIBELLES_OPERATIONS, LIBELLES_ORIGINES, formaterHorodatage } from '../audit-format';
import { AuditVersion } from '../models/audit.model';
import { AuditService } from '../services/audit.service';

const TAILLE_PAGE = 10;

/**
 * Toutes les versions d'un enregistrement, de la plus récente à la plus ancienne : qui, quand, d'où, et ce qui a changé par
 * rapport à la version précédente. Se place là où l'enregistrement est affiché (détail d'un bulletin, d'un employé), derrière
 * la permission d'audit.
 */
@Component({
  selector: 'app-audit-historique',
  standalone: true,
  imports: [ButtonModule, AuditChampsComponent],
  templateUrl: './audit-historique.component.html',
  styleUrl: './audit-historique.component.scss'
})
export class AuditHistoriqueComponent implements OnInit {
  private readonly auditService = inject(AuditService);

  /** Nom de l'entité auditée (ex. `Paie`, `Employee`). */
  @Input({ required: true }) entite!: string;
  @Input({ required: true }) id!: number;

  readonly versions = signal<AuditVersion[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(false);

  readonly formaterHorodatage = formaterHorodatage;
  readonly libelleOperation = (operation: AuditVersion['operation']): string => LIBELLES_OPERATIONS[operation];
  readonly libelleOrigine = (origine: AuditVersion['origine']): string => LIBELLES_ORIGINES[origine];

  private page = 0;

  ngOnInit(): void {
    this.charger();
  }

  plus(): void {
    this.page += 1;
    this.charger();
  }

  resteAcharger(): boolean {
    return this.versions().length < this.total();
  }

  private charger(): void {
    this.chargement.set(true);
    this.auditService
      .historique(this.entite, this.id, { page: this.page, size: TAILLE_PAGE })
      .pipe(finalize(() => this.chargement.set(false)))
      .subscribe((resultat) => {
        this.versions.update((existantes) => [...existantes, ...resultat.content]);
        this.total.set(resultat.page.totalElements);
      });
  }
}
