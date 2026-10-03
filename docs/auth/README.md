# Module Auth

> Connexion, sessions, comptes utilisateurs, rôles et permissions. Ce document décrit le fonctionnement
> du module ; la liste endpoint par endpoint des permissions requises est dans
> [../rbac/auth.md](../rbac/auth.md), le catalogue complet des permissions dans
> [../rbac/README.md](../rbac/README.md), et les principes de conception dans
> `conventions/security.md`.

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/auth/` |
| Frontend | `frontend/src/app/core/auth/` (connexion, session, guards) et `frontend/src/app/portail/admin/` (écrans Utilisateurs et Rôles) |
| Tables | `utilisateur`, `role`, `permission`, `role_permission`, `utilisateur_role`, `utilisateur_permission_refusee`, `refresh_token`, `reset_password_token` |
| Endpoints | `/auth/*`, `/users`, `/roles`, `/permissions` |

```text
auth/
├── config/AdminBootstrapRunner.java       ← création du premier administrateur au démarrage
├── controller/ (AuthController, UserController, RoleController)
├── dtos/ (request, response)
├── entities/ (Utilisateur, Role, Permission, RefreshToken, ResetPasswordToken)
├── exceptions/ (exceptions métier + AuthExceptionHandler)
├── mail/EmailService.java                 ← envoi du lien de réinitialisation
├── mappers/ (UserMapper, RoleMapper)
├── repositories/
├── security/
│   ├── SecurityConfig.java                ← chaîne de sécurité, décodeur JWT, CORS, @EnableMethodSecurity
│   ├── JwtService.java                    ← émission des jetons d'accès (HS256)
│   ├── TokenHasher.java                   ← jetons opaques et hachage SHA-256
│   └── EffectivePermissionResolver.java   ← permissions effectives d'un utilisateur
└── services/ (AuthService, UserService, RoleService + interfaces IAuthService, IUserService, IRoleService)
```

---

## Modèle de permissions

- Une **permission** est un code `DOMAINE_ACTION` (ex. `PAIE_WRITE`). Le catalogue est **fixe** : créé par
  migration, il n'est jamais modifié depuis l'interface. Liste complète : [../rbac/README.md](../rbac/README.md).
- Un **rôle** regroupe des permissions. Les rôles sont **administrables** : création libre, permissions
  assignées librement (`/admin/roles`).
- Un **utilisateur** a zéro ou plusieurs rôles. Ses **permissions effectives** sont l'union des permissions de
  tous ses rôles, **moins** ses permissions refusées individuellement.
- Un refus individuel l'emporte toujours sur les rôles (« deny override »).
- La suppression est une permission comme les autres (`*_DELETE`), jamais un rôle codé en dur.
- Un rôle (ex. `SYSTEM_ADMIN`) est aussi transmis comme autorité dans le jeton, mais aucune règle métier ne
  s'appuie sur un nom de rôle, à l'exception de l'accès aux endpoints Actuator.

### Rôles de départ (migration V4)

| Rôle | Permissions |
|---|---|
| `SYSTEM_ADMIN` | Toutes (y compris `USER_MANAGE` et `ROLE_MANAGE`) |
| `PAIE_MANAGER` | Toutes les permissions métier, sans `USER_MANAGE` ni `ROLE_MANAGE` |

Les permissions `EQUIPE_*` (migration V9) sont attribuées aux rôles qui portaient déjà les permissions
`CHANTIER_*`. Tout autre rôle se crée depuis l'écran **Rôles**.

### Compte administrateur de départ

Au démarrage, `AdminBootstrapRunner` crée un compte `SYSTEM_ADMIN` à partir de `ADMIN_USERNAME`,
`ADMIN_EMAIL` et `ADMIN_PASSWORD` **s'il n'existe aucun compte portant ce rôle**. Ensuite, la variable est
sans effet : changer le mot de passe se fait depuis l'interface. Ne jamais laisser le mot de passe d'exemple
(voir [../configuration.md](../configuration.md)).

---

## Authentification

### Deux jetons

| | Jeton d'accès | Jeton de rafraîchissement |
|---|---|---|
| Nature | JWT signé HS256 | Chaîne aléatoire opaque de 256 bits |
| Durée | **15 minutes** | **30 jours** |
| Contenu | `sub` (username), `uid`, `permissions`, `roles`, `iss`, `iat`, `exp` | Rien : une clé vers une ligne de `refresh_token` |
| Stockage côté client | **En mémoire** (jamais `localStorage`) : perdu au rechargement de la page | Cookie `refresh_token`, `httpOnly`, `SameSite=Lax`, chemin `/auth`, `Secure` selon `COOKIE_SECURE` |
| Stockage côté serveur | Aucun (stateless) | Haché SHA-256 en base, jamais en clair |
| Transport | En-tête `Authorization: Bearer …` | Cookie seulement, jamais dans un corps JSON |

### Flux

```text
Connexion      POST /auth/login {username, password}
               → 200 { accessToken, utilisateur }  + cookie refresh_token (nouvelle famille)
Appel API      Authorization: Bearer <accessToken>
Jeton expiré   401 → le frontend appelle POST /auth/refresh (un seul appel, partagé)
               → 200 { accessToken, utilisateur }  + nouveau cookie ; l'ancien jeton est révoqué
Rechargement   Au démarrage, le frontend tente /auth/refresh : le cookie survit, pas le jeton d'accès
Déconnexion    POST /auth/logout → révoque le jeton courant, efface le cookie
```

### Rotation et détection de vol

Chaque rafraîchissement est à **usage unique** : il révoque le jeton présenté et en émet un nouveau, de la même
**famille**. Tous les jetons issus d'une même connexion partagent une `famille` (`refresh_token.famille`).

Si un jeton **déjà révoqué** est présenté de nouveau, c'est que deux personnes détiennent le même jeton
(vol possible) : **toute la famille est révoquée** et la requête est refusée (`401`). Le propriétaire légitime
et le voleur doivent alors se reconnecter. Les sessions ouvertes sur d'autres appareils ne sont pas touchées.
La révocation reste enregistrée même si la requête échoue (`noRollbackFor`). Un jeton expiré est simplement
refusé.

### Mot de passe oublié

1. `POST /auth/forgot-password {email}` répond **toujours `202`**, que le compte existe ou non (on ne révèle
   jamais l'existence d'un compte). Si le compte existe, un jeton à usage unique (valable **1 heure**, haché en
   base) est envoyé par courriel : lien `<FRONTEND_URL>/reset-password?token=…`.
2. `POST /auth/reset-password {token, nouveauMotDePasse}` : change le mot de passe, marque le jeton utilisé et
   **révoque tous les jetons de rafraîchissement actifs** de l'utilisateur. Un jeton déjà utilisé, expiré ou
   inconnu est refusé (`400`).

`FRONTEND_URL` doit être l'URL publique complète de l'application, sinon le lien du courriel est invalide
(voir [../deployment.md](../deployment.md)).

### Mots de passe

BCrypt. Longueur de 8 à 100 caractères (création et réinitialisation). Aucune règle de complexité.

### Ce qui est révocable

| Élément | Révocable avant expiration ? |
|---|---|
| Jeton d'accès | **Non** : valable jusqu'à ses 15 minutes, même si le compte est désactivé ou ses permissions modifiées |
| Jeton de rafraîchissement | Oui : déconnexion, réinitialisation par courriel, détection de vol |

**Conséquence** : un changement de rôle ou de refus individuel ne prend effet qu'au prochain rafraîchissement
de l'utilisateur concerné (au plus 15 minutes). Le frontend relit ses permissions à chaque rafraîchissement.

---

## Comptes utilisateurs

Un compte est **indépendant** d'un employé (un administrateur n'est pas forcément un ouvrier), avec un lien
**optionnel** vers une fiche employé.

| Champ | Règle |
|---|---|
| `username` | 3 à 50 caractères, **unique** ; **non modifiable** après création |
| `email` | Format courriel, **unique** |
| `motDePasse` | 8 à 100 caractères (création uniquement) |
| `actif` | Un compte inactif ne peut pas se connecter |
| `employeeId` | Optionnel ; un identifiant inconnu est refusé (`400`) |
| `roleIds` | Zéro ou plusieurs rôles existants |
| Permissions refusées | Modifiées séparément (`PUT /users/{id}/permissions-refusees`), limitées côté interface aux permissions que les rôles actuels accordent |

Un administrateur peut réinitialiser le mot de passe d'un compte (`POST /users/{id}/reset-password`). Il n'existe
**pas** de suppression de compte : on désactive.

### Écran Utilisateurs (`/admin/users`)

Liste (tableau standard, voir [../frontend/README.md](../frontend/README.md)), formulaire de création et de
modification : username, email, mot de passe (création), compte actif, employé lié (sélecteur à chargement
différé), rôles, et — en modification seulement — les permissions refusées.

## Rôles

| Champ | Règle |
|---|---|
| `nom` | 2 à 50 caractères, **unique** |
| `description` | Facultative, 255 caractères maximum |
| `permissionIds` | Zéro ou plusieurs permissions du catalogue ; un identifiant inconnu est refusé (`400`) |

`GET /permissions` renvoie le catalogue pour alimenter l'écran **Rôles** (`/admin/roles`).

---

## API

| Méthode | Route | Description | Accès |
|---|---|---|---|
| `POST` | `/auth/login` | Connexion | Public |
| `POST` | `/auth/refresh` | Rotation du jeton de rafraîchissement | Public (cookie) |
| `POST` | `/auth/logout` | Déconnexion | Authentifié |
| `GET` | `/auth/me` | Profil et permissions effectives de l'utilisateur courant | Authentifié |
| `POST` | `/auth/forgot-password` | Demande de lien de réinitialisation (toujours `202`) | Public |
| `POST` | `/auth/reset-password` | Réinitialisation avec le jeton du courriel | Public |
| `GET` | `/users`, `/users/{id}` | Lister, consulter | `USER_MANAGE` |
| `POST` | `/users` | Créer | `USER_MANAGE` |
| `PUT` | `/users/{id}` | Modifier (email, actif, employé lié, rôles) | `USER_MANAGE` |
| `PUT` | `/users/{id}/permissions-refusees` | Remplacer les refus individuels | `USER_MANAGE` |
| `POST` | `/users/{id}/reset-password` | Réinitialiser le mot de passe | `USER_MANAGE` |
| `GET` | `/roles`, `/roles/{id}` | Lister, consulter | `ROLE_MANAGE` |
| `POST` | `/roles` | Créer | `ROLE_MANAGE` |
| `PUT` | `/roles/{id}` | Modifier | `ROLE_MANAGE` |
| `DELETE` | `/roles/{id}` | Supprimer | `ROLE_MANAGE` |
| `GET` | `/permissions` | Catalogue des permissions | `ROLE_MANAGE` |

Codes d'erreur : `401` identifiants ou jeton invalides, `400` validation / jeton de réinitialisation invalide /
référence inconnue, `404` utilisateur ou rôle inexistant, `409` username, email ou nom de rôle déjà pris.

---

## Frontend

| Élément | Fichier / rôle |
|---|---|
| `AuthService` | Jeton d'accès et utilisateur courant en signaux, `login`, `logout`, `refreshOnce` (un seul rafraîchissement partagé), `restoreSession`, `hasPermission`, `hasAnyPermission` |
| `authInterceptor` | Ajoute le jeton, gère le `401` par un rafraîchissement puis un rejeu, sinon renvoie vers `/login` |
| `errorInterceptor` | Affiche le message de l'API dans une notification |
| `authGuard` | Exige d'être connecté |
| `permissionGuard` | Exige la permission déclarée dans `data: { permission }` (ou `permissions` : au moins une) ; un refus mène à `/acces-refuse` |
| `homeGuard` | Route `/` : premier écran du menu autorisé, sinon `/acces-refuse` |
| Écrans | `/login`, `/forgot-password`, `/reset-password`, `/acces-refuse` |
| Initialisation | `APP_INITIALIZER` tente la restauration de session **avant** les routes, pour qu'un F5 sur une page protégée ne renvoie pas à `/login` |

Détail des guards et du menu : [../frontend/README.md](../frontend/README.md).

---

## Sécurité du transport

- **CSRF désactivé** : tous les endpoints métier s'authentifient par l'en-tête `Authorization`, qu'un site tiers
  ne peut pas positionner. Seuls `/auth/refresh` et `/auth/logout` lisent le cookie ; le pire cas d'un CSRF y
  est une déconnexion forcée.
- **CORS ouvert à toute origine** avec cookies autorisés (décision du 2026-09-23) : risque borné par
  `SameSite=Lax`. Voir [../deployment.md](../deployment.md).
- Chemins publics : `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`,
  `/actuator/health`, Swagger. Tout le reste exige un jeton valide.

---

## Tests

`EndpointSecurityTest` et `JwtSecurityChainTest` vérifient les permissions de tous les endpoints et la chaîne
JWT complète ; `AuthServiceTest` couvre connexion, rotation, vol de jeton et réinitialisation. Voir
[../testing.md](../testing.md) et [../rbac/auth.md](../rbac/auth.md).

---

## Limites connues

À trancher et corriger — suivies dans [TODO.md](../../TODO.md) :

- **Un compte désactivé peut continuer à se rafraîchir** : `refresh` ne vérifie pas `actif`, et la
  désactivation ne révoque pas les jetons existants. Le compte garde donc un accès jusqu'à 30 jours.
- **La réinitialisation du mot de passe par un administrateur ne révoque pas** les sessions ouvertes du compte
  (contrairement à la réinitialisation par courriel).
- **Pas de limitation du nombre de tentatives** de connexion ni de demandes de réinitialisation.
- **Aucune règle de complexité** de mot de passe (longueur seulement).
- Aucun audit des connexions et des changements de droits (voir « Audit » dans le TODO).
