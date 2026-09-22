# RBAC — Auth (comptes, rôles, permissions)

> Trace exhaustive des accès du module Auth lui-même. Toute évolution des autorisations de ce
> module met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints publics (aucune authentification)

| Endpoint | Note |
|---|---|
| `POST /auth/login` | Identifiants vérifiés dans `AuthService` |
| `POST /auth/refresh` | Lit le Refresh Token depuis le cookie httpOnly |
| `POST /auth/forgot-password` | Répond toujours `202`, que l'email existe ou non |
| `POST /auth/reset-password` | Consomme un token à usage unique |

## Endpoints authentifiés (utilisateur connecté, sans permission spécifique)

| Endpoint | Note |
|---|---|
| `GET /auth/me` | Profil de l'utilisateur courant (résolu depuis le claim `uid` du JWT) |
| `POST /auth/logout` | Révoque le Refresh Token courant |

## Endpoints d'administration

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `GET /users`, `GET /users/{id}` | `USER_MANAGE` |
| `POST /users` | `USER_MANAGE` |
| `PUT /users/{id}` | `USER_MANAGE` |
| `PUT /users/{id}/permissions-refusees` | `USER_MANAGE` |
| `POST /users/{id}/reset-password` | `USER_MANAGE` |
| `GET /roles`, `GET /roles/{id}` | `ROLE_MANAGE` |
| `POST /roles` | `ROLE_MANAGE` |
| `PUT /roles/{id}` | `ROLE_MANAGE` |
| `DELETE /roles/{id}` | `ROLE_MANAGE` |
| `GET /permissions` | `ROLE_MANAGE` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar "Utilisateurs" | `authService.hasPermission('USER_MANAGE')` |
| Lien sidebar "Rôles" | `authService.hasPermission('ROLE_MANAGE')` |
| Routes `/admin/users/**` | `permissionGuard`, `data: { permission: 'USER_MANAGE' }` |
| Routes `/admin/roles/**` | `permissionGuard`, `data: { permission: 'ROLE_MANAGE' }` |
| Section "Permissions refusées" (formulaire utilisateur) | Visible uniquement en édition, limitée aux permissions accordées par les rôles actuellement sélectionnés |

## Rôles disposant de ces permissions (seed initial)

Seul `SYSTEM_ADMIN` a `USER_MANAGE`/`ROLE_MANAGE` (voir `V4__seed_permissions_et_roles.sql`) —
`PAIE_MANAGER` a tout le reste du périmètre applicatif mais pas la gestion des comptes/rôles.
