import { isDevMode } from '@angular/core';
import { Routes } from '@angular/router';

import { authGuard, homeGuard, permissionGuard } from './core/auth/guards/auth.guard';

export const routes: Routes = [
  // Catalogue des composants partagés : développement seulement, jamais dans le build de production.
  ...(isDevMode()
    ? [
        {
          path: 'catalogue',
          title: 'Catalogue',
          loadComponent: () => import('./shared/ui/catalogue/catalogue.component').then((m) => m.CatalogueComponent)
        }
      ]
    : []),
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
  {
    path: 'acces-refuse',
    title: 'Accès refusé',
    canActivate: [authGuard],
    loadComponent: () => import('./core/auth/access-denied/access-denied.component').then((m) => m.AccessDeniedComponent)
  },
  {
    path: 'login',
    title: 'Connexion',
    loadComponent: () => import('./core/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'forgot-password',
    title: 'Mot de passe oublié',
    loadComponent: () => import('./core/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    title: 'Nouveau mot de passe',
    loadComponent: () => import('./core/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
  },
  {
    path: 'employees',
    title: 'Employés',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/employee/employee.routes').then((m) => m.EMPLOYEE_ROUTES)
  },
  {
    path: 'chantiers',
    title: 'Chantiers',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/chantier/chantier.routes').then((m) => m.CHANTIER_ROUTES)
  },
  {
    // Droit propre à la carte (CARTE_READ), distinct de CHANTIER_READ ; route de premier niveau pour que le menu « Chantiers »
    // ne soit pas surligné en même temps que « Carte ».
    path: 'carte',
    title: 'Carte des chantiers',
    canActivate: [permissionGuard],
    data: { permission: 'CARTE_READ' },
    loadComponent: () => import('./portail/chantier/carte/chantier-carte-page.component').then((m) => m.ChantierCartePageComponent)
  },
  {
    path: 'functions',
    title: 'Fonctions',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/function/function.routes').then((m) => m.FUNCTION_ROUTES)
  },
  {
    path: 'equipes',
    title: 'Équipes',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/equipe/equipe.routes').then((m) => m.EQUIPE_ROUTES)
  },
  {
    path: 'paie',
    title: 'Paie',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/paie/paie.routes').then((m) => m.PAIE_ROUTES)
  },
  {
    path: 'heures-supp',
    title: 'Heures supplémentaires',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/heures-supp/heures-supp.routes').then((m) => m.HEURES_SUPP_ROUTES)
  },
  {
    path: 'audit',
    title: "Journal d’audit",
    canActivate: [authGuard],
    loadChildren: () => import('./portail/audit/audit.routes').then((m) => m.AUDIT_ROUTES)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () => import('./portail/admin/admin.routes').then((m) => m.ADMIN_ROUTES)
  }
];
