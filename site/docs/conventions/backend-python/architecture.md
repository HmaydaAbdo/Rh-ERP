---
title: Architecture
sidebar_position: 2
---

# Architecture du backend Python

Socle inchangé : monolithe modulaire, un domaine propriétaire de ses données, communication entre domaines par une façade publique,
intégrations externes derrière un port. Forme cible : une application FastAPI, un conteneur (ADR 0016, § 1).

## Arborescence

```text
src/staport/
  main.py                  création de l'application, lifespan, montage des routeurs et du serveur MCP
  domains/<domaine>/       un package racine par domaine métier
    api.py                 façade publique du domaine (seul module importable par un autre domaine)
    router.py              APIRouter : routes fines, DTO uniquement
    schemas/request.py     modèles Pydantic d'entrée
    schemas/response.py    modèles Pydantic de sortie
    models.py              modèles SQLAlchemy (persistance uniquement)
    repository.py          accès aux données, aucune décision métier
    service.py             logique métier et frontière transactionnelle
    criteria.py            critères de recherche et construction des filtres
    exceptions.py          erreurs métier du domaine
    dependencies.py        dépendances FastAPI du domaine (service, permissions)
    metrics.py             métriques du domaine
  platform/                identité, autorisation, audit, observabilité, configuration
  integrations/            adaptateurs vers les systèmes externes
```

## Correspondance des couches

| Couche Java (avant) | Python (après) | Règle |
| --- | --- | --- |
| Entity | `models.py` (SQLAlchemy, `Mapped`/`mapped_column`) | Persistance uniquement, jamais exposée par l'API, aucune logique métier |
| Repository | `repository.py` | Pas de logique métier ; requêtes `select()` explicites ; jamais appelé hors de son domaine |
| Service | `service.py` + `api.py` | Toute la logique métier ; `api.py` est la façade publique |
| Controller | `router.py` | Routes fines : valider via Pydantic, déléguer au service, jamais de repository |
| DTO (records) | modèles Pydantic `BaseModel` | Entrée et sortie séparées ; contraintes déclarées dans le modèle |
| Mapper (MapStruct) | fonctions de conversion explicites ou `model_validate(..., from_attributes=True)` | Conversion uniquement |
| Specification | `criteria.py` : un objet de critères et une fonction qui renvoie les conditions `where` | Toute liste filtrable passe par là |
| `@RestControllerAdvice` | gestionnaires d'exceptions enregistrés sur l'application | Voir ci-dessous |
| Injection par constructeur | `Depends()` avec `Annotated` ; dépendances explicites en paramètres | Pas d'état global ni de singleton caché |

### Pydantic et ORM

`from_attributes=True` permet de valider un objet ORM dans un modèle de sortie (documenté par Pydantic). Les modèles de réponse restent
distincts des modèles ORM : ajouter une colonne ne change jamais le contrat d'API sans décision.

### Routeurs et dépendances

`APIRouter` accepte `prefix`, `tags`, `dependencies` et `responses` ; `include_router` les applique à toutes les routes du routeur. Le
préfixe ne se termine pas par `/`. Chaque domaine expose un routeur ; `main.py` les inclut avec leurs dépendances de sécurité communes.
Un routeur n'a pas de paramètre de gestionnaire d'exceptions : les gestionnaires se déclarent sur l'application (un `register_exception_handlers(app)`
par domaine, appelé depuis `main.py`), chacun limité aux classes d'exception de son domaine.

### Gestionnaires d'exceptions

* Une hiérarchie d'erreurs métier par domaine, héritant d'une base commune de `platform` ; un gestionnaire par classe de base de domaine.
* Le gestionnaire générique (`Exception`) ne traite que l'imprévu ; une erreur attendue sans gestionnaire spécifique retomberait
  silencieusement sur la réponse générique : chaque nouvelle exception transverse est testée (refus d'accès, conflit de version, validation).
* `RequestValidationError` et `HTTPException` ont des gestionnaires par défaut ; on les remplace pour garder le **format d'erreur actuel de
  Spring** (ADR 0016, § 6), jamais pour exposer le détail interne.

## `async def` ou `def`

Documenté par FastAPI : une route déclarée avec `def` s'exécute dans un pool de threads ; avec `async def`, elle s'exécute sur la boucle
d'événements et ne doit rien bloquer.

* Accès base de données par la session asynchrone : routes et services en `async def`.
* Bibliothèque bloquante (génération PDF, lecture Excel, calcul lourd) : un service synchrone appelé par `run_in_threadpool`, ou une route `def`.
  Jamais d'appel bloquant dans une coroutine.
* Aucune route ne mélange les deux styles sans raison documentée dans le code.

## Dépendances avec `yield`

La session de base de données est fournie par une dépendance avec `yield`. Par défaut, le code après `yield` s'exécute après l'envoi de la réponse ;
`Depends(..., scope="function")` (disponible depuis FastAPI 0.121) le fait s'exécuter juste après la fonction de route, avant la réponse.

* Réponses en flux (SSE de l'assistant, exports volumineux) : ne pas garder la session ouverte pendant le flux ; utiliser `scope="function"` ou ne
  pas dépendre de la session dans la route qui diffuse.
* Une dépendance avec `yield` peut attraper `HTTPException` et une exception personnalisée pour annuler la transaction, puis la relever.

## Durée de vie de l'application (`lifespan`)

L'ouverture et la fermeture des ressources partagées (moteur de base de données, clients HTTP, serveur MCP via `session_manager.run()`) se font dans un
gestionnaire `lifespan`, pas dans les anciens événements `startup`/`shutdown`. Dans les tests, `TestClient` lance le `lifespan` seulement dans un bloc `with`.
Les migrations ne s'exécutent jamais dans le `lifespan` (voir [persistance](./persistance.md)).

## Encapsulation des domaines

* Un `repository.py` appartient à son domaine ; aucun autre domaine ne l'importe.
* Un domaine n'appelle un autre que par `api.py` (la façade). Cette règle est **vérifiée par import-linter** (contrats de type `layers` et d'interdiction
  d'import), exécuté en CI à la place d'ArchUnit.
* Pour référencer l'entité d'un autre domaine : valider l'existence par la façade du domaine propriétaire, puis ne conserver que l'identifiant ou une
  référence résolue localement ; jamais de relation ORM entre deux domaines.
* Suppression et états du cycle de vie : règle inchangée (invariants métier d'abord, backend fait autorité, frontend reflète l'état).

## Principes de conception

DRY, SOLID, ACID, KISS, YAGNI, échec rapide, idempotence, source unique de vérité et « zéro code mort » (suppression immédiate du code inutilisé, ticket Jira
si impossible) s'appliquent sans changement. Les patrons de conception ne s'introduisent que sur besoin réel ; en Python, une fonction ou un `Protocol` suffit
souvent là où Java exigeait une interface et une usine : la stratégie, le registre de handlers, l'observateur d'événements, l'adaptateur et la fabrique
gardent leurs règles d'usage (voir [design-patterns](../index.md)), exprimées avec des fonctions, des `Protocol` et des dictionnaires de handlers.
