import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const PAIE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'PAIE_READ' },
    loadComponent: () => import('./list/paie-list.component').then((m) => m.PaieListComponent)
  },
  {
    path: 'cartes',
    canActivate: [permissionGuard],
    data: { permission: 'PAIE_READ' },
    loadComponent: () => import('./cartes/paie-cartes.component').then((m) => m.PaieCartesComponent)
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    data: { permission: 'PAIE_WRITE' },
    loadComponent: () => import('./form/paie-form.component').then((m) => m.PaieFormComponent)
  },
  {
    path: ':id',
    canActivate: [permissionGuard],
    data: { permission: 'PAIE_READ' },
    loadComponent: () => import('./details/paie-detail.component').then((m) => m.PaieDetailComponent)
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'PAIE_WRITE' },
    loadComponent: () => import('./form/paie-form.component').then((m) => m.PaieFormComponent)
  }
];
