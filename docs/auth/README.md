# Module Auth

> Connexion, sessions, comptes utilisateurs, rôles et permissions. Ce document décrit le fonctionnement
> du module ; la liste endpoint par endpoint des permissions requises est dans
> [../rbac/auth.md](../rbac/auth.md), le catalogue complet des permissions dans
> [../rbac/README.md](../rbac/README.md), et les principes de conception dans
> `conventions/security.md`.

Le [modèle et les contrats DTO](contrats.md) précisent les types, bornes, champs facultatifs et réponses
utilisés par les écrans de ce domaine. Les paramètres de fonctionnement ont leur
[dossier propre](../parametre/README.md).

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

### Rôles de départ (migrations V4 et V28)

| Rôle | Permissions |
|---|---|
| `SYSTEM_ADMIN` | Toutes (y compris `USER_MANAGE`, `ROLE_MANAGE` et `AUDIT_READ`) |
| `PAIE_MANAGER` | Toutes les permissions métier, sans `USER_MANAGE` ni `ROLE_MANAGE` |
| `DIRECTION` (V28) | `CARTE_READ` seulement (le Président et les directeurs) |

Les permissions `EQUIPE_*` (migration V9) sont attribuées aux rôles qui portaient déjà les permissions
`CHANTIER_*`. `AUDIT_READ` (migration V12) est attribuée à `SYSTEM_ADMIN` seulement. `CARTE_READ` (migration V28) est attribuée à `SYSTEM_ADMIN` et au rôle `DIRECTION`, pas à `PAIE_MANAGER`. Tout autre rôle se crée depuis l'écran **Rôles**.

### Compte administrateur de départ

Au démarrage, `AdminBootstrapRunner` crée un compte `SYSTEM_ADMIN` à partir de `ADMIN_USERNAME`,
`ADMIN_EMAIL` et `ADMIN_PASSWORD` **s'il n'existe aucun compte portant ce rôle**. Ensuite, la variable est
sans effet : changer le mot de passe se fait depuis l'interface. Ne jamais laisser le mot de passe d'exemple
(voir [../configuration.md](../configuration.md)). La création est attribuée à « Système », d'origine `DEMARRAGE`, dans
l'audit (`UserService.creerAdminInitial`, appelé seulement quand `adminExiste()` est faux : un redémarrage ne laisse aucune trace).

---

## Authentification

### Deux jetons

| | Jeton d'accès | Jeton de rafraîchissement |
|---|---|---|
| Nature | JWT signé HS256 | Chaîne aléatoire opaque de 256 bits |
| Durée initiale | **15 minutes** (réglable) | **12 heures** (réglable) |
| Contenu | `sub` (username), `uid`, `permissions`, `roles`, `iss`, `aud`, `iat`, `exp` | Rien : une clé vers une ligne de `refresh_token` |
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

Un jeton présenté par un **compte désactivé** est refusé (`401`) et consommé, avec un événement `SESSION_RENOUVELLEMENT_REFUSE`
(motif `COMPTE_INACTIF`) : une session ne survit pas à la désactivation, même faite hors de l'application (par SQL).

### Mot de passe oublié

1. `POST /auth/forgot-password {email}` répond **toujours `202`**, que le compte existe ou non (on ne révèle
   jamais l'existence d'un compte). Si le compte existe, un jeton à usage unique (valable **60 minutes par défaut**, durée réglable, haché en
   base) est envoyé par courriel : lien `<FRONTEND_URL>/reset-password#token=…`. Le fragment est lu par
   Angular, gardé en mémoire le temps du formulaire puis retiré de l'URL ; il n'est pas transmis dans
   les requêtes ni dans les journaux d'accès nginx. Le frontend renvoie aussi `Referrer-Policy: no-referrer`.
2. `POST /auth/reset-password {token, nouveauMotDePasse}` : change le mot de passe, marque le jeton utilisé et
   **révoque tous les jetons de rafraîchissement actifs** de l'utilisateur. Un jeton déjà utilisé, expiré ou
   inconnu est refusé (`400`).

`FRONTEND_URL` doit être l'URL publique complète de l'application, sinon le lien du courriel est invalide
(voir [../deployment.md](../deployment.md)).

