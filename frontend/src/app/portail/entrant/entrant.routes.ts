import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Module Entrants : les arrivées du mois (nouvelles embauches et retours), lues dans les bulletins de paie. */
export const ENTRANT_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./page/entrant-page.component').then((m) => m.EntrantPageComponent)
  }
];
