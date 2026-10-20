import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { AuditHistoriqueComponent } from '../../audit/historique/audit-historique.component';
import { PaieParcoursComponent } from '../../paie/parcours/paie-parcours.component';
import { Employee } from '../models/employee.model';
import { libelleStatutEmploye } from '../models/employee-statut';
import { EmployeeService } from '../services/employee.service';

/** Années et mois pleins entre deux dates (`aaaa-mm-jj`) et aujourd'hui. */
function duree(depuis: string, aujourdhui: Date): { annees: number; mois: number } {
  const [annee, mois, jour] = depuis.split('-').map(Number);
  let total = (aujourdhui.getFullYear() - annee) * 12 + (aujourdhui.getMonth() + 1 - mois);
  if (aujourdhui.getDate() < jour) {
    total--;
  }
  total = Math.max(0, total);
  return { annees: Math.floor(total / 12), mois: total % 12 };
}

/**
 * Fiche d'un employé : son identité, sa situation actuelle (celle du dernier mois de paie, voir ADR 0010), son ancienneté et
 * son âge ; puis, pour qui a `PAIE_READ`, son salaire et son parcours (`PaieParcoursComponent`, domaine Paie).
 */
@Component({
  selector: 'app-employee-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, AuditHistoriqueComponent, DialogComponent, ButtonComponent, BadgeComponent, IconComponent, PaieParcoursComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-detail.component.html',
  styleUrl: './employee-detail.component.scss'
})
export class EmployeeDetailComponent {
  protected readonly libelleStatut = libelleStatutEmploye;
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));

  /** Le salaire et le parcours sont des données de paie (le serveur ne les envoie qu'à qui a `PAIE_READ`). */
  protected readonly voitLaPaie = computed(() => this.authService.hasPermission('PAIE_READ'));

  protected readonly canViewHistory = computed(() => this.authService.hasPermission('AUDIT_READ'));

  protected readonly historiqueOuvert = signal(false);

  private readonly route = inject(ActivatedRoute);
  private readonly employeeService = inject(EmployeeService);

  protected readonly employee = signal<Employee | null>(null);

  protected readonly initiales = computed(() =>
    (this.employee()?.nomPrenom ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((mot) => mot[0].toUpperCase())
      .join('')
  );

  protected readonly anciennete = computed(() => {
    const employe = this.employee();
    if (!employe) {
      return '';
    }
    const { annees, mois } = duree(employe.dateEmbauche, new Date());
    const morceaux = [annees > 0 ? `${annees} an${annees > 1 ? 's' : ''}` : '', mois > 0 ? `${mois} mois` : ''].filter(Boolean);
    return morceaux.length > 0 ? morceaux.join(' et ') : 'Moins d’un mois';
  });

  protected readonly age = computed(() => {
    const employe = this.employee();
    return employe ? duree(employe.dateNaissance, new Date()).annees : 0;
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.employeeService.getById(id).subscribe((employee) => this.employee.set(employee));
  }
}