L'envoi SMTP s'exécute sur le pool asynchrone dédié `mailTaskExecutor` : 2 travailleurs de base, 4 au
maximum, file bornée à 100 tâches et conservation des travailleurs inactifs pendant 30 secondes.
Les délais SMTP sont de 5 s pour la connexion, 3 s pour la lecture et 5 s pour l'écriture. Quand la
file est pleine, la tâche est rejetée immédiatement : la réponse `202` générique reste identique,
et un avertissement technique ne contient ni adresse ni jeton. La file est en mémoire ; un arrêt
forcé peut perdre les envois en attente, et une demande peut être renouvelée. Ces valeurs sont un
profil initial accepté pour la mesure locale, pas une garantie de capacité de production.

### Mots de passe

BCrypt. Règle (`PolitiqueMotDePasse`) : longueur minimale réglable (**10 caractères par défaut**, de 8 à 100 ; 100 au plus),
**différent de l'identifiant** (casse ignorée). Aucune combinaison de catégories de caractères n'est imposée. Elle s'applique à la création d'un compte et aux deux
réinitialisations (par lien, par un administrateur) ; un mot de passe refusé répond `400` avec la règle, jamais la valeur, et ne
brûle pas le lien de réinitialisation. Les mots de passe existants ne changent pas. Le mot de passe du compte d'amorçage vient de
la configuration (`ADMIN_PASSWORD`) et n'y est pas soumis. Les formulaires vérifient la longueur dès que la politique est
chargée ; le serveur reste l'autorité et vérifie aussi la différence avec l'identifiant.

### Ce qui est révocable

| Élément | Révocable avant expiration ? |
|---|---|
| Jeton d'accès | **Non** : valable jusqu'à son expiration (15 minutes par défaut, durée réglable), même si le compte est désactivé ou ses permissions modifiées |
| Jeton de rafraîchissement | Oui : déconnexion, réinitialisation du mot de passe (par courriel **ou par un administrateur**), **désactivation du compte**, détection de vol — `AuthService.revoquerSessions` coupe toutes les sessions d'un compte |

Exception : le **jeton agent** de l'assistant IA (voir « Jeton délégué de l'assistant IA ») ne porte aucune permission ; la
route `/mcp` relit le compte et ses droits à chaque appel, donc une désactivation ou un retrait de droit s'y applique tout de suite.

**Conséquence** : un changement de rôle ou de refus individuel ne prend effet qu'au prochain rafraîchissement
de l'utilisateur concerné (au plus la durée réglée du jeton d'accès). Le frontend relit ses permissions à chaque rafraîchissement.
De même, un compte désactivé ou dont le mot de passe vient d'être réinitialisé **perd ses sessions tout de suite, sauf
le jeton d'accès déjà émis, qui reste valable jusqu'à son expiration** (risque assumé : le révoquer exigerait une lecture en
base à chaque requête).

### Jeton délégué de l'assistant IA

Le navigateur obtient, avec son jeton d'accès, un **jeton agent** (`POST /auth/jetons/agent`, permission `IA_UTILISER`) et
le transmet au service IA, qui le présente à la route `/mcp`. Décision et architecture : [ia.md](../ia.md), § 5.

| Élément | Règle |
|---|---|
| Signature | RS256, clé RSA de 3072 bits au moins (`MCP_JWT_PRIVATE_KEY`, `MCP_JWT_KEY_ID`) ; jamais le `JWT_SECRET` |
| Contenu | `iss`, `sub`, `uid`, `aud` = `erp-rh-ia` et `erp-rh-mcp`, `scope` = `mcp:lecture`, `jti`, dates ; **aucune permission** |
| Durée | 5 minutes ; Angular en redemande un à chaque question |
| Cloisonnement | Refusé par toutes les routes REST ; le jeton d'accès REST est refusé par `/mcp` |
| Contrôle à chaque appel MCP | Compte actif, identifiant cohérent avec `sub`, permissions effectives (refus individuels compris), `IA_UTILISER` et scope |
| Clés publiques | `GET /.well-known/jwks.json` : clé courante et, pendant un changement, clé précédente |
| Journal | `JETON_AGENT_EMIS` (identifiant `jti` et durée, jamais le jeton) et `JETON_AGENT_REFUSE` (motif) |

