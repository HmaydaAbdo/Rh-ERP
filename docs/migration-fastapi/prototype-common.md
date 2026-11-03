# Prototype du domaine `common` (KAN-47)

Code : [`api/`](../../api) (projet uv `staport-api`, package `staport`). Il applique l'arborescence de
`conventions/backend-python` (`domains/<domaine>/api.py`, `platform/`).

## Ce qui est prouvé (9 tests, ruff et pyright strict verts)

| Comportement Spring | Équivalent FastAPI | Test |
|---|---|---|
| `ErrorResponseDto` `{timestamp, status, error, message, path}` | `ReponseErreur` (Pydantic) | `_forme_spring` sur chaque cas |
| 409 « L'enregistrement a été modifié… » (`ConflitModificationException`) | `ConflitModification` + `verifier_version` | `test_conflit_de_version…` |
| 403, 404, 405, 500 avec les mêmes messages français | gestionnaires sur l'application | tests dédiés |
| Erreur imprévue sans détail interne | gestionnaire `Exception` | `test_erreur_imprevue…` |
| 400 « champ : message » (validation) et « Corps de la requête illisible. » | gestionnaire `RequestValidationError` | tests dédiés |
| `X-Request-Id` toujours généré, jamais repris du client | middleware HTTP + `ContextVar` | `test_identifiant_de_requete…` |
| `MotifRecherche.contient` (jokers échappés) | `motif_contient` | `test_motif_de_recherche…` |

Documentation lue (Context7, FastAPI) : remplacement des gestionnaires de `RequestValidationError` et de `StarletteHTTPException`
(on enregistre celui de Starlette), `@app.middleware("http")`.

## Écarts connus, non cachés

- **Messages de validation** : traduits en français (`platform/validation_fr.py`, un modèle par type d'erreur Pydantic, test des types
  fréquents). Le texte exact des contraintes Jakarta de Spring (messages écrits à la main dans chaque DTO) sera comparé domaine par
  domaine par le test de contrat ; un type non traduit retombe sur le message anglais de Pydantic, jamais sur un message masqué.
- **`PageLoader`** (parcours paginé Spring Data) n'est pas porté : il n'a pas de sens sans le repository ; il renaît avec le premier
  domaine qui a un repository (SQLAlchemy).
- **`YearMonthAttributeConverter`, `AsyncConfig`, `MailExecutorProperties`, `OpenApiConfig`, `SchedulingConfig`** ne sont pas portés :
  ils relèvent de la persistance, des tâches de fond, du courriel et de la configuration (tranche KAN-48).
- **Mesures** : non relevées (voir [strategie.md](strategie.md)) ; ce prototype ne démontre ni le gain de latence ni celui du
  conteneur unique.
- Le client de test de Starlette signale qu'il préfère `httpx2` à `httpx` (avertissement de dépréciation) ; non adopté tant que le
  paquet n'est pas vérifié (règle : documentation officielle d'abord).

## Décision laissée au prototype par l'ADR

Le choix « MCP ou appel direct par outil LangChain » (ADR § 1) n'est pas tranché ici : il exige l'absorption du service IA et une
mesure de latence (tranche KAN-48).
