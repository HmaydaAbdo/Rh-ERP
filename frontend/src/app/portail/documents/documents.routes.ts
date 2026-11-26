import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Documents administratifs (KAN-320) : la rubrique du chargé RH, d'abord l'attestation de travail. La recherche de
 * l'employé lit les fiches (`EMPLOYEE_READ`). */
export const DOCUMENTS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'DOCUMENT_ADMIN_EDITER', permissions: ['EMPLOYEE_READ'] },
    loadComponent: () => import('./attestation-travail/attestation-travail.component').then((m) => m.AttestationTravailComponent)
  }
];
