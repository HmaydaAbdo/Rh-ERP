import { Routes } from '@angular/router';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/employee-list.component').then((m) => m.EmployeeListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./form/employee-form.component').then((m) => m.EmployeeFormComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./details/employee-detail.component').then((m) => m.EmployeeDetailComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./form/employee-form.component').then((m) => m.EmployeeFormComponent)
  }
];
