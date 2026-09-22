import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

/** Route protégée par simple authentification (pas de permission spécifique requise). */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

/**
 * Route protégée par une permission précise — déclarer `data: { permission: 'USER_MANAGE' }` (ou
 * `permissions: [...]` pour "au moins une des permissions") sur la route.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const permission = route.data['permission'] as string | undefined;
  const permissions = route.data['permissions'] as string[] | undefined;

  const autorise =
    (!permission || authService.hasPermission(permission)) &&
    (!permissions || authService.hasAnyPermission(permissions));

  return autorise ? true : router.createUrlTree(['/']);
};
