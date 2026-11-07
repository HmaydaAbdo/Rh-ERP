---
title: Serveur MCP
sidebar_position: 7
---

# Serveur MCP en Python (KAN-216)

Code : `api/src/staport/domains/mcp/`. Tests : `api/tests/test_mcp.py` (PostgreSQL réel, schéma construit par Alembic,
appels JSON-RPC sur `/mcp`). Le serveur remplace le module `staport.rh.mcp` et `McpSecurityConfig` de Spring, sur le
**FastMCP 4** (`fastmcp` 4.1.6, la dernière version stable ; il s'appuie sur le SDK officiel `mcp`), monté dans l'application FastAPI. Il n'est pas encore branché en
production : la bascule se fait à la fin d'E2 (KAN-50), conformément à la [stratégie](strategie.md).

## Périmètre de ce ticket

Le socle et les outils des domaines déjà en Python : **les 31 outils** de lecture de Spring (KAN-226 : employé, paie, heures supplémentaires et accueil
rejoignent les outils déjà portés ; un domaine = ses routes, son audit, ses outils, décision du 2026-11-06).
Le paquet `ia/` est installé dans l'image API ; ses routes (`/agui`, `/health/ia`, `/health/ready`) et son cycle de vie
sont inclus dans la même application FastAPI quand `IA_ENABLED` est configuré. La bascule de Compose et de
l'authentification attend KAN-50 : le jeton de connexion Spring HS256 ne peut pas être utilisé sur l'API Python RS256.

| Outil | Permission | Spring | Python |
|---|---|---|---|
| `systeme_identite` | droit d'utiliser l'assistant | `OutilIdentite` | identité et autorités lues du jeton puis de la base |
| `parametres_lire` | `PARAMETRE_READ` | `OutilsAdministration` | les 6 paramètres avec unité et bornes |
| `roles_lister` | `ROLE_MANAGE` | idem | filtre sur le nom, pages de 1 à 20, total |
| `audit_rechercher` | `AUDIT_READ` | idem | filtres combinables, plus récent d'abord, pages de 1 à 20, total |
| `audit_historique` | `AUDIT_READ` | idem | versions d'un enregistrement, pages de 1 à 10, total |
| `fonction_*`, `equipe_*`, `chantier_*` (6 outils) | `FONCTION_READ`, `EQUIPE_READ`, `CHANTIER_READ` | `OutilsReferentiels` | recherche et fiche de chaque référentiel |
| `employes_rechercher`, `employe_fiche`, `employes_compter`, `employes_regrouper`, `employes_sorties`, `employe_parcours` | `EMPLOYEE_READ` (salaire : `PAIE_READ`) | `OutilsEmploye` | module `outils_employe.py`, mêmes paramètres, plafonds de 20 et pagination que Spring |
| `accueil_lire` | `ACCUEIL_READ` | `OutilsAccueil` | accueil de l'utilisateur du jeton |
| `paie_indicateurs`, `paie_periodes`, `paie_repartition`, `paie_evolution`, `paie_comparer`, `paie_mouvements`, `paie_qualite`, `paie_bulletins_rechercher` | `PAIE_READ` | `OutilsPaie` | module `outils_paie.py` ; mois par défaut = dernière paie importée |
| `rapport_preparer` | `PAIE_EXPORT` et `PAIE_READ` | `OutilsPaie` | prépare la vue du rapport, sans générer le PDF |
| `heures_supp_periodes`, `heures_supp_indicateurs`, `heures_supp_rechercher` | `HEURES_SUP_READ` et `PAIE_READ` | `OutilsHeuresSupp` | enveloppe `{vue, resultats}` comme Spring |
| `heures_supp_import_prerequis` | `HEURES_SUP_IMPORT`, `PAIE_READ`, `CHANTIER_READ` | `OutilsHeuresSupp` | prérequis de l'import d'un chantier et d'un mois |

Noms, descriptions, annotations (lecture seule, non destructif, idempotent, monde fermé) et clés de résultat sont ceux de
Spring ; le client IA n'a rien à changer. La liste des comptes utilisateurs n'est volontairement pas exposée.

## Organisation

| Module | Rôle |
|---|---|
| `serveur.py` | `FastMCP`, transport Streamable HTTP sans état en JSON, route `/mcp`, refus de tout appel portant un `Origin` |
| `acces.py` | `TokenVerifier` de FastMCP : jeton agent RS256 vérifié, compte et droits relus en base à chaque requête ; permission par outil |
| `outils.py`, `outils_employe.py`, `outils_paie.py` | Les outils, ajoutés au serveur par `@serveur.tool` (`formats.py` : types et aides partagés) |
| `telemetrie.py` | Décorateur `@outil` : droit exigé, span OpenTelemetry, nombre de résultats |

`ServiceAgent.authentifier` (domaine auth) porte la vérification du jeton et la relecture du compte : la route REST et la
route MCP partagent ainsi la même règle « un compte désactivé est refusé même avec un jeton encore valide ».

## Décisions

- **FastMCP porte la mécanique** : application ASGI, JSON-RPC, validation des arguments par Pydantic, schéma de sortie,
  authentification par `TokenVerifier` + `required_scopes`. Les droits de l'utilisateur voyagent comme
  *scopes* de l'`AccessToken` (`mcp:lecture`, `IA_UTILISER`, puis les permissions et rôles). FastMCP répond 401 sans
  jeton valide et 403 s'il manque `mcp:lecture` ou `IA_UTILISER` ; chaque outil exige ensuite la permission de son écran
  et répond par une erreur d'outil qui **nomme la permission manquante** (l'agent peut l'expliquer).
- **Le cycle de vie de l'application MCP appartient à l'application hôte** : `creer_app` le combine au sien avec
  `combine_lifespans` (sans lui, le gestionnaire de sessions ne démarre pas et les requêtes échouent).
- **`/mcp` est une route, pas un montage à la racine** : un montage à la racine captait les chemins inconnus et changeait
  les 405 de FastAPI en 404 (détecté par `test_aucune_route_ne_modifie_ni_ne_supprime_le_journal`).
- **Contrôle de l'hôte et de l'origine de FastMCP laissé à son défaut (désactivé)** : il vise un serveur lié à `localhost` ; ici
  le service n'est joint que par le réseau interne sous le nom de son conteneur. Le refus de tout `Origin` (aucun
  navigateur n'appelle MCP) est un middleware ASGI de quelques lignes.
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
| Montage | filtre de sécurité Spring avant le contrôleur | `TokenVerifier` du SDK devant l'endpoint | mécanique fournie par FastMCP |

## Parité vérifiée

Les 24 tests couvrent : 401 sans jeton ou avec un jeton invalide, jeton REST refusé, `Origin` refusé (403), compte
désactivé après l'émission (401), droit `IA_UTILISER` retiré après l'émission (403), droits relus à chaque appel, les 31
outils au catalogue (`test_mcp_outils_metier.py` : permission refusée par outil, périmètre, cas vides) avec leurs annotations et un schéma de sortie, la permission de chaque outil, les filtres, pages et
bornes (limite, page, nom trop long, date réelle, identifiant positif, énumérations), une modification retrouvée par le
journal et l'historique, **aucune ligne ajoutée au journal par un appel d'outil**, et le span (statut, utilisateur,
nombre de résultats, ni argument ni résultat). La suite complète de l'API passait (252 tests avant l'intégration IA), `ruff` et `pyright` strict
sans erreur.

