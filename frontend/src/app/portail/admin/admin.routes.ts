import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';
import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'users',
    title: 'Utilisateurs',
    canActivate: [permissionGuard],
    data: { permission: 'USER_MANAGE' },
    loadComponent: () => import('./users/list/user-list.component').then((m) => m.UserListComponent)
  },
  {
    path: 'users/new',
    title: 'Utilisateurs',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'USER_MANAGE' },
    loadComponent: () => import('./users/form/user-form.component').then((m) => m.UserFormComponent)
  },
  {
    path: 'users/:id/edit',
    title: 'Utilisateurs',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'USER_MANAGE' },
    loadComponent: () => import('./users/form/user-form.component').then((m) => m.UserFormComponent)
  },
  {
    path: 'roles',
    title: 'Rôles',
    canActivate: [permissionGuard],
    data: { permission: 'ROLE_MANAGE' },
    loadComponent: () => import('./roles/list/role-list.component').then((m) => m.RoleListComponent)
  },
  {
    path: 'roles/new',
    title: 'Rôles',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'ROLE_MANAGE' },
    loadComponent: () => import('./roles/form/role-form.component').then((m) => m.RoleFormComponent)
  },
  {
    path: 'roles/:id/edit',
    title: 'Rôles',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'ROLE_MANAGE' },
    loadComponent: () => import('./roles/form/role-form.component').then((m) => m.RoleFormComponent)
  }
];
