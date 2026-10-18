import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

/** Les vues des employés partagent une coque — titre, actions et barre de filtres, voir `EmployeeVuesComponent`. Les écrans de
 * saisie et de consultation d'un employé n'en font pas partie. */
export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./vues/employee-vues.component').then((m) => m.EmployeeVuesComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./list/employee-list.component').then((m) => m.EmployeeListComponent)
      }
    ]
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
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
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'EMPLOYEE_WRITE' },
    loadComponent: () => import('./form/employee-form.component').then((m) => m.EmployeeFormComponent)
  }
];