## Ce qui n'est pas encore prouvé

- **Le service IA déployé n'utilise pas encore ce serveur** : son paquet et ses routes sont présents dans l'image API,
  mais le service `ia/` de Compose appelle encore Spring. `IA_ERP_API_URL` devra viser l'API Python pour l'échange du
  jeton agent et `/mcp`, une fois la connexion utilisateur basculée sur RS256 (KAN-50). Les outils s'ajoutent domaine par
  domaine (KAN-49).

- **Le client IA actuel contre ce serveur** : le service `ia/` de la pile appelle encore Spring. Sur une copie isolée
  du volume ERP existant, le banc réel a exécuté cinq cas couvrant les cinq outils portés, trois fois chacun avec le
  juge : 15 réussites sur 15, `pass^3` 5/5, juge 15/15, aucune erreur d'outil, p95 22,09 s. Le premier passage avait
  obtenu 13/15 : une réponse donnait un total de rôles erroné et le critère de fondement confondait les secondes d'un
  horodatage avec une décimale. Le critère a été corrigé et testé ; un passage interrompu par l'arrêt du poste est
  inexploitable (jeton expiré). La réussite du nouveau passage n'efface pas cette instabilité observée. Cette preuve
  porte sur les cinq outils Python, pas sur les autres domaines ni la bascule de l'IA ; la comparaison complète se fera
  à la bascule, avec l'absorption du service IA.
- **L'export des spans vers Phoenix** : un appel `systeme_identite` authentifié a produit un span reçu par Phoenix dans
  un projet Compose isolé, avec données synthétiques. L'essai utilise l'image API et la configuration d'export du service
  Compose ; il ne prouve pas le déploiement ni les données de production.
- **Formats non vérifiés contre Spring en exécution** : le mois est rendu `AAAA-MM` comme l'API REST (format JSON de
  `YearMonth` supposé identique) ; `employes_sorties` ordonne les employés par identifiant ; une liste d'identifiants vide
  n'applique aucun filtre ; le masquage des exceptions non `ToolError` par FastMCP n'est pas vérifié.
- **Effets sur l'API REST** : l'alignement des services sur Spring (effectifs, parcours, moyennes d'âge et d'ancienneté,
  regroupements lus en base) modifie quelques sorties REST, dans le sens du modèle Angular (`entrees` peut être nul,
  libellés de mois du parcours).
- **Tests sur base partagée** : l'absence totale de paie (« Aucune paie n'est encore importée ») n'est pas testée.
