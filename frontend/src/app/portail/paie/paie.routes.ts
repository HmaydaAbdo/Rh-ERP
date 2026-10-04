import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Les trois vues de la paie (tabulaire, cartes, analytique) partagent une coque — titre, sélecteur de vue et barre de
 * filtres, voir `PaieVuesComponent`. Les écrans de saisie et de consultation d'un bulletin n'en font pas partie. */
export const PAIE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'PAIE_READ' },
    loadComponent: () => import('./vues/paie-vues.component').then((m) => m.PaieVuesComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./list/paie-list.component').then((m) => m.PaieListComponent)
      },
      {
        path: 'cartes',
        loadComponent: () => import('./cartes/paie-cartes.component').then((m) => m.PaieCartesComponent)
      },
      {
        path: 'analytique',
        loadComponent: () => import('./analytique/paie-analytique.component').then((m) => m.PaieAnalytiqueComponent)
      }
    ]
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
