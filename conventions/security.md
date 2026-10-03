# Security

> Conventions de sécurité applicables à tout le projet. Ce document décrit un pattern
> d'authentification JWT auto-émise + RBAC dynamique (rôles et permissions administrables, deny
> overrides individuels) — générique et réutilisable d'un projet à l'autre. Le catalogue réel de
> permissions/rôles d'un projet donné, ainsi que toute décision spécifique à ce projet, vivent dans
> sa propre documentation (`docs/rbac/`), jamais ici.

---

# Authentification

## JWT — Access Token / Refresh Token

* Le backend est son propre émetteur de JWT (pas d'IdP externe) — signature HMAC (HS256, choix confirmé le
  2026-10-03 : un seul service émet et valide les tokens, une paire de clés RS256 n'apporterait rien tant qu'aucun
  autre service ne valide les tokens), secret
  `${JWT_SECRET}` (voir `conventions/configuration.md`). Validation via
  `spring-boot-starter-oauth2-resource-server` (`SecurityConfig.jwtDecoder`).
* **Access Token** : courte durée (ex. 15 minutes), contient les claims `permissions` (codes
  effectifs, voir plus bas) et `roles` (noms des rôles) — jamais recalculé en base à chaque requête,
  c'est tout l'intérêt du JWT. Conséquence directe : un changement de permission (rôle modifié, deny
  override ajouté) ne prend effet qu'au prochain refresh de l'utilisateur concerné, jamais
  immédiatement.
* **Refresh Token** : longue durée (ex. 30 jours), **opaque** (jamais un JWT — une chaîne
  aléatoire), stocké **hashé** en base (jamais en clair). Posé en cookie `httpOnly` — jamais lisible
  par JavaScript, jamais transmis dans un corps JSON.
