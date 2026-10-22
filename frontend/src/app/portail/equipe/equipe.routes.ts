import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const EQUIPE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EQUIPE_READ' },
    loadComponent: () => import('./vues/equipe-vues.component').then((m) => m.EquipeVuesComponent),
    children: [
      { path: '', loadComponent: () => import('./list/equipe-list.component').then((m) => m.EquipeListComponent) },
      { path: 'cartes', loadComponent: () => import('./cartes/equipe-cartes.component').then((m) => m.EquipeCartesComponent) },
      { path: 'analytique', loadComponent: () => import('./analytique/equipe-analytique.component').then((m) => m.EquipeAnalytiqueComponent) }
    ]
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
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
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'EQUIPE_WRITE' },
    loadComponent: () => import('./form/equipe-form.component').then((m) => m.EquipeFormComponent)
  }
];
