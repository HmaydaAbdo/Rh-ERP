import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const HEURES_SUPP_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'HEURES_SUP_READ', permissions: ['PAIE_READ'] },
    loadComponent: () => import('./vues/heures-supp-vues.component').then((m) => m.HeuresSuppVuesComponent),
    children: [
      { path: '', data: { vue: 'tabulaire' }, loadComponent: () => import('./list/heures-supp-list.component').then((m) => m.HeuresSuppListComponent) },
      { path: 'cartes', data: { vue: 'cartes' }, loadComponent: () => import('./cartes/heures-supp-cartes.component').then((m) => m.HeuresSuppCartesComponent) },
      { path: 'analytique', data: { vue: 'analytique' }, loadComponent: () => import('./analytique/heures-supp-analytique.component').then((m) => m.HeuresSuppAnalytiqueComponent) }
    ]
  },
  {
    path: 'import',
    canActivate: [permissionGuard],
    data: { permission: 'HEURES_SUP_IMPORT', permissions: ['PAIE_READ', 'CHANTIER_READ', 'EMPLOYEE_READ', 'FUNCTION_READ'] },
    loadComponent: () => import('./import/heures-supp-import.component').then((m) => m.HeuresSuppImportComponent)
  }
];