* **Rotation à usage unique** : chaque appel à `/auth/refresh` révoque le Refresh Token utilisé et
  en émet un nouveau, de la même **famille** (tous les tokens issus d'une même connexion). Un Refresh
  Token déjà consommé qui est réutilisé (vol détecté) est rejeté (401) **et révoque toute sa famille**, ce qui
  force une reconnexion complète (voir « Points d'attention »). La révocation doit rester enregistrée même
  quand la requête se termine par une erreur.

## Révocation — ce qui est réellement révocable

| Token | Révocable avant expiration ? |
|---|---|
| Access Token (JWT) | **Non** — un JWT signé reste valide jusqu'à son expiration naturelle, même si le compte est désactivé ou le mot de passe changé entre-temps. Risque accepté et borné par la durée courte du token. |
| Refresh Token (opaque, en base) | **Oui** — logout, réinitialisation de mot de passe (doit révoquer tous les Refresh Tokens actifs de l'utilisateur), détection de vol (révocation de la famille) et une révocation admin explicite peuvent l'invalider immédiatement. |

## Cookie Refresh Token

* `httpOnly`, `SameSite=Lax` (ou `Strict`), `path` limité à la portée des endpoints d'auth,
  `secure=${COOKIE_SECURE}` (variable d'environnement, jamais figé en dur — voir
  `conventions/configuration.md`).
* `SameSite=Lax` suffit **si le frontend et le backend restent same-origin du point de vue du
  navigateur** — typiquement via un proxy de développement (ex. proxy Angular CLI) qui relaie les
  appels API vers le backend en coulisses, ou un reverse-proxy en production qui sert les deux sous
  le même domaine. Si le frontend est un jour servi depuis un domaine réellement distinct du
  backend, cette stratégie de cookie doit être révisée (`SameSite=None; Secure`, HTTPS obligatoire).

## CSRF

Si tous les endpoints métier s'authentifient par l'en-tête `Authorization: Bearer ...` (immunisé au
CSRF — un site tiers ne peut pas positionner cet en-tête sur une requête cross-site) et que seuls
les endpoints d'authentification (refresh/logout) lisent le cookie, désactiver CSRF globalement est
un choix défendable : le pire cas d'un CSRF sur ces deux endpoints est une rotation/révocation
prématurée du Refresh Token de la victime (déconnexion forcée), jamais une fuite de données. Ce
choix doit rester documenté explicitement comme un risque résiduel assumé (voir « Points
d'attention »), jamais silencieux.

---

# Autorisation — RBAC dynamique

## Modèle

```
Utilisateur ──< utilisateur_role >── Role ──< role_permission >── Permission
     │
     └──< utilisateur_permission_refusee >── Permission   (deny override)
```

* **Permission** : catalogue **fixe**, une ligne par domaine × action (ex. `<DOMAINE>_READ`,
  `<DOMAINE>_WRITE`, `<DOMAINE>_DELETE`, plus les permissions d'administration du RBAC lui-même,
  ex. `USER_MANAGE`, `ROLE_MANAGE`). Jamais créé/modifié depuis l'UI — seul un administrateur du
  code (migration de base de données) fait évoluer ce catalogue.
* **Role** : **administrable librement via l'UI**, réservé à une permission d'administration dédiée
  — un administrateur crée un rôle et lui assigne les permissions de son choix parmi le catalogue
  fixe.
* **Utilisateur** : reçoit un ou plusieurs rôles (hérite de l'union de leurs permissions) et peut
  avoir des **deny overrides individuels** — une permission explicitement refusée même si un de ses
  rôles l'accorde.

## Règle de résolution : Deny individuel > Permissions des rôles

```
permissions effectives = (∪ permissions des rôles de l'utilisateur) − (deny overrides de l'utilisateur)
```

Calculée au moment de l'émission du JWT (login/refresh) — voir la limite de latence ci-dessus. Ne
pas introduire d'override individuel « ALLOW » (accorder une permission hors de tout rôle) sans
besoin confirmé — un deny-only reste plus simple à raisonner (`conventions/architecture.md`).

## DELETE est une permission comme les autres — pas un rôle codé en dur

Par défaut, une action de suppression est soumise à une permission `<DOMAINE>_DELETE` comme
n'importe quelle autre action, vérifiée via `@PreAuthorize` — pas à un rôle codé en dur dans le
code. Quel(s) rôle(s) reçoivent cette permission est une décision de **données** (seed initial,
puis administrable via l'UI de gestion des rôles), pas une règle figée dans le code : cela permet à
un administrateur d'ajuster qui peut supprimer sans changement de code. Si un projet a besoin d'une
garantie plus stricte (suppression **jamais** déléguable, même par erreur de configuration via
l'UI), documenter explicitement ce choix et revenir à une vérification de rôle codée en dur
(`hasAuthority('...')`) sur les endpoints concernés — les deux approches sont valables, mais le
choix doit être explicite et documenté, jamais implicite.

## `@PreAuthorize` obligatoire

* Tout endpoint protégé utilise `@PreAuthorize("hasAuthority('CODE_PERMISSION')")` (méthode) ou au
  niveau de la classe pour un contrôleur mono-permission.
* `@EnableMethodSecurity` doit être actif — sans elle, `@PreAuthorize` est silencieusement ignoré.
* Refuser par défaut : la chaîne de filtres de sécurité doit toujours terminer par
  `.anyRequest().authenticated()` — tout nouvel endpoint est protégé par défaut ; un oubli
  d'annotation `@PreAuthorize` spécifique laisse l'endpoint accessible à **tout utilisateur
  authentifié** (jamais totalement ouvert par erreur, mais jamais correctement restreint non plus).
* Catalogue permission ↔ endpoint : documenté dans `docs/rbac/<module>.md` pour chaque domaine —
  voir « Documentation RBAC » ci-dessous.

---

# Comptes utilisateurs — indépendants du référentiel métier

Le compte de connexion applicatif (identifiants, rôles) doit rester un concept **indépendant** de
toute entité métier du domaine (ex. un référentiel de personnes synchronisé depuis un système
externe) — ce sont deux concepts différents même s'il peut exister un lien entre les deux. Prévoir
un lien optionnel (clé étrangère nullable) plutôt que de fusionner les deux concepts, sauf besoin
métier explicite de les confondre.

---

## Bootstrap du premier compte administrateur

Problème classique : aucun compte n'existe encore pour en créer un premier. Pattern recommandé : au
démarrage de l'application, si aucun utilisateur ne porte encore le rôle administrateur, en créer un
depuis des variables d'environnement dédiées (obligatoires, sans valeur par défaut — voir
`conventions/configuration.md`). Ce mécanisme doit être **idempotent** : ne jamais recréer de
doublon si un administrateur existe déjà. Le mot de passe fourni par variable d'environnement doit
être changé via l'UI dès la première connexion.

---

## Mot de passe oublié

* La demande de réinitialisation ne doit **jamais révéler si un email correspond à un compte
  existant** — répondre de façon identique (même code HTTP, même délai perceptible) que le compte
  existe ou non.
* Le lien de réinitialisation repose sur un token opaque à usage unique, courte durée de vie (ex.
  1h), hashé en base comme un Refresh Token — jamais stocké ou transmis en clair après génération.
  Envoyé exclusivement au propriétaire du compte, jamais retourné dans une réponse API.
  Utiliser un token opaque plutôt qu'un JWT signé pour ce cas : la vérification a besoin d'un état
  "déjà utilisé" que le JWT seul ne peut pas porter.
* Une réinitialisation de mot de passe réussie doit **révoquer tous les Refresh Tokens actifs** de
  l'utilisateur (force une reconnexion partout — bonne pratique après un changement de mot de
  passe).
* Envoi par email via le mécanisme mail standard du framework, configuré exclusivement par variables
  d'environnement (hôte, port, identifiants, TLS). En développement, utiliser un attrape-mail local
  (ex. Mailpit, MailHog) plutôt qu'un vrai fournisseur SMTP — aucun envoi réel, inspection via une UI
  locale.
* Prévoir également une réinitialisation par un administrateur (permission d'administration dédiée)
  pour les cas où l'utilisateur n'a pas accès à sa boîte mail.

---

## Frontend — gating par permission effective, jamais par rôle codé en dur

Tout élément d'UI conditionné par les droits de l'utilisateur (bouton, lien de navigation, route)
doit vérifier la **permission effective** de l'utilisateur courant, jamais un rôle codé en dur :

```html
@if (authService.hasPermission('<DOMAINE>_DELETE')) {
  <button pButton icon="pi pi-trash" (click)="deleteItem(item)"></button>
}
```

---

# Points d'attention (limites connues à assumer explicitement)

* **Latence de propagation des permissions** (jusqu'à la durée de vie de l'Access Token) : un rôle
  modifié ou un deny override ajouté ne s'applique qu'au prochain refresh de l'utilisateur concerné
  — pas de révocation immédiate d'une permission en cours de session. Acceptable pour la plupart des
  projets ; à revoir (vérification en base à chaque requête, ou notification de refresh forcé) si un
  besoin de révocation instantanée apparaît.
* **Compromission du Refresh Token** : la réutilisation d'un token déjà consommé révoque toute sa
  « famille » (tous les tokens issus de la même connexion), ce qui force une reconnexion complète — voir
  `docs/rbac/auth.md`. Les sessions des autres appareils ne sont pas touchées ; un attaquant qui utilise le
  token volé *avant* le propriétaire reste possible une fois (la rotation suivante du propriétaire le démasque).
* **CSRF désactivé globalement**, si ce choix est fait — documenter la justification (Bearer token
  sur tout endpoint métier) à chaque fois qu'il est repris dans un nouveau projet.
* **Access Token non révocable avant expiration** — accepté, borné par sa courte durée de vie.
* **`SameSite=Lax` dépend d'un mécanisme rendant frontend/backend same-origin** (proxy de dev,
  reverse-proxy) — à revoir si ce n'est plus le cas.

---

# Tests de sécurité

* Un test automatique découvre tous les contrôleurs et vérifie que chaque endpoint a une permission
  explicite, la fait respecter et correspond à une table de référence (endpoint → permission) : tout
  nouvel endpoint s'y ajoute, dans le même changement que la documentation RBAC.
* Un test de bout en bout avec de vrais Access Tokens valide la chaîne d'authentification (401 sans
  token ou avec un token invalide/forgé, 403 sans la permission, 200 avec).
* Côté frontend, chaque route est protégée par un guard de permission et chaque bouton d'action
  (création, modification, suppression, import, export, synchronisation) par la permission
  correspondante ; un refus mène à une page « accès refusé », jamais à une redirection qui pourrait
  boucler. Les tests du projet sont décrits dans `docs/rbac/auth.md`.

---

# Documentation RBAC

Chaque module possède un fichier `docs/rbac/<module>.md` qui trace, de façon exhaustive, les accès
du module (endpoints + permission requise, guards frontend, éléments d'UI conditionnés). Toute
évolution des autorisations d'un module met à jour ce fichier dans le même changement.

---

# Configuration

## Variables d'environnement

Les paramètres dépendant de l'environnement utilisent exclusivement des variables d'environnement,
jamais de valeur par défaut (`conventions/configuration.md`) — typiquement : secret JWT, URL du
frontend (pour CORS), politique de cookie sécurisé, identifiants du compte administrateur de
bootstrap, configuration SMTP.

## Secrets

Ne jamais stocker dans le code : mot de passe, secret JWT, clé API, certificat, token d'accès.
Secrets dans `.env` (développement, jamais versionné) ou variables d'environnement (production).
`.env.example` doit toujours rester à jour (valeurs factices).

---

# Pagination

Toute pagination doit être bornée — une taille de page non bornée côté client est un vecteur de
déni de service trivial.

---

# Actuator / endpoints de supervision

* Les endpoints de simple healthcheck (ex. `/actuator/health`) et de métriques destinées au
  scraping (ex. `/actuator/prometheus`) peuvent rester publics — pas de données sensibles, accès
  requis par des outils qui ne peuvent pas s'authentifier.
* Tous les autres endpoints de supervision/administration technique sont réservés à un rôle
  administrateur (vérification de **rôle**, pas de **permission métier** — l'observabilité
  technique n'est pas une permission assignable finement).

---

# Validation

* Toute entrée utilisateur est validée avec Jakarta Validation.
* Les validations métier complémentaires sont réalisées dans les Services.
* Une donnée invalide doit être rejetée le plus tôt possible (Fail Fast).

---

# Principes

* Aucun secret dans le code source.
* Aucune information sensible dans les messages d'erreur (une erreur d'identifiants ne révèle
  jamais si c'est l'identifiant ou le mot de passe qui est incorrect ; une demande de
  réinitialisation de mot de passe ne révèle jamais si un email existe).
* Aucun contournement des mécanismes de sécurité pour simplifier un développement.
* Toute nouvelle fonctionnalité respecte les conventions de sécurité existantes — tout nouvel
  endpoint définit explicitement sa permission requise.
* La sécurité est une responsabilité de chaque développement.
