import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnChanges, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { formaterHorodatage, LIBELLES_OPERATIONS, LIBELLES_ORIGINES } from '../audit-format';
import { AuditChampsComponent } from '../champs/audit-champs.component';
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
  imports: [AuditChampsComponent, ButtonComponent],
  templateUrl: './audit-historique.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './audit-historique.component.scss'
})
export class AuditHistoriqueComponent implements OnChanges {
  private readonly auditService = inject(AuditService);
  private readonly destroyRef = inject(DestroyRef);
  private requete?: Subscription;

  /** Nom de l'entité auditée (ex. `Paie`, `Employee`). */
  readonly entite = input.required<string>();
  readonly id = input.required<number>();

  protected readonly versions = signal<AuditVersion[]>([]);
  protected readonly total = signal(0);
  protected readonly chargement = signal(false);
  protected readonly erreur = signal(false);

  protected readonly formaterHorodatage = formaterHorodatage;
  protected readonly libelleOperation = (operation: AuditVersion['operation']): string => LIBELLES_OPERATIONS[operation];
  protected readonly libelleOrigine = (origine: AuditVersion['origine']): string => LIBELLES_ORIGINES[origine];

  private page = 0;

  ngOnChanges(): void {
    this.requete?.unsubscribe();
    this.page = 0;
    this.versions.set([]);
    this.total.set(0);
    this.charger();
  }

  protected plus(): void {
    if (!this.chargement() && !this.erreur() && this.resteAcharger()) {
      this.charger();
    }
  }

  protected reessayer(): void {
    this.charger();
  }

  protected resteAcharger(): boolean {
    return this.versions().length < this.total();
  }

  private charger(): void {
    this.chargement.set(true);
    this.erreur.set(false);
    this.requete = this.auditService
      .historique(this.entite(), this.id(), { page: this.page, size: TAILLE_PAGE })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.chargement.set(false)))
      .subscribe({ next: (resultat) => {
        this.versions.update((existantes) => [...existantes, ...resultat.content]);
        this.total.set(resultat.page.totalElements);
        this.page += 1;
      }, error: () => this.erreur.set(true) });
  }
}
