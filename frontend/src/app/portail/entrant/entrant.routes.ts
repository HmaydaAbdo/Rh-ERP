import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Module Entrants : les arrivées du mois (nouvelles embauches et retours), lues dans les bulletins de paie, en trois vues. */
export const ENTRANT_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./vues/entrant-vues.component').then((m) => m.EntrantVuesComponent),
    children: [
      { path: '', loadComponent: () => import('./list/entrant-list.component').then((m) => m.EntrantListComponent) },
      { path: 'cartes', loadComponent: () => import('./cartes/entrant-cartes.component').then((m) => m.EntrantCartesComponent) },
      { path: 'analytique', loadComponent: () => import('./analytique/entrant-analytique.component').then((m) => m.EntrantAnalytiqueComponent) }
    ]
  }
];
