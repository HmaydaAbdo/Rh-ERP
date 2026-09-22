import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'employees', pathMatch: 'full' },
  {
    path: 'employees',
    loadChildren: () => import('./portail/employee/employee.routes').then((m) => m.EMPLOYEE_ROUTES)
  },
  {
    path: 'chantiers',
    loadChildren: () => import('./portail/chantier/chantier.routes').then((m) => m.CHANTIER_ROUTES)
  },
  {
    path: 'functions',
    loadChildren: () => import('./portail/function/function.routes').then((m) => m.FUNCTION_ROUTES)
  },
  {
    path: 'paie',
    loadChildren: () => import('./portail/paie/paie.routes').then((m) => m.PAIE_ROUTES)
  }
];
