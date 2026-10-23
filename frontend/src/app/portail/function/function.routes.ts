import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const FUNCTION_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'FUNCTION_READ' },
    loadComponent: () => import('./vues/function-vues.component').then((m) => m.FunctionVuesComponent),
    children: [
      { path: '', loadComponent: () => import('./list/function-list.component').then((m) => m.FunctionListComponent) },
      { path: 'cartes', loadComponent: () => import('./cartes/function-cartes.component').then((m) => m.FunctionCartesComponent) },
      { path: 'analytique', loadComponent: () => import('./analytique/function-analytique.component').then((m) => m.FunctionAnalytiqueComponent) }
    ]
  },
  {
    path: 'new',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
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
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'FUNCTION_WRITE' },
    loadComponent: () => import('./form/function-form.component').then((m) => m.FunctionFormComponent)
  }
];
