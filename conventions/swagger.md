# Swagger / OpenAPI

> Conventions de documentation API applicables à tous les controllers.

## Principes

* Toute API publique est documentée.
* La documentation OpenAPI est maintenue dans le même changement que le code.
* Une seule configuration OpenAPI existe pour toute l'application.
* Les annotations doivent améliorer la compréhension de l'API, jamais dupliquer le code.

---

# Controller

Chaque controller documente son API avec les annotations OpenAPI.

---

# @Tag

* Obligatoire sur chaque Controller.
* `name` : nom court du module.
* `description` : une phrase décrivant le rôle métier.

Exemple :

```java
@Tag(
    name = "Banques",
    description = "Gestion des banques"
)
```

---

# @Operation

* Obligatoire sur chaque endpoint.
* `summary` : maximum 8 mots.
* `description` : uniquement si le comportement n'est pas évident.

---

# @ApiResponse

Documenter uniquement les codes non générés automatiquement.

Typiquement :

* `201`
* `204`
* `400`
* `404`
* `409`
* `429`

Ne jamais documenter `200 OK`.

---

# @Parameter

Utiliser uniquement pour :

* les filtres ;
* la pagination ;
* les paramètres dont le nom n'est pas suffisamment explicite.

Ne pas documenter les `@PathVariable` simples.

---

# @RequestBody

Toute méthode recevant un corps de requête documente explicitement son payload lorsque cela améliore la compréhension de l'API.

Ne pas ajouter de description inutile.

---

# DTO

Documenter uniquement les champs non évidents avec `@Schema`.

Exemples :

* enum ;
* format particulier ;
* règle métier spécifique.

Ne pas répéter les contraintes déjà exprimées par Bean Validation.

Ne jamais annoter les entités JPA avec des annotations OpenAPI.

Seuls les DTO exposés par l'API sont documentés.

---

# Contenu des réponses

Utiliser `@Content` lorsque la réponse diffère du comportement standard de Springdoc.

Typiquement :

* erreurs métier ;
* téléchargement de fichiers ;
* upload de fichiers ;
* réponse vide (`204`) ;
* format de média particulier.

---

# Fichiers

Les endpoints manipulant des fichiers documentent explicitement :

* le type de contenu attendu ;
* le type de fichier ;
* le type de réponse.

---

# Exemples

Ajouter des exemples (`example`) uniquement lorsqu'ils facilitent réellement la compréhension de l'API.

Ne pas maintenir de nombreux exemples susceptibles de devenir incohérents avec le code.

---

# Sécurité

Les controllers protégés utilisent :

```java
@SecurityRequirement(name = "bearerAuth")
```

* Déclarer l'annotation au niveau de la classe.
* Ne pas la répéter sur chaque méthode.

---

# Configuration

Une seule classe configure OpenAPI :

```text
OpenApiConfig
```

Elle déclare :

* le `SecurityScheme` ;
* `bearerAuth`.

Ne jamais redéfinir cette configuration ailleurs.

---

# Swagger UI

Les endpoints suivants restent accessibles sans authentification :

```text
/swagger-ui/**
/v3/api-docs/**
```

Le bouton **Authorize** de Swagger gère l'authentification JWT.

L'activation de Swagger est pilotée par la configuration de l'application.

Swagger est activé en développement et désactivé en production.

---

# Périmètre

Les annotations OpenAPI sont utilisées uniquement sur :

* Controllers ;
* DTOs.

Ne jamais documenter avec OpenAPI :

* Services ;
* Repositories ;
* Entities ;
* Filters ;
* Aspects ;
* Configuration métier.

---

# Revue de code

Toute modification d'un endpoint implique la mise à jour de sa documentation OpenAPI dans le même changement.

Une API dont la documentation est incomplète est considérée comme inachevée.
