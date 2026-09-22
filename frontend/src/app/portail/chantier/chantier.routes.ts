import { Routes } from '@angular/router';

export const CHANTIER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/chantier-list.component').then((m) => m.ChantierListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./form/chantier-form.component').then((m) => m.ChantierFormComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./details/chantier-detail.component').then((m) => m.ChantierDetailComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./form/chantier-form.component').then((m) => m.ChantierFormComponent)
  }
];