**Changer de clé** : générer une nouvelle clé, placer l'ancienne clé publique (base64 d'un X.509 DER) dans
`MCP_JWT_PREVIOUS_PUBLIC_KEY` et son identifiant dans `MCP_JWT_PREVIOUS_KEY_ID`, la nouvelle clé dans `MCP_JWT_PRIVATE_KEY`
avec un nouvel identifiant, redémarrer, puis vider les deux variables précédentes après 5 minutes.

---

## Comptes utilisateurs

Un compte est **indépendant** d'un employé (un administrateur n'est pas forcément un ouvrier), avec un lien
**optionnel** vers une fiche employé.

| Champ | Règle |
|---|---|
| `username` | 3 à 50 caractères, espaces extérieurs retirés, **unique sans casse** ; **non modifiable** après création |
| `email` | Format courriel, espaces extérieurs retirés, **unique sans casse** |
| `motDePasse` | Règle des mots de passe (voir plus haut), création uniquement |
| `actif` | Un compte inactif ne peut ni se connecter ni se rafraîchir ; **le désactiver coupe ses sessions** (jetons de rafraîchissement révoqués) |
| `employeeId` | Optionnel ; un identifiant inconnu est refusé (`400`) |
| `roleIds` | Zéro ou plusieurs rôles existants |
| Permissions refusées | Modifiées séparément (`PUT /users/{id}/permissions-refusees`), limitées côté interface aux permissions que les rôles actuels accordent |

