# RBAC — Auth (comptes, rôles, permissions)

> Trace exhaustive des accès du module Auth lui-même. Toute évolution des autorisations de ce
> module met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints publics (aucune authentification)

| Endpoint | Note |
|---|---|
| `POST /auth/login` | Identifiants vérifiés dans `AuthService` |
| `POST /auth/refresh` | Lit le Refresh Token depuis le cookie httpOnly ; la réutilisation d'un token déjà consommé révoque toute sa famille (voir ci-dessous) |
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
| Écran d'accueil `/` | `homeGuard` : premier écran du menu (`NAV_ITEMS`) autorisé pour l'utilisateur, sinon `/acces-refuse` |
| Page `/acces-refuse` | `authGuard` — affichée quand un `permissionGuard` refuse l'accès (jamais une redirection vers `/`, qui bouclerait) |
| Lien sidebar "Utilisateurs" | `authService.hasPermission('USER_MANAGE')` |
| Lien sidebar "Rôles" | `authService.hasPermission('ROLE_MANAGE')` |
| Routes `/admin/users/**` | `permissionGuard`, `data: { permission: 'USER_MANAGE' }` |
| Routes `/admin/roles/**` | `permissionGuard`, `data: { permission: 'ROLE_MANAGE' }` |
| Section "Permissions refusées" (formulaire utilisateur) | Visible uniquement en édition, limitée aux permissions accordées par les rôles actuellement sélectionnés |

## Rôles disposant de ces permissions (seed initial)

Seul `SYSTEM_ADMIN` a `USER_MANAGE`/`ROLE_MANAGE` (voir `V4__seed_permissions_et_roles.sql`) —
`PAIE_MANAGER` a tout le reste du périmètre applicatif mais pas la gestion des comptes/rôles.

## Refresh Token — famille et révocation en cascade

Tous les Refresh Tokens issus d'une même connexion (le `login`, puis chaque rotation de `/auth/refresh`)
partagent la même `famille` (`refresh_token.famille`, migration `V10`). Un token déjà consommé qui est
présenté de nouveau signale un vol possible (le voleur et le propriétaire ont le même token) : **toute la
famille est révoquée** (`AuthService.refresh`), ce qui force les deux à se reconnecter. Les sessions
ouvertes sur d'autres appareils (autres familles) ne sont pas touchées. Un token expiré, lui, est
simplement refusé.

## Vérification automatique des permissions

`EndpointSecurityTest` découvre tous les `@RestController` (sauf `AuthController`) et vérifie, sans base de
données, que chaque endpoint a un `@PreAuthorize`, refuse une identité sans la permission requise, l'accepte
avec elle, et correspond à une **table de référence** endpoint → permission (miroir des fichiers
`docs/rbac/*.md`) : tout nouvel endpoint ou changement de permission doit être répercuté dans cette table
et dans la doc. `JwtSecurityChainTest` valide la chaîne complète avec de vrais JWT (401 sans token, token
invalide ou signé avec un autre secret ; 403 sans la permission, même avec un rôle d'administrateur ; 200 avec).
