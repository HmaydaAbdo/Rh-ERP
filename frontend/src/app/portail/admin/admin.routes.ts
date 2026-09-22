import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'users',
    canActivate: [permissionGuard],
    data: { permission: 'USER_MANAGE' },
    loadComponent: () => import('./users/list/user-list.component').then((m) => m.UserListComponent)
  },
  {
    path: 'users/new',
    canActivate: [permissionGuard],
    data: { permission: 'USER_MANAGE' },
    loadComponent: () => import('./users/form/user-form.component').then((m) => m.UserFormComponent)
  },
  {
    path: 'users/:id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'USER_MANAGE' },
    loadComponent: () => import('./users/form/user-form.component').then((m) => m.UserFormComponent)
  },
  {
    path: 'roles',
    canActivate: [permissionGuard],
    data: { permission: 'ROLE_MANAGE' },
    loadComponent: () => import('./roles/list/role-list.component').then((m) => m.RoleListComponent)
  },
  {
    path: 'roles/new',
    canActivate: [permissionGuard],
    data: { permission: 'ROLE_MANAGE' },
    loadComponent: () => import('./roles/form/role-form.component').then((m) => m.RoleFormComponent)
  },
  {
    path: 'roles/:id/edit',
    canActivate: [permissionGuard],
    data: { permission: 'ROLE_MANAGE' },
    loadComponent: () => import('./roles/form/role-form.component').then((m) => m.RoleFormComponent)
  }
];
