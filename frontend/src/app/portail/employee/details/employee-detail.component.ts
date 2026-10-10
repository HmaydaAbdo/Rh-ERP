import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { AuditHistoriqueComponent } from '../../audit/historique/audit-historique.component';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

@Component({
  selector: 'app-employee-detail',
  imports: [DatePipe, RouterLink, AuditHistoriqueComponent, DialogComponent, ButtonComponent, BadgeComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-detail.component.html'
})
export class EmployeeDetailComponent {
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));

  protected readonly canViewHistory = computed(() => this.authService.hasPermission('AUDIT_READ'));

  protected readonly historiqueOuvert = signal(false);

  private readonly route = inject(ActivatedRoute);
  private readonly employeeService = inject(EmployeeService);

  protected readonly employee = signal<Employee | null>(null);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.employeeService.getById(id).subscribe((employee) => this.employee.set(employee));
  }
}
