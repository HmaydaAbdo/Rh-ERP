import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';

import { AuthService } from '../../core/auth/services/auth.service';

/** L'utilisateur connecté n'a que ces permissions (`AuthService` factice ; le signal rendu permet d'en changer en cours de test). */
export function fournirPermissions(permissions: string[]) {
  const accordees = signal(permissions);
  return {
    accordees,
    providers: [
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: signal(true),
          hasPermission: (code: string) => accordees().includes(code),
          hasAnyPermission: (codes: string[]) => codes.some((code) => accordees().includes(code))
        }
      }
    ]
  };
}

/** L'écran est ouvert sur une route avec ces paramètres de chemin (`:id`) et de requête (`?periode=…`). */
export function fournirRoute(chemin: Record<string, string> = {}, requete: Params = {}) {
  return { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(chemin), queryParamMap: convertToParamMap(requete) } } };
}
