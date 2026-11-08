---
title: Sécurité
sidebar_position: 5
---

# Sécurité du backend Python

Les exigences de `conventions/security.md` ne dépendent pas du framework (refus par défaut, moindre privilège, permissions plutôt que rôles, périmètre de
ressource, erreurs sans fuite). Cette page donne leur mise en œuvre avec FastAPI.

## Authentification et jetons

* Contrat externe inchangé à la bascule : mêmes routes `/auth/*`, mêmes cookies et jetons de rafraîchissement (ADR 0016, § 4).
* **RS256 pour tous les jetons** : clé privée sur le serveur seulement, clé publique publiable, rotation par identifiant de clé (`kid`) ; le passage de HS256 à RS256
  est une déconnexion unique, planifiée avec la bascule du domaine `auth` (accord du propriétaire du 2026-11-03).
* Bibliothèque : **PyJWT** (celle de la documentation FastAPI). Vérifier toujours avec une liste d'algorithmes explicite (`algorithms=["RS256"]`), exiger les
  claims nécessaires (`options={"require": ["exp", "iss", "sub", ...]}`), et contrôler émetteur et destinataire. Les clés de signature viennent de la configuration ou
  d'un JWKS (`PyJWKClient`, qui met en cache et se rafraîchit quand le `kid` est inconnu).
* Une signature valide ne signifie pas un jeton révocable : la durée, la révocation et le délai de propagation d'un changement de droits restent documentés.
* Hachage des mots de passe : fonction adaptative maintenue ; la documentation FastAPI emploie `pwdlib` (Argon2). Les hachages **existants** doivent rester
  vérifiables sans réinitialisation (format confirmé à l'inventaire KAN-45). `PasswordHash((Argon2Hasher(), BcryptHasher()))` vérifie contre tous les algorithmes activés
  et hache avec le premier ; **`verify_and_update(mot_de_passe, hachage)`** renvoie `(valide, nouveau_hachage | None)` : si le hachage utilise un algorithme ancien ou des
  paramètres (temps, mémoire) modifiés, le nouveau hachage est enregistré dans la même transaction que la connexion. Un hachage inconnu lève `UnknownHashError`, traité comme
  un échec d'authentification (jamais une erreur 500 ni un message distinct).
* Comparaison à temps constant et hachage factice quand le compte n'existe pas, pour ne pas révéler l'existence d'un compte (technique de la documentation FastAPI).
* Limite d'essais et blocage de compte (cinq échecs en quinze minutes) : règle Staport Intelligence inchangée, journalisée dans la catégorie `SECURITE` sans mot de passe.

## Autorisation par permissions

* Une permission = un code du catalogue versionné (migration). Une **dépendance FastAPI** vérifie la permission requise ; chaque route et chaque outil MCP en déclare
  une, par un helper commun (`require_permission("paie:lire")`) posé en `dependencies=[...]` de la route ou du routeur.
* `Security(...)` et `SecurityScopes` de FastAPI documentent des *scopes* OAuth2 dans OpenAPI ; ils servent de modèle pour exposer les permissions dans le contrat, sans
  remplacer le contrôle côté serveur. La décision (permission + périmètre par fiche de poste) reste dans `platform/identite`.
* Le périmètre de la ressource est toujours vérifié en plus de la permission d'action.
* **Test de couverture des routes** (remplace `EndpointSecurityTest`) : parcourt les routes de l'application et échoue pour toute route sans permission déclarée
  qui n'est pas explicitement publique (liste blanche courte et commentée). Le test parcourt `app.routes` (les routes d'`APIRouter` incluses y figurent, avec les `dependencies`
  du routeur et de la route, paramètres documentés de `APIRouter`, `include_router` et des décorateurs de route) et vérifie la présence de la dépendance de permission ; il se prouve
  lui-même par une route de test volontairement non protégée qui doit le faire échouer.
* Les agents, skills et descriptions d'outils ne confèrent aucun droit : chaque appel d'outil MCP réévalue identité et permissions.

## En-têtes, cookies, CORS

* Cookie du jeton de rafraîchissement : attributs de sécurité, chemin et durée inchangés ; défense CSRF sur les opérations qui modifient l'état tant que des cookies authentifient.
* CORS par le `CORSMiddleware` de Starlette (documenté) : valeurs par défaut restrictives (`allow_methods=['GET']`, `allow_headers=[]`, `allow_credentials=False`). Origines, méthodes
  et en-têtes sont **listés explicitement**. Avec `allow_credentials=True` (cookie de rafraîchissement), Starlette interdit `['*']` pour les origines, méthodes et en-têtes.
  `allow_origin_regex` évite `.*` et `.+` (ils couvrent `/ @ # ?`) au profit de classes de caractères précises. Pour que les en-têtes CORS figurent aussi sur les réponses d'erreur
  non gérées, le middleware enveloppe l'application entière. Les préflights (`OPTIONS` avec `Origin` et `Access-Control-Request-Method`) sont traités par le middleware avant
  l'authentification.
* Les en-têtes d'adresse transmis par un proxy ne sont fiables que d'un proxy explicitement approuvé (inchangé, voir `docs/deployment.md`).

## Données et entrées

* Validation côté serveur par Pydantic (types, bornes, formats) ; paramètres liés SQLAlchemy ; aucune requête construite par concaténation.
* Bornes sur taille de corps, listes et fichiers importés ; fichiers et réponses d'intégrations traités comme non fiables.
* Analyse statique de sécurité : règles bandit via Ruff (voir [tests et qualité](./tests.md)) ; OSV et CycloneDX côté Python en CI.

## Tests de sécurité

Mêmes cas qu'avant : anonyme, identité sans permission, avec permission, hors périmètre, permission distincte pour suppression/export, expiration et révocation, récupération
de compte invalide/expirée/réutilisée, mêmes refus pour l'appel direct, l'interface et l'outil MCP. Les identités, secrets et données de test sont synthétiques.
