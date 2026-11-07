import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Module Sorties : les départs du mois (STC, abandons de poste), lus dans les fiches des employés. */
export const SORTIE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'EMPLOYEE_READ' },
    loadComponent: () => import('./page/sortie-page.component').then((m) => m.SortiePageComponent)
  }
];
