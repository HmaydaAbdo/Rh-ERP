import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const CHANTIER_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'CHANTIER_READ' },
    loadComponent: () => import('./list/chantier-list.component').then((m) => m.ChantierListComponent)
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    data: { permission: 'CHANTIER_WRITE' },
    loadComponent: () => import('./form/chantier-form.component').then((m) => m.ChantierFormComponent)
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permission: 'CHANTIER_READ' },
    loadComponent: () => import('./details/chantier-detail.component').then((m) => m.ChantierDetailComponent)
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'CHANTIER_WRITE' },
    loadComponent: () => import('./form/chantier-form.component').then((m) => m.ChantierFormComponent)
  }
];
