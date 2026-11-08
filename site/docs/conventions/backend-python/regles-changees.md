---
title: Règles supprimées ou changées
sidebar_position: 10
---

# Règles supprimées ou changées

Liste exigée par KAN-44 : chaque règle du profil Java qui disparaît ou change, avec sa raison. Toute règle absente de ce tableau est **conservée** (principes, sécurité,
audit, tests par couches, mesures avant optimisation, accord du propriétaire pour toute suppression).

| Règle Java/Spring | Devenir | Raison |
| --- | --- | --- |
| Spring Boot, injection par constructeur | Supprimée → `Depends()` avec `Annotated` | Mécanisme d'injection de FastAPI ; même objectif (dépendances explicites, pas d'état caché) |
| `@Entity` JPA / Hibernate | Changée → modèles SQLAlchemy 2.x (`Mapped`) | ORM Python ; règle « entité jamais exposée par l'API » conservée |
| Spring Data JPA (`Repository`) | Changée → `repository.py` avec `select()` explicites | Pas d'équivalent généré ; plus de contrôle sur les requêtes |
| `Specification` | Changée → `criteria.py` | Même rôle (filtres composables), idiome Python |
| MapStruct | Changée → fonctions explicites ou `from_attributes` | Pas de génération de code ; conversion uniquement |
| `@Transactional` | Changée → frontière transactionnelle explicite dans le service | Pas d'annotation transactionnelle ; une opération métier = une transaction (conservé) |
| Interdiction d'Open Session in View | Changée → `expire_on_commit=False` + chargement explicite (`selectinload`) | En asynchrone, le chargement paresseux hors `await` est impossible ; même objectif (aucun accès aux données hors service) |
| Hibernate Envers | Changée → écouteur de session `before_flush` + tables `*_aud` conservées | Envers n'existe pas en Python ; l'historique existant est préservé |
| `@Version` | Changée → `version_id_col` ; `StaleDataError` → 409 | Même sémantique d'optimiste ; même code HTTP |
| Flyway (V1 à V44, et suivants) | Changée → Alembic ; Flyway retiré (KAN-237), scripts V1 à V44 conservés, `alembic stamp` au niveau V44 après contrôle des sommes de contrôle | Outil de migration du nouveau langage ; schéma inchangé (ADR 0016, § 3) |
| Migration au démarrage de l'application | Changée → étape de déploiement dédiée | Évite les migrations concurrentes entre instances et un démarrage lent |
| `@RestControllerAdvice` | Changée → gestionnaires d'exceptions sur l'application | FastAPI ne porte pas de gestionnaire sur le routeur |
| Springdoc / `@Operation` | Changée → OpenAPI généré par FastAPI, décrit par les modèles et `responses` | Même contrat externe, vérifié par test de parité |
| JWT HS256 | **Changée → RS256 pour tous les jetons** (déconnexion unique à la bascule du domaine `auth`) | Décision du propriétaire du 2026-11-03 ; clé privée serveur seulement |
| Bibliothèque JWT Java | Changée → PyJWT | Bibliothèque de la documentation FastAPI |
| `EndpointSecurityTest` | Changée → test de couverture des routes par introspection | Même garantie : aucune route sans permission déclarée |
| ArchUnit | Changée → import-linter | Même garantie sur les frontières de domaines |
| Checkstyle, PMD | Supprimée → Ruff (lint et format) | Équivalent Python |
| JaCoCo | Changée → coverage.py (seuils repris) | Outil de couverture Python |
| `@MockitoBean` | Changée → `app.dependency_overrides` | Mécanisme de substitution de FastAPI |
| `MockMvc` | Changée → `TestClient` | Client de test de FastAPI |
| Profils Spring | Supprimée → un environnement = un jeu de variables, `pydantic-settings` | Pas de profil ; `extra="forbid"` et secrets sans défaut |
| Logback, rotation 30 jours | Changée → `logging` standard, JSON, rotation 30 jours conservée | Même exigence, bibliothèque standard |
| Micrometer | Changée → OpenTelemetry Python, noms de métriques conservés | Tableaux de bord inchangés |
| Threads virtuels / pools Java | Changée → `async def` pour les accès base, `def` ou `run_in_threadpool` pour le bloquant | Modèle de concurrence de FastAPI |
| jsoup + openhtmltopdf (PDF) | Changée → WeasyPrint, `URLFetcher` restreint, rendu dans un thread | Même approche HTML → PDF ; risque documenté d'inclusion de fichiers avec du HTML non fiable |
| Apache POI (Excel) | Changée → openpyxl (`write_only`/`read_only`) + `defusedxml` pour les fichiers importés | Équivalent Python ; openpyxl ne protège pas par défaut des bombes XML |
| Spring AI (serveur MCP, outils par annotations) | Changée → SDK Python MCP 2.x (`MCPServer`, `@mcp.tool()`), montée dans FastAPI | Voir [serveur MCP](./mcp.md) ; règles de `conventions/mcp.md` conservées |
| Mode « sans état » du transport MCP | Conservée → `streamable_http_app(stateless_http=True)` | Aucun outil ne dépend d'un aller-retour serveur→client |
| Conventions Java (`conventions/*.md` en profil Java) | Supprimées **une fois Spring retiré** | Preuve de fin de migration : aucune convention Java ne subsiste (KAN-44) |

## Règles ajoutées

* Test de parité par domaine migré (calculs, arrondis, exports) et test de contrat OpenAPI.
* Règle `async def` / `def` : aucun appel bloquant dans une coroutine.
* Aucune migration dans le `lifespan`.
* Interdiction des écritures ORM en masse sur une entité auditée.

## Suivi

Cette liste est reprise dans l'[ADR 0016](../../decisions/index.md) et mise à jour à chaque changement de convention du profil Python.
