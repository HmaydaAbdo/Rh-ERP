import { Routes } from '@angular/router';

import { authGuard, homeGuard } from './core/auth/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  {
    path: 'acces-refuse',
    canActivate: [authGuard],
    loadComponent: () => import('./core/auth/access-denied/access-denied.component').then((m) => m.AccessDeniedComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./core/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./core/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./core/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
  },
  {
    path: 'employees',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/employee/employee.routes').then((m) => m.EMPLOYEE_ROUTES)
  },
  {
    path: 'chantiers',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/chantier/chantier.routes').then((m) => m.CHANTIER_ROUTES)
  },
  {
    path: 'functions',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/function/function.routes').then((m) => m.FUNCTION_ROUTES)
  },
  {
    path: 'equipes',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/equipe/equipe.routes').then((m) => m.EQUIPE_ROUTES)
  },
  {
    path: 'paie',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/paie/paie.routes').then((m) => m.PAIE_ROUTES)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/admin/admin.routes').then((m) => m.ADMIN_ROUTES)
  }
];
