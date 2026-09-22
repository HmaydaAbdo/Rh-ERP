# Security

> Conventions de sécurité applicables à tout le projet. Authentification JWT auto-émise + RBAC
> dynamique (rôles et permissions administrables, deny overrides individuels).

---

# Authentification

## JWT — Access Token / Refresh Token

* Le backend est son propre émetteur de JWT (pas d'IdP externe) — signature HMAC (HS256), secret
  `${JWT_SECRET}` (voir `conventions/configuration.md`). Validation via
  `spring-boot-starter-oauth2-resource-server` (`SecurityConfig.jwtDecoder`).
* **Access Token** : 15 minutes, contient les claims `permissions` (codes effectifs, voir plus bas)
  et `roles` (noms des rôles) — jamais recalculé en base à chaque requête, c'est tout l'intérêt du
  JWT. Conséquence directe : un changement de permission (rôle modifié, deny override ajouté) ne
  prend effet qu'au prochain refresh (au plus 15 minutes de latence), jamais immédiatement.
* **Refresh Token** : 30 jours, **opaque** (jamais un JWT — une chaîne aléatoire), stocké **hashé**
  en base (`refresh_token.token_hash`, jamais en clair). Posé en cookie `httpOnly` (`AuthController`)
  — jamais lisible par JavaScript, jamais transmis dans un corps JSON.
* **Rotation à usage unique** : chaque appel à `/auth/refresh` révoque le Refresh Token utilisé et
  en émet un nouveau. Un Refresh Token déjà consommé qui est réutilisé (vol détecté) est simplement
  rejeté (`InvalidRefreshTokenException`, 401) — pas de détection de compromission en cascade
  (révocation de toute la famille de tokens) pour l'instant, voir « Points d'attention ».

## Révocation — ce qui est réellement révocable

| Token | Révocable avant expiration ? |
|---|---|
| Access Token (JWT) | **Non** — un JWT signé reste valide jusqu'à son expiration naturelle (15 min), même si le compte est désactivé ou le mot de passe changé entre-temps. Risque accepté et borné par la durée courte. |
| Refresh Token (opaque, en base) | **Oui** — `logout`, réinitialisation de mot de passe (révoque tous les Refresh Tokens actifs de l'utilisateur), et une révocation admin future peuvent l'invalider immédiatement. |

## Cookie Refresh Token

* `httpOnly`, `SameSite=Lax`, `path=/auth`, `secure=${COOKIE_SECURE}`.
* `SameSite=Lax` (au lieu de `None`) suffit **grâce au proxy de développement Angular**
  (`frontend/proxy.conf.js`) : le frontend et le backend sont toujours same-origin du point de vue
  du navigateur (celui-ci ne voit qu'une requête vers `localhost:4200`, le proxy relaie vers le
  backend en coulisses). Si un jour le frontend est servi séparément du backend (domaines
  distincts), cette stratégie de cookie doit être révisée (`SameSite=None; Secure`, HTTPS
  obligatoire).

## CSRF — désactivé, risque résiduel documenté

Tous les endpoints métier s'authentifient par l'en-tête `Authorization: Bearer ...` (immunisé au
CSRF — un site tiers ne peut pas positionner cet en-tête sur une requête cross-site). Seuls
`/auth/refresh` et `/auth/logout` lisent le cookie. CSRF est désactivé globalement
(`SecurityConfig`) : le pire cas d'un CSRF sur ces deux endpoints est une rotation/révocation
prématurée du Refresh Token de la victime (déconnexion forcée), jamais une fuite de données —
risque jugé acceptable et volontairement non traité pour l'instant (voir « Points d'attention »).

---

# Autorisation — RBAC dynamique

## Modèle

```
Utilisateur ──< utilisateur_role >── Role ──< role_permission >── Permission
     │
     └──< utilisateur_permission_refusee >── Permission   (deny override)
```

* **Permission** : catalogue **fixe**, une ligne par domaine × action (`CHANTIER_READ`,
  `EMPLOYEE_DELETE`, `PAIE_EXPORT`, `USER_MANAGE`, `ROLE_MANAGE`, etc. — voir
  `V4__seed_permissions_et_roles.sql` pour la liste complète). Jamais créé/modifié depuis l'UI.
* **Role** : **administrable librement via l'UI** (`/roles`, réservé `ROLE_MANAGE`) — un admin crée
  un rôle et lui assigne les permissions de son choix parmi le catalogue fixe.
* **Utilisateur** : reçoit un ou plusieurs rôles (hérite de l'union de leurs permissions) et peut
  avoir des **deny overrides individuels** — une permission explicitement refusée même si un de ses
  rôles l'accorde.

## Règle de résolution : Deny individuel > Permissions des rôles

```
permissions effectives = (∪ permissions des rôles de l'utilisateur) − (deny overrides de l'utilisateur)
```

Implémentée dans `EffectivePermissionResolver.resolve()`, appelée au moment de l'émission du JWT
(login/refresh) — voir la limite de latence ci-dessus. Il n'existe **pas** d'override individuel
« ALLOW » (accorder une permission hors de tout rôle) — seul le DENY a été demandé ; ne pas
l'introduire sans besoin confirmé (`conventions/architecture.md`).

## DELETE est une permission comme les autres — pas un rôle codé en dur

**Décision (HMAYDA, 2026-09-22)**, qui remplace l'ancienne règle absolue « suppression réservée
SYSTEM_ADMIN codée en dur » : chaque domaine a sa propre permission `<DOMAINE>_DELETE`
(`CHANTIER_DELETE`, `EMPLOYEE_DELETE`, `FUNCTION_DELETE`, `PAIE_DELETE`), vérifiée exactement comme
n'importe quelle autre via `@PreAuthorize`. Les données de seed (`V4__...sql`) n'attribuent ces
permissions qu'au rôle `SYSTEM_ADMIN` — le comportement observé aujourd'hui (« seul admin peut
supprimer ») est donc une **conséquence de la donnée**, pas une règle figée dans le code : un admin
peut, via l'UI de gestion des rôles, décider d'accorder `EMPLOYEE_DELETE` à un autre rôle. C'est un
choix assumé pour rester cohérent avec le principe « toute action a une permission » — si ce n'est
pas le comportement voulu, revenir à un `hasAuthority('SYSTEM_ADMIN')` codé en dur sur les
endpoints `DELETE` est trivial.

## `@PreAuthorize` obligatoire

* Tout endpoint protégé utilise `@PreAuthorize("hasAuthority('CODE_PERMISSION')")` (méthode) ou
  `@PreAuthorize("hasAuthority('...')")` (classe, pour un contrôleur mono-permission comme
  `UserController`/`RoleController`).
* `@EnableMethodSecurity` (`SecurityConfig`) active ces annotations — sans elle, `@PreAuthorize`
  est silencieusement ignoré.
* Refuser par défaut : `SecurityConfig.securityFilterChain` termine par
  `.anyRequest().authenticated()` — tout nouvel endpoint est protégé par défaut, un oubli
  d'annotation `@PreAuthorize` spécifique laisse l'endpoint accessible à **tout utilisateur
  authentifié** (pas ouvert à tous), jamais totalement ouvert par erreur.
* Catalogue permission ↔ endpoint : voir `docs/rbac/<module>.md` pour chaque domaine.

---

# Utilisateurs, rôles, permissions — endpoints d'administration

| Ressource | Endpoint | Permission |
|---|---|---|
| Utilisateurs (CRUD, assignation rôles, deny overrides, reset mot de passe admin) | `/users/**` | `USER_MANAGE` |
| Rôles (CRUD, assignation permissions) | `/roles/**` | `ROLE_MANAGE` |
| Catalogue des permissions (lecture) | `GET /permissions` | `ROLE_MANAGE` |

`Utilisateur` est **indépendant de `Employee`** (référentiel des ouvriers de chantier synchronisé
depuis l'ERP — un concept différent d'un compte applicatif), avec un lien optionnel
(`utilisateur.employee_id`, nullable) pour le cas où un même employé a aussi besoin de se connecter.

---

## Bootstrap admin

Au démarrage, `AdminBootstrapRunner` crée un compte `SYSTEM_ADMIN` depuis
`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (obligatoires, sans défaut) **si et seulement si
aucun utilisateur ne porte déjà le rôle `SYSTEM_ADMIN`** — idempotent, ne recrée jamais un doublon.
Ce compte doit être utilisé pour créer les comptes suivants puis, idéalement, voir son mot de passe
changé via l'UI.

---

## Mot de passe oublié

* `POST /auth/forgot-password` : si l'email correspond à un compte, génère un
  `ResetPasswordToken` opaque (1h, usage unique, hashé en base comme le Refresh Token) et envoie un
  email avec le lien. **Répond toujours `202` que l'email existe ou non** — ne jamais révéler
  l'existence d'un compte (`AuthService.demanderReinitialisationMotDePasse`).
* `POST /auth/reset-password` : consomme le token, change le mot de passe, **révoque tous les
  Refresh Tokens actifs** de l'utilisateur (force une reconnexion partout — bonne pratique après un
  changement de mot de passe).
* Envoi via `spring-boot-starter-mail` — `SMTP_HOST`/`PORT`/`USERNAME`/`PASSWORD`/`AUTH`/`STARTTLS`
  (obligatoires, sans défaut). En développement, `docker-compose.yml` fournit un service **Mailpit**
  (attrape-mail local, UI sur `http://localhost:8025`, aucune authentification requise) — remplacer
  par un vrai fournisseur SMTP en production.
* Alternative admin : `POST /users/{id}/reset-password` (`USER_MANAGE`) — un `SYSTEM_ADMIN`
  réinitialise directement le mot de passe d'un utilisateur, sans email.

---

## Suppression (héritage — voir ci-dessus)

L'ancienne règle absolue « DELETE = SYSTEM_ADMIN codé en dur » a été remplacée par une permission
`<DOMAINE>_DELETE` comme les autres (voir section RBAC ci-dessus). Le frontend continue de
conditionner l'affichage du bouton de suppression à la permission effective de l'utilisateur, pas
à un rôle codé en dur :

```html
@if (authService.hasPermission('EMPLOYEE_DELETE')) {
  <button pButton icon="pi pi-trash" (click)="deleteEmployee(item)"></button>
}
```

---

# Points d'attention (limites connues, assumées)

* **Latence de propagation des permissions (jusqu'à 15 min)** : un rôle modifié ou un deny override
  ajouté ne s'applique qu'au prochain refresh de l'utilisateur concerné — pas de révocation
  immédiate d'une permission en cours de session. Acceptable pour la taille de l'équipe actuelle ;
  à revoir (vérification en base à chaque requête, ou notification de refresh forcé) si un besoin
  de révocation instantanée apparaît.
* **Pas de détection de compromission en cascade sur le Refresh Token** : la réutilisation d'un
  Refresh Token déjà consommé est rejetée, mais ne révoque pas automatiquement les autres tokens de
  la famille/de l'utilisateur — un attaquant qui vole un Refresh Token et l'utilise une fois avant
  l'utilisateur légitime peut passer inaperçu au-delà du rejet de la requête suivante de la
  victime. Amélioration possible : marquer toute la « famille » de tokens compromise et forcer une
  reconnexion complète.
* **CSRF désactivé globalement** — voir justification ci-dessus (Bearer token sur tout endpoint
  métier, risque résiduel borné au refresh/logout).
* **Access Token non révocable avant expiration** — accepté, borné à 15 minutes.
* **`SameSite=Lax` dépend du proxy de développement Angular** pour rester same-origin — à revoir
  si le frontend est un jour déployé séparément du backend.

---

# Configuration

## Variables d'environnement

* Les paramètres dépendant de l'environnement utilisent exclusivement des variables
  d'environnement, jamais de valeur par défaut (`conventions/configuration.md`) :
  `JWT_SECRET`, `FRONTEND_URL`, `COOKIE_SECURE`, `ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`,
  `SMTP_HOST`/`PORT`/`USERNAME`/`PASSWORD`/`AUTH`/`STARTTLS`, `MAIL_FROM`.

## Secrets

Ne jamais stocker dans le code : mot de passe, secret JWT, clé API, certificat, token d'accès.
Secrets dans `.env` (développement, jamais versionné) ou variables d'environnement (production).
`.env.example` doit toujours rester à jour (valeurs factices).

---

# Pagination

Toute pagination doit être bornée. `PageableUtils.clampSize(size)` si `PageRequest` est construit
manuellement, `spring.data.web.pageable.max-page-size` sinon.

---

# Actuator

* `/actuator/health` et `/actuator/prometheus` sont publics (scraping, pas de données sensibles).
* Tous les autres endpoints `/actuator/**` sont réservés à `hasAuthority('SYSTEM_ADMIN')` (rôle,
  pas permission — restriction au niveau `SecurityConfig`, pas au niveau du catalogue de
  permissions : l'observabilité technique n'est pas une permission métier assignable).

---

# Validation

* Toute entrée utilisateur est validée avec Jakarta Validation.
* Les validations métier complémentaires sont réalisées dans les Services.
* Une donnée invalide doit être rejetée le plus tôt possible (Fail Fast).

---

# Principes

* Aucun secret dans le code source.
* Aucune information sensible dans les messages d'erreur (`InvalidCredentialsException` ne révèle
  jamais si c'est le username ou le mot de passe qui est incorrect ;
  `demanderReinitialisationMotDePasse` ne révèle jamais si un email existe).
* Aucun contournement des mécanismes de sécurité pour simplifier un développement.
* Toute nouvelle fonctionnalité respecte les conventions de sécurité existantes — tout nouvel
  endpoint définit explicitement sa permission requise (`@PreAuthorize`).
* La sécurité est une responsabilité de chaque développement.
