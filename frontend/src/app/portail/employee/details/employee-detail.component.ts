import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { AuthService } from '../../../core/auth/services/auth.service';
import { AuditHistoriqueComponent } from '../../audit/historique/audit-historique.component';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule, TagModule, DialogModule, AuditHistoriqueComponent],
  templateUrl: './employee-detail.component.html'
})
export class EmployeeDetailComponent implements OnInit {
  private readonly authService = inject(AuthService);

  canWrite(): boolean {
    return this.authService.hasPermission('EMPLOYEE_WRITE');
  }

  canViewHistory(): boolean {
    return this.authService.hasPermission('AUDIT_READ');
  }

  historiqueOuvert = false;

  private readonly route = inject(ActivatedRoute);
  private readonly employeeService = inject(EmployeeService);

  employee: Employee | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.employeeService.getById(id).subscribe((employee) => (this.employee = employee));
  }
}
