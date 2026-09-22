import { Routes } from '@angular/router';

export const PAIE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/paie-list.component').then((m) => m.PaieListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./form/paie-form.component').then((m) => m.PaieFormComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./details/paie-detail.component').then((m) => m.PaieDetailComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./form/paie-form.component').then((m) => m.PaieFormComponent)
  }
];
