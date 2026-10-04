import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

/** Journal d'audit — lecture seule, réservé à la permission d'audit. L'historique d'un enregistrement n'a pas de route :
 * il s'ouvre dans une fenêtre depuis le détail du bulletin ou de l'employé. */
export const AUDIT_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { permission: 'AUDIT_READ' },
    loadComponent: () => import('./journal/journal.component').then((m) => m.JournalComponent)
  }
];
