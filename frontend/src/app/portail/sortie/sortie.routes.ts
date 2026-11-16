import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Module Sorties : les départs du mois (STC, abandons de poste), lus dans les fiches des employés, en trois vues. */
export const SORTIE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./vues/sortie-vues.component').then((m) => m.SortieVuesComponent),
    children: [
      { path: '', loadComponent: () => import('./list/sortie-list.component').then((m) => m.SortieListComponent) },
      { path: 'cartes', loadComponent: () => import('./cartes/sortie-cartes.component').then((m) => m.SortieCartesComponent) },
      { path: 'analytique', loadComponent: () => import('./analytique/sortie-analytique.component').then((m) => m.SortieAnalytiqueComponent) }
    ]
  }
];
