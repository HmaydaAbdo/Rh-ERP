import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { NAV_ITEMS } from '../../navigation/nav-items';
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

  return autorise ? true : router.createUrlTree(['/acces-refuse']);
};

/**
 * Écran d'accueil (`/`) : redirige vers le premier écran du menu auquel l'utilisateur a accès, ou vers
 * la page « accès refusé » s'il n'en a aucun. Évite toute boucle de redirection : un écran dont la
 * permission manque n'est jamais l'accueil.
 */
export const homeGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const premier = NAV_ITEMS.find((item) => authService.hasPermission(item.permission));
  return router.createUrlTree([premier ? premier.route : '/acces-refuse']);
};
