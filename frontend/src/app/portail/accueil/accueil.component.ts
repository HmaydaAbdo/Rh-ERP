import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button/button.directive';
import { DialogComponent } from '../../shared/ui/dialog/dialog.component';
import { NotificationService } from '../../shared/ui/feedback/feedback.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { EmployeeAnalytique } from '../employee/models/employee.model';
import { EmployeeService } from '../employee/services/employee.service';
import { PaieAnalytique } from '../paie/models/paie.model';
import { formaterBulletins, formaterDirhams, formaterEcart } from '../paie/paie-format';
import { PaieService } from '../paie/services/paie.service';
import { AccueilEditeurComponent } from './editeur/accueil-editeur.component';
import { Accueil, AccueilService } from './services/accueil.service';

interface Tuile {
  code: string;
  libelle: string;
  valeur: string;
  variation: string | null;
}

const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const FORMAT_DECIMAL = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * L'accueil de l'utilisateur connecté : les indicateurs que son administrateur ou lui-même ont choisis, parmi ceux que ses
 * permissions autorisent. Chaque valeur vient de l'API du domaine qui la porte (paie, fiches Employé) : l'accueil ne calcule rien.
 */
@Component({
  selector: 'app-accueil',
  imports: [ButtonComponent, DialogComponent, IconComponent, AccueilEditeurComponent],
  templateUrl: './accueil.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccueilComponent implements OnInit {
  private readonly accueilService = inject(AccueilService);
  private readonly paieService = inject(PaieService);
  private readonly employeeService = inject(EmployeeService);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly accueil = signal<Accueil | null>(null);
  protected readonly paie = signal<PaieAnalytique | null>(null);
  protected readonly employes = signal<EmployeeAnalytique | null>(null);
  protected readonly chargement = signal(true);
  protected readonly erreur = signal(false);
  protected readonly edition = signal(false);
  protected readonly enregistrement = signal(false);

  protected readonly utilisateur = computed(() => this.authService.user()?.username ?? '');

  protected readonly tuiles = computed<Tuile[]>(() => {
    const accueil = this.accueil();
    if (!accueil) {
      return [];
    }
    const libelles = new Map(accueil.disponibles.map((indicateur) => [indicateur.code, indicateur.libelle]));
    return accueil.indicateurs.map((code) => ({ code, libelle: libelles.get(code) ?? code, ...this.valeurDe(code) }));
  });

  ngOnInit(): void {
    this.charger();
  }

  protected charger(): void {
    this.chargement.set(true);
    this.erreur.set(false);
    this.accueilService
      .lire()
      .pipe(
        switchMap((accueil) => {
          const aPaie = accueil.indicateurs.some((code) => code.startsWith('paie.'));
          const aEmployes = accueil.indicateurs.some((code) => code.startsWith('employe.'));
          return forkJoin({
            accueil: of(accueil),
            paie: aPaie ? this.lirePaie() : of(null),
            employes: aEmployes ? this.employeeService.analyser({}).pipe(catchError(() => of(null))) : of(null)
          });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ accueil, paie, employes }) => {
          this.accueil.set(accueil);
          this.paie.set(paie);
          this.employes.set(employes);
          this.chargement.set(false);
        },
        error: () => {
          this.erreur.set(true);
          this.chargement.set(false);
        }
      });
  }

  protected enregistrer(indicateurs: string[]): void {
    this.enregistrement.set(true);
    this.accueilService
      .enregistrer({ version: this.accueil()?.version ?? null, indicateurs })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.apresEnregistrement('Accueil enregistré'),
        error: () => this.enregistrement.set(false)
      });
  }

  protected reinitialiser(): void {
    this.enregistrement.set(true);
    this.accueilService
      .reinitialiser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.apresEnregistrement('Accueil rétabli'),
        error: () => this.enregistrement.set(false)
      });
  }

  private apresEnregistrement(message: string): void {
    this.enregistrement.set(false);
    this.edition.set(false);
    this.notifications.add({ severity: 'success', summary: message, life: 4000 });
    this.charger();
  }

  /** Le dernier mois de paie et ses indicateurs ; `null` s'il n'y a aucune paie ou si la lecture échoue (les tuiles montrent « — »). */
  private lirePaie() {
    return this.paieService.listerPeriodes().pipe(
      switchMap((periodes) => (periodes.length === 0 ? of(null) : this.paieService.analyser({ periode: periodes[0].periode }))),
      catchError(() => of(null))
    );
  }

  private valeurDe(code: string): { valeur: string; variation: string | null } {
    const paie = this.paie();
    const employes = this.employes();
    const vide = { valeur: '—', variation: null };
    if (code.startsWith('paie.')) {
      if (!paie) {
        return vide;
      }
      const { kpis, moisPrecedent } = paie;
      const ecart = (courant: number, precedent: number | null | undefined, unite: (valeurAbsolue: number) => string): string | null =>
        moisPrecedent && precedent !== null && precedent !== undefined ? `${formaterEcart(courant, precedent, unite)} sur le mois précédent` : null;
      switch (code) {
        case 'paie.masse':
          return { valeur: formaterDirhams(kpis.masse), variation: ecart(kpis.masse, moisPrecedent?.masse, formaterDirhams) };
        case 'paie.effectif':
          return { valeur: formaterBulletins(kpis.effectif), variation: ecart(kpis.effectif, moisPrecedent?.effectif, formaterBulletins) };
        case 'paie.cout-moyen':
          return {
            valeur: kpis.coutMoyen === null ? '—' : formaterDirhams(kpis.coutMoyen),
            variation: kpis.coutMoyen === null ? null : ecart(kpis.coutMoyen, moisPrecedent?.coutMoyen, formaterDirhams)
          };
        case 'paie.stc':
          return { valeur: `${formaterBulletins(kpis.stc)} · ${formaterDirhams(kpis.stcMontant)}`, variation: ecart(kpis.stc, moisPrecedent?.stc, formaterBulletins) };
        default:
          return vide;
      }
    }
    if (!employes) {
      return vide;
    }
    switch (code) {
      case 'employe.effectif':
        return { valeur: FORMAT_ENTIER.format(employes.effectif), variation: null };
      case 'employe.en-poste':
        return { valeur: FORMAT_ENTIER.format(employes.actifs), variation: employes.effectif ? `${FORMAT_DECIMAL.format((employes.actifs / employes.effectif) * 100)} % de l’effectif` : null };
      case 'employe.age-moyen':
        return { valeur: employes.ageMoyen === null ? '—' : `${FORMAT_DECIMAL.format(employes.ageMoyen)} ans`, variation: null };
      case 'employe.anciennete-moyenne':
        return { valeur: employes.ancienneteMoyenne === null ? '—' : `${FORMAT_DECIMAL.format(employes.ancienneteMoyenne)} ans`, variation: null };
      case 'employe.embauches':
        return { valeur: FORMAT_ENTIER.format(employes.embauchesDouzeMois), variation: null };
      default:
        return vide;
    }
  }
}
