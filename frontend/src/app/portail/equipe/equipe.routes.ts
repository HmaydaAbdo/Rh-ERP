import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const EQUIPE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EQUIPE_READ' },
    loadComponent: () => import('./list/equipe-list.component').then((m) => m.EquipeListComponent)
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    data: { permission: 'EQUIPE_WRITE' },
    loadComponent: () => import('./form/equipe-form.component').then((m) => m.EquipeFormComponent)
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permission: 'EQUIPE_READ' },
    loadComponent: () => import('./details/equipe-detail.component').then((m) => m.EquipeDetailComponent)
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'EQUIPE_WRITE' },
    loadComponent: () => import('./form/equipe-form.component').then((m) => m.EquipeFormComponent)
  }
];
