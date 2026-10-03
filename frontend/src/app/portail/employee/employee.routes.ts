import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./list/employee-list.component').then((m) => m.EmployeeListComponent)
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_WRITE' },
    loadComponent: () => import('./form/employee-form.component').then((m) => m.EmployeeFormComponent)
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./details/employee-detail.component').then((m) => m.EmployeeDetailComponent)
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_WRITE' },
    loadComponent: () => import('./form/employee-form.component').then((m) => m.EmployeeFormComponent)
  }
];
