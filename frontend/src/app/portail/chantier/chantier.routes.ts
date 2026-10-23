import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const CHANTIER_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'CHANTIER_READ' },
    loadComponent: () => import('./vues/chantier-vues.component').then((m) => m.ChantierVuesComponent),
    children: [
      { path: '', loadComponent: () => import('./list/chantier-list.component').then((m) => m.ChantierListComponent) },
      { path: 'cartes', loadComponent: () => import('./cartes/chantier-cartes.component').then((m) => m.ChantierCartesComponent) },
      { path: 'analytique', loadComponent: () => import('./analytique/chantier-analytique.component').then((m) => m.ChantierAnalytiqueComponent) }
    ]
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
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
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'CHANTIER_WRITE' },
    loadComponent: () => import('./form/chantier-form.component').then((m) => m.ChantierFormComponent)
  }
];
