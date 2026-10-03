import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const FUNCTION_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'FUNCTION_READ' },
    loadComponent: () => import('./list/function-list.component').then((m) => m.FunctionListComponent)
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    data: { permission: 'FUNCTION_WRITE' },
    loadComponent: () => import('./form/function-form.component').then((m) => m.FunctionFormComponent)
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permission: 'FUNCTION_READ' },
    loadComponent: () => import('./details/function-detail.component').then((m) => m.FunctionDetailComponent)
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'FUNCTION_WRITE' },
    loadComponent: () => import('./form/function-form.component').then((m) => m.FunctionFormComponent)
  }
];
