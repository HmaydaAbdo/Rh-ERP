---
title: API, contrat et erreurs
sidebar_position: 4
---

# API, contrat OpenAPI et erreurs

Le contrat consommé par le frontend ne change pas à la bascule : mêmes chemins, mêmes noms de champs, mêmes codes et même format d'erreur que Spring
(ADR 0016, § 6). FastAPI génère OpenAPI à partir des routes et des modèles Pydantic.

## Contrat

* Une route déclare son modèle de réponse (annotation de retour ou `response_model`), son code de statut, ses `tags` et un `summary` bref. Les réponses
  d'erreur significatives sont déclarées dans `responses`. Ne pas annoncer un statut que la route ne renvoie pas.
* Modèles d'entrée et de sortie séparés. Par défaut FastAPI génère des schémas distincts pour l'entrée et la sortie d'un même modèle ; on ne désactive
  `separate_input_output_schemas` que pour reproduire exactement un contrat existant, avec un test de contrat qui le prouve.
* Les contraintes (longueurs, bornes, formats) sont déclarées dans le modèle Pydantic (`Field`, `Annotated`) ; ne pas les répéter dans la description.
  Les validations métier complexes vont dans des validateurs de champ ou de modèle, ou dans le service si elles dépendent de la base.
* Aucun champ interne, secret ou valeur réelle de production dans un exemple. Les exemples sont synthétiques.
* Fichiers : décrire le type de contenu, les formats acceptés et produits et les limites de taille.

## Test de contrat

Avant la bascule d'un domaine, un test compare le document OpenAPI produit par Spring et celui de FastAPI pour ce domaine (chemins, schémas, codes, sécurité).
La CI valide la syntaxe OpenAPI et détecte les changements incompatibles. Le frontend ne doit rien remarquer.

## Erreurs

* Format d'erreur identique à celui de Spring, produit par des gestionnaires enregistrés sur l'application (voir [architecture](./architecture.md)).
  `RequestValidationError` (422 par défaut dans FastAPI) est remplacée si l'ancien contrat renvoyait un autre statut ou une autre structure.
* Les erreurs ne révèlent ni secret, ni donnée personnelle, ni chemin interne ; on n'expose pas `exc.errors()` brut sans filtrage.
* Un conflit de version renvoie `409`, un accès refusé `403`, une absence d'authentification `401` (avec `WWW-Authenticate`), une ressource hors périmètre `404` ou `403`
  selon la règle du domaine, conservée à l'identique.

## Exports PDF et Excel

Le backend Java produit les PDF avec jsoup et openhtmltopdf (HTML → PDF, SVG par `openhtmltopdf-svg-support`) et les classeurs avec Apache POI (voir `docs/report/README.md`).
Équivalents Python, lus dans leur documentation officielle :

* **PDF : WeasyPrint** (HTML/CSS → PDF). `HTML(string=...).write_pdf()` renvoie les octets quand aucune cible n'est donnée ; `pdf_variant="pdf/a-3u"` produit du PDF/A si l'archivage
  l'exige. Le rendu est **bloquant** : appel dans `run_in_threadpool` ou route `def` (voir [architecture](./architecture.md)).
* **Sécurité de WeasyPrint (documentée)** : avec du HTML ou du CSS non fiable, un PDF peut embarquer n'importe quel fichier accessible à l'utilisateur du processus. Règle : le HTML est
  produit par nos gabarits, **toute valeur saisie est échappée** (la règle tirée de l'incident de l'ancien pipeline reste valable) et un `URLFetcher` personnalisé
  (`allowed_protocols`, aucune redirection, délai borné) refuse tout accès réseau ou fichier hors des ressources publiées. Les dépendances système (Pango) sont installées dans l'image
  du conteneur, non-root, et couvertes par un test de rendu au démarrage de la CI.
* **Excel : openpyxl.** Gros exports : mode `write_only=True` (lignes ajoutées par `append()` seulement, mémoire bornée, classeur enregistrable **une seule fois**, volets figés avant les
  données) ; gros fichiers lus : `read_only=True` avec `close()` obligatoire. **Un fichier importé est non fiable** : installer `defusedxml` (openpyxl ne protège pas par défaut contre les
  bombes XML « billion laughs ») et borner taille et nombre de lignes. Les montants sont écrits depuis des `Decimal` avec un format de nombre explicite, jamais un `float` arrondi à l'affichage.
* Pour chaque export migré, le test de parité compare le contenu (valeurs, colonnes, formats) à celui produit par Java ; le rendu visuel PDF (SVG, polices, pagination) fait l'objet d'une
  revue visuelle validée par le propriétaire avant la bascule du domaine.

## Documentation interactive

`/docs`, `/redoc` et `/openapi.json` sont désactivés ou protégés hors développement (paramètres `docs_url`, `redoc_url`, `openapi_url` de l'application, `None` pour désactiver).
Les chemins nécessaires à leur chargement ne rendent pas les API décrites publiques ; un test vérifie la protection de ces chemins dans la configuration de production.
