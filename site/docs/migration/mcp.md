---
title: Serveur MCP
sidebar_position: 7
---

# Serveur MCP en Python (KAN-216)

Code : `api/src/staport/domains/mcp/`. Tests : `api/tests/test_mcp.py` (PostgreSQL réel, schéma construit par Alembic,
appels JSON-RPC sur `/mcp`). Le serveur remplace le module `staport.rh.mcp` et `McpSecurityConfig` de Spring, sur le
**SDK MCP officiel** (`mcp` 2.3, `MCPServer`), monté dans l'application FastAPI. Il n'est pas encore branché en
production : la bascule se fait à la fin d'E2 (KAN-50), conformément à la [stratégie](strategie.md).

## Périmètre de ce ticket

Le socle et les outils des domaines déjà en Python : **5 des 31 outils** de lecture. Les autres arrivent avec leur
domaine (KAN-49, un domaine = ses routes, son audit, ses outils). L'absorption du service IA (`ia/`) dans le même
conteneur est un ticket distinct.

| Outil | Permission | Spring | Python |
|---|---|---|---|
| `systeme_identite` | droit d'utiliser l'assistant | `OutilIdentite` | identité et autorités lues du jeton puis de la base |
| `parametres_lire` | `PARAMETRE_READ` | `OutilsAdministration` | les 6 paramètres avec unité et bornes |
| `roles_lister` | `ROLE_MANAGE` | idem | filtre sur le nom, pages de 1 à 20, total |
| `audit_rechercher` | `AUDIT_READ` | idem | filtres combinables, plus récent d'abord, pages de 1 à 20, total |
| `audit_historique` | `AUDIT_READ` | idem | versions d'un enregistrement, pages de 1 à 10, total |

Noms, descriptions, annotations (lecture seule, non destructif, idempotent, monde fermé) et clés de résultat sont ceux de
Spring ; le client IA n'a rien à changer. La liste des comptes utilisateurs n'est volontairement pas exposée.

## Organisation

| Module | Rôle |
|---|---|
| `serveur.py` | `MCPServer`, transport Streamable HTTP sans état en JSON, route `/mcp`, refus de tout appel portant un `Origin` |
| `acces.py` | `TokenVerifier` du SDK : jeton agent RS256 vérifié, compte et droits relus en base à chaque requête ; permission par outil |
| `outils.py` | Les cinq outils, ajoutés au serveur par `@serveur.tool` |
| `telemetrie.py` | Décorateur `@outil` : droit exigé, span OpenTelemetry, nombre de résultats |

`ServiceAgent.authentifier` (domaine auth) porte la vérification du jeton et la relecture du compte : la route REST et la
route MCP partagent ainsi la même règle « un compte désactivé est refusé même avec un jeton encore valide ».

## Décisions

- **Le SDK officiel porte la mécanique** : montage ASGI, JSON-RPC, validation des arguments par Pydantic, schéma de sortie,
  authentification par `TokenVerifier` + `AuthSettings.required_scopes`. Les droits de l'utilisateur voyagent comme
  *scopes* de l'`AccessToken` (`mcp:lecture`, `IA_UTILISER`, puis les permissions et rôles). Le SDK répond 401 sans
  jeton valide et 403 s'il manque `mcp:lecture` ou `IA_UTILISER` ; chaque outil exige ensuite la permission de son écran
  et répond par une erreur d'outil qui **nomme la permission manquante** (l'agent peut l'expliquer).
- **Le gestionnaire de sessions du SDK appartient à l'application hôte** : `creer_app` entre dans
  `session_manager.run()` dans son cycle de vie (la documentation du SDK précise que celui d'une sous-application montée
  ne s'exécute jamais).
- **`/mcp` est une route, pas un montage à la racine** : un montage à la racine captait les chemins inconnus et changeait
  les 405 de FastAPI en 404 (détecté par `test_aucune_route_ne_modifie_ni_ne_supprime_le_journal`).
- **Protection contre le DNS rebinding du SDK désactivée** : elle vise un serveur lié à `localhost` (hôtes autorisés
  `127.0.0.1`, `localhost`) ; ici le service n'est joint que par le réseau interne sous le nom de son conteneur. Le
  contrôle de `Origin` (aucun navigateur n'appelle MCP) reste, par un middleware ASGI de quelques lignes.
- **Les lectures MCP ne sont pas écrites au journal d'audit** (décision du propriétaire, 2026-11-04) : plus de ligne
  `MCP_<OUTIL>`. Le diagnostic est un **span OpenTelemetry** par appel : outil, utilisateur (`enduser.id`), statut
  (`SUCCES`, `ECHEC`, `REFUSE`), nombre de résultats. Ni arguments ni résultat dans le span : les contenus sont dans la
  trace de l'agent, côté client, conservée sans limite dans Phoenix. L'émission du jeton agent et les accès refusés
  restent des événements de sécurité.

## Écarts avec Spring

| Point | Spring | Python | Pourquoi |
|---|---|---|---|
| Audit des appels d'outils | une ligne `MCP_<OUTIL>` (catégorie `ACCES`) par appel | aucune ligne, un span | décision du 2026-11-04 : l'audit ne garde que les opérations et la sécurité |
| Type d'enregistrement de `audit_historique` | énumération fixe de 7 entités | texte validé contre le registre d'audit, valeurs possibles dans l'erreur | seules les entités déjà migrées sont connues ; la liste grandit avec KAN-49 sans toucher l'outil |
| Date de fin de `audit_rechercher` | début du jour suivant | dernier instant du jour | même résultat avec le filtre inclusif du journal Python |
| Montage | filtre de sécurité Spring avant le contrôleur | `TokenVerifier` du SDK devant l'endpoint | mécanique fournie par le SDK |

## Parité vérifiée

Les 24 tests couvrent : 401 sans jeton ou avec un jeton invalide, jeton REST refusé, `Origin` refusé (403), compte
désactivé après l'émission (401), droit `IA_UTILISER` retiré après l'émission (403), droits relus à chaque appel, les cinq
outils au catalogue avec leurs annotations et un schéma de sortie, la permission de chaque outil, les filtres, pages et
bornes (limite, page, nom trop long, date réelle, identifiant positif, énumérations), une modification retrouvée par le
journal et l'historique, **aucune ligne ajoutée au journal par un appel d'outil**, et le span (statut, utilisateur,
nombre de résultats, ni argument ni résultat). La suite complète de l'API passe (244 tests), `ruff` et `pyright` strict
sans erreur.

## Ce qui n'est pas encore prouvé

- **Le client IA actuel contre ce serveur** : le service `ia/` appelle encore le MCP de Spring ; la comparaison bout en
  bout (mêmes appels, mêmes résultats) se fait à la bascule, avec l'absorption du service IA.
- **L'export des spans vers Phoenix** : l'API n'a que `opentelemetry-api` (les spans sont sans effet tant qu'aucun
  exporteur n'est configuré). La configuration de l'exporteur arrive avec l'absorption du service IA dans le conteneur
  unique.
- **Les 26 autres outils** : ils arrivent avec leur domaine (KAN-49).
