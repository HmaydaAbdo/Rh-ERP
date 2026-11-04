---
title: Domaine auth
sidebar_position: 4
---

# Domaine `auth` en Python (KAN-213)

Code : `api/src/staport/domains/auth/`. Tests : `api/tests/test_auth_*.py` (PostgreSQL réel, schéma construit par Alembic).
Le domaine reproduit les 21 routes de l'inventaire ([inventaire.md](inventaire.md), section `auth`) avec les mêmes
chemins, statuts, cookies, messages français et permissions que le backend Spring. Il n'est pas encore branché en
production : la bascule se fait à la fin d'E2 (KAN-50), conformément à la [stratégie](strategie.md).

## Organisation

| Module | Rôle |
|---|---|
| `models.py` | Tables `permission`, `role`, `role_permission`, `utilisateur`, `utilisateur_role`, `utilisateur_permission_refusee`, `refresh_token`, `reset_password_token` ; `version_id_col` = verrou optimiste. Comparés à la base par le contrôle de dérive d'Alembic |
| `schemas.py` | DTO Pydantic (JSON en camelCase, mêmes contraintes que les `record` Java) |
| `repository.py` | Requêtes SQLAlchemy asynchrones, sans règle métier |
| `service_auth.py`, `service_utilisateur.py`, `service_role.py`, `service_agent.py` | `AuthService`, `UserService`, `RoleService`, `AgentService` |
| `securite.py` | Hachage des mots de passe (pwdlib), jetons opaques, clés RSA, JWT RS256 (PyJWT) |
| `dependencies.py`, `router.py` | Authentification par jeton, `exiger(...)` par route, les 21 routes |
| `courriel.py`, `parametres.py` | Envoi asynchrone borné (aiosmtplib) ; port vers les paramètres de sécurité (le domaine `parametre` suit en KAN-215) |
| `composition.py` | Assemblage à partir de `Configuration` |

Le domaine `common` gagne la pagination (`Pagination`, `Page`, forme `VIA_DTO` de Spring Data), les validateurs `NonVide` et
`Courriel`, les événements de sécurité (port `PublicationEvenements`, branché sur le journal d'audit par KAN-214) et
l'action d'audit courante (`auditer(...)`, équivalent d'`@AuditableAction`).

## Décisions prises en réalisant le domaine

1. **Un seul jeu de clés RSA** pour les jetons utilisateur et ceux de l'agent IA (audiences distinctes), repris des variables
   `MCP_JWT_*` déjà obligatoires en production : aucun secret nouveau. `JWT_SECRET` (HS256) disparaît avec la bascule.
   Les utilisateurs sont déconnectés une fois, au basculement (rupture annoncée dans l'ADR 0016 § 4).
2. **Mots de passe** : les empreintes BCrypt de Spring (`$2a$`) sont vérifiées telles quelles ; la première connexion réussie
   les remplace par Argon2 (`verify_and_update`). Personne n'a à réinitialiser son mot de passe. Le hachage tourne hors de la
   boucle d'événements.
3. **Jetons opaques** : même empreinte (SHA-256 puis Base64) que Spring, donc les sessions de rafraîchissement existantes
   restent valides jusqu'au basculement des jetons d'accès.
4. **Refus qui laissent une trace** (`noRollbackFor` de Spring) : le service retourne l'erreur après le commit au lieu de la lever
   dans la transaction (compteur d'échecs, verrou de 15 minutes, famille de jetons révoquée).
5. **Version des entités** : SQLAlchemy n'incrémente pas la version quand seule une liaison N-N change (Hibernate le fait) ;
   `incrementer_version` force l'`UPDATE` pour que deux administrateurs modifiant les seules permissions d'un rôle soient en
   conflit (409).

## Écarts assumés avec Spring

| Point | Spring | Python | Pourquoi |
|---|---|---|---|
| Tri sur une propriété inconnue (`?sort=`) | 500 | 400, message en français | Erreur du client, pas du serveur |
| Préflight CORS d'une origine non autorisée | 403 | 400 | Comportement du composant CORS de Starlette ; le navigateur le refuse de la même façon |
| Messages de validation de champ | Texte Jakarta | Texte français équivalent (« Ce champ est obligatoire. », « Doit contenir au plus N caractère(s). ») | Formulations différentes, même langue ; à figer par le test de contrat OpenAPI |
| Chargement de la clé de l'agent IA | Lue seulement si `MCP_ENABLED=true` | Toujours lue (elle signe aussi les sessions) | Décision 1 |

## Parité vérifiée

| Test Java (nombre) | Équivalent Python |
|---|---|
| `AuthServiceTest` (24), `VerrouillageConnexionIntegrationTest` (1) | `test_auth_session.py` : connexion, verrouillage 5 échecs / 15 min, rotation et réutilisation des jetons, déconnexion, mot de passe oublié et réinitialisation |
| `JwtSecurityChainTest` (17) | `test_auth_acces.py` : jeton absent, invalide, autre clé, émetteur, destinataire, expiré, confusion d'algorithme, 403, CORS, origine du rafraîchissement, forme de la page, requête mal formée |
| `EndpointSecurityTest` (8) | `test_auth_acces.py` : les 21 routes découvertes par OpenAPI, chacune avec son exigence ; refus sans droit, accès avec chaque droit alternatif, permissions voisines |
| `RoleAdministrationProtegeeTest` (5), `AuthRequestValidationTest` (5), `AuthRechercheTest` (3) | `test_auth_gestion.py` |
| `EmailServiceTest` (4), `PolitiqueMotDePasseTest` (4), `EffectivePermissionResolverTest` (4) | `test_auth_gestion.py`, `test_auth_acces.py` |
| `SecurityConfigCorsTest` (4), `AgentSigningKeysTest` (5), `JwtSigningKeyTest` (3) | `test_auth_acces.py` : origines CORS, jeu de clés RSA (taille, identifiants, rotation, JWKS sans partie privée) |

Hors périmètre de ce domaine, repris ailleurs : `McpSecuriteIntegrationTest` et `McpClientPythonIntegrationTest` (serveur MCP,
KAN-216), `SupervisionTest` et `Documentation*SecurityTest` (supervision et documentation d'API, plateforme, KAN-50).

## Ce qui n'est pas encore prouvé

- Le contrat OpenAPI complet (schémas de réponse champ par champ) n'est pas comparé automatiquement à celui de Spring : il est
  vérifié par les tests ci-dessus et par la lecture du code Java ; le test de contrat est tenu pour la fin d'E2.
- L'audit écrit par l'écouteur (lignes `*_aud`, journal) arrive avec KAN-214 ; les services déclarent déjà les actions
  (`UTILISATEUR_CREATION`, `ROLE_MODIFICATION`, ...) et publient les événements de sécurité sur le port prévu.
- Les mesures de performance se font après la clôture d'E2.