Un administrateur peut réinitialiser le mot de passe d'un compte (`POST /users/{id}/reset-password`) : comme la
réinitialisation par courriel, cela **révoque toutes les sessions ouvertes** du compte (leur nombre figure dans l'entrée
d'audit). Il n'existe **pas** de suppression de compte : on désactive.

### Écran Utilisateurs (`/admin/users`)

Liste (tableau standard, voir [../frontend/README.md](../frontend/README.md)), formulaire de création et de
modification : username, email, mot de passe (création), compte actif, employé lié (sélecteur à chargement
différé), rôles, et — en modification seulement — les permissions refusées.

L'édition charge le compte, le catalogue des permissions et les rôles sélectionnés avant d'ouvrir la saisie.
Une erreur de lecture est annoncée avec un réessai ; aucun formulaire incomplet n'est enregistrable.
Le lien vers un employé se sélectionne avec `EMPLOYEE_READ`. Sans cette lecture, le lien courant reste
visible et conservé, sans interroger le référentiel Employé. Les rôles et leurs permissions sont consultables
avec `USER_MANAGE` pour administrer les comptes, sans autoriser l'écriture d'un rôle.

L'enregistrement des informations du compte puis des refus individuels utilise deux opérations distinctes.
Si la seconde échoue, l'écran indique que les informations sont déjà enregistrées, conserve les refus saisis
et permet de terminer avec la version courante. Un changement de filtre ou de page annule une recherche
précédente encore en cours afin qu'une réponse tardive ne remplace pas la liste demandée.

## Rôles

| Champ | Règle |
|---|---|
| `nom` | 2 à 50 caractères, espaces extérieurs retirés, **unique sans casse** |
| `description` | Facultative, 255 caractères maximum |
| `permissionIds` | Zéro ou plusieurs permissions du catalogue ; un identifiant inconnu est refusé (`400`) |

`GET /permissions` renvoie le catalogue pour alimenter l'écran **Rôles** (`/admin/roles`).

Le formulaire applique les mêmes bornes que l'API : nom de 2 à 50 caractères après retrait des espaces
extérieurs et description de 255 caractères au plus. Une sélection partielle de permissions est signalée
sur la case du domaine. L'échec du chargement du rôle ou du catalogue empêche toute sauvegarde et propose
un réessai. Après suppression du dernier rôle d'une page, la liste revient à la page précédente.

**Suppression** : refusée (`409`) si le rôle est encore attribué à des comptes — le message donne leur nombre — et toujours
refusée pour `SYSTEM_ADMIN` ; les liaisons sont en `ON DELETE RESTRICT`, la base confirme la règle. Un rôle supprimé retire
ses permissions une à une : l'audit voit chaque retrait.

**Le rôle `SYSTEM_ADMIN` est protégé** (`409`, `ProtectedRoleException`) : il ne peut être ni supprimé, ni **renommé** (l'amorçage du
premier compte le cherche par son nom), ni **privé d'une permission** (il perdrait de quoi administrer les comptes, les rôles
et l'audit). Seule sa description se modifie ; l'écran verrouille le nom et les cases à cocher (`protege` dans la réponse de l'API).
Les nouvelles permissions lui sont attribuées par les migrations (voir `V12`, `V15`).

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
| `GET` | `/auth/password-policy` | Lire la longueur minimale du mot de passe | Public |
| `POST` | `/auth/jetons/agent` | Jeton délégué de l'assistant IA (5 minutes) | `IA_UTILISER` |
| `GET` | `/.well-known/jwks.json` | Clés publiques des jetons agent | Public |
| `POST` | `/users/search` | Rechercher avec filtres et pagination serveur | `USER_MANAGE` |
| `GET` | `/users/{id}` | Consulter | `USER_MANAGE` |
| `POST` | `/users` | Créer | `USER_MANAGE` |
| `PUT` | `/users/{id}` | Modifier (email, actif, employé lié, rôles) | `USER_MANAGE` |
| `PUT` | `/users/{id}/permissions-refusees` | Remplacer les refus individuels | `USER_MANAGE` |
| `POST` | `/users/{id}/reset-password` | Réinitialiser le mot de passe | `USER_MANAGE` |
| `POST` | `/roles/search` | Rechercher avec filtres et pagination serveur | `ROLE_MANAGE` ou `USER_MANAGE` |
| `GET` | `/roles/{id}` | Consulter | `ROLE_MANAGE` ou `USER_MANAGE` |
| `POST` | `/roles` | Créer | `ROLE_MANAGE` |
| `PUT` | `/roles/{id}` | Modifier | `ROLE_MANAGE` |
| `DELETE` | `/roles/{id}` | Supprimer | `ROLE_MANAGE` |
| `GET` | `/permissions` | Catalogue des permissions | `ROLE_MANAGE` ou `USER_MANAGE` |

Codes d'erreur : `401` identifiants ou jeton invalides, `400` validation / jeton de réinitialisation invalide /
référence inconnue, `404` utilisateur ou rôle inexistant, `409` username, email ou nom de rôle déjà pris.
Une modification renvoie aussi `409` quand la version fournie est périmée ; les identifiants de rôles et
permissions sont positifs, non nuls et existants. Il n'existe aucun import, export ni vue analytique propre
aux comptes ou aux rôles.

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
| Écrans | `/login`, `/forgot-password`, `/reset-password`, `/acces-refuse` ; les écrans publics d'authentification partagent un formulaire centré sur la photographie locale `frontend/src/assets/auth/staport-login-atlas.png`, assombrie pour la lisibilité et adaptée aux petits écrans, sans logo ni présentation des fonctions du produit. Le refus d'accès présente une explication claire et un retour à l'accueil |
| Initialisation | `APP_INITIALIZER` tente la restauration de session **avant** les routes, pour qu'un F5 sur une page protégée ne renvoie pas à `/login` |

Détail des guards et du menu : [../frontend/README.md](../frontend/README.md).

---

## Sécurité du transport

- **CSRF** : les endpoints métier s'authentifient par l'en-tête `Authorization`, qu'un site tiers ne peut pas
  positionner. `/auth/logout` exige également ce jeton. Le seul endpoint public authentifié par cookie est
  `/auth/refresh` : une autorisation serveur vérifie son en-tête `Origin` contre la liste CORS exacte avant de
  permettre la rotation. Une requête sans origine ou d'une origine non autorisée est refusée ; `SameSite=Lax`
  constitue une défense supplémentaire.
- **CORS restreint par environnement** : `CORS_ALLOWED_ORIGINS` contient uniquement les origines
  `http(s)` autorisées, sans wildcard ni chemin ; les credentials ne sont renvoyés que pour ces origines.
  Voir [../deployment.md](../deployment.md) et [../configuration.md](../configuration.md).
- Chemins publics : `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`,
  `/actuator/health`, et Swagger **seulement en développement** (éteint par défaut, voir [../configuration.md](../configuration.md)). Tout le reste exige un jeton valide.

---

## Tests

`EndpointSecurityTest` et `JwtSecurityChainTest` vérifient les permissions de tous les endpoints et la chaîne
JWT complète (signature HS256, `iss`, `aud`, dates et claims requis) ; `JwtSigningKeyTest` vérifie la taille minimale du
secret. `AuthServiceTest` et `VerrouillageConnexionIntegrationTest` couvrent la connexion, le blocage après échecs,
la rotation, le vol de jeton, la révocation et la réinitialisation. Voir
[../testing.md](../testing.md) et [../rbac/auth.md](../rbac/auth.md).

`AuthRequestValidationTest` couvre les tailles, la normalisation avant validation et les identifiants de
collections invalides. Les specs des listes et formulaires Utilisateurs/Rôles couvrent la saisie, les
permissions, les erreurs et réessais, les réponses tardives, les enregistrements partiels et la pagination.

---

## Limites et protections connues

- **MFA** : l'application n'en utilise pas. La connexion repose sur le mot de passe, les limites de débit,
  le verrouillage temporaire, le stockage protégé des jetons et leur révocation ; ce choix ne fournit pas
  le facteur supplémentaire qu'apporterait une authentification multifacteur.
- **Essais de connexion** : nginx inner limite les tentatives à 20 par minute et par adresse client (`429` au-delà) ; le compte est aussi temporairement bloqué après cinq mots de passe incorrects en quinze minutes. Le blocage dure quinze minutes ; une connexion réussie ou quinze minutes sans nouvel échec remet le compteur à zéro. Un compte bloqué reçoit le même refus générique qu'un compte avec des identifiants invalides. Les événements d'échec et de blocage sont inscrits dans le journal `SECURITE`.
- La connexion fait toujours le même travail de hachage (identifiant inconnu, compte inactif, mot de passe faux) : la durée de la réponse ne révèle pas si un compte existe. Le courriel de réinitialisation part en tâche asynchrone (`@Async`) : la demande répond aussi vite que l'adresse corresponde ou non à un compte, et un échec d'envoi est journalisé sans jamais être renvoyé à l'appelant.
- Les connexions, refus d'accès, changements de droits et de mots de passe sont journalisés (voir [../audit/README.md](../audit/README.md)).

## Couche IA

L'assistant RH agit **pour l'utilisateur connecté**, avec un jeton court RS256 émis par le backend (audience `mcp`, cinq minutes) : chaque appel d'outil revalide l'émetteur, l'audience, l'expiration et les permissions. Deux outils MCP de lecture exposent l'identité et les rôles.

| Outil | Ce qu'il fait | Permission | Audit |
|---|---|---|---|
| `systeme_identite` | Identité de l'utilisateur pour qui l'assistant agit et liste complète de ses droits (permissions et rôles) ; sert à comprendre un refus « Access Denied » | `IA_UTILISER` (route `/mcp`) | aucune entrée propre : l'outil ne lit que l'identité de l'appelant |
| `roles_lister` | Rôles et permissions que chacun accorde (jamais les comptes), filtre facultatif sur le nom ; 20 rôles au plus, avec le total | `ROLE_MANAGE` | `MCP_ROLES_LISTER` |

- **Usage.** « Qui peut voir la paie ? », « Que permet le rôle X ? », « Pourquoi ai-je un refus ? ».
- **Refus.** Un outil sans la permission requise répond « Access Denied » ; l'agent doit l'expliquer sans contourner ni réessayer, et l'événement est journalisé (`ACCES_REFUSE`).
- **Limites.** Aucun outil ne crée ni ne modifie un compte, un rôle ou une permission ; le `JWT_SECRET` n'est jamais partagé avec le service IA ; le jeton de l'agent a l'audience `mcp` et ne vaut que pour cette route.
