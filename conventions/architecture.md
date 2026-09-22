# Architecture

> Conventions d'architecture backend applicables à tous les modules. Ce document est générique et
> réutilisable d'un projet à l'autre — il ne doit contenir aucun nom de domaine métier, de module
> ou de règle propre à un projet particulier. Les décisions et exemples concrets d'un projet donné
> vivent dans sa propre documentation (`docs/`), jamais ici.

## Architecture d'un module

Chaque domaine métier suit la même structure :

```text
module/
├── controller/
├── dtos/
│   ├── request/
│   └── response/
├── entities/
├── exceptions/
├── mappers/
├── repositories/
├── services/
├── specifications/
└── metrics/
```

## Couches

### Entity

* Modèle de persistance uniquement.
* Jamais exposée par l'API.
* Aucune logique métier.

### Repository

* `JpaRepository` obligatoire.
* `JpaSpecificationExecutor` pour les listes filtrables.
* `@EntityGraph` pour les relations sérialisées.
* Jamais de logique métier.
* Ne jamais utiliser `spring.jpa.open-in-view`.

### Service

* Toute la logique métier.
* `@Transactional` sur les écritures.
* `@Transactional(readOnly = true)` sur les lectures.
* Les recherches d'entités sont centralisées dans des méthodes privées.

### Controller

* Thin Controller.
* DTO uniquement.
* Délègue toute la logique au Service.
* Jamais de Repository.

### DTO

* Java Records uniquement.
* Request / Response séparés.
* Validation Jakarta complète.

### Mapper

* `@Mapper(componentModel = "spring")`.
* Conversion uniquement.
* Jamais de logique métier.
* Jamais de Repository.

### Specification

* Toute liste filtrable utilise une Specification.
* Convention :

```java
XSpecification.searchByCriteria(XSearchCriteria)
```

### Exceptions

* Un `@RestControllerAdvice(assignableTypes = XController.class)` par module.
* `GlobalExceptionHandler` gère uniquement les erreurs imprévues — un `@ExceptionHandler`
  générique (`Exception.class`) placé dans la même classe qu'un handler plus spécifique
  (ex. `AccessDeniedException`) ne prend le relais qu'après lui : Spring résout la méthode la plus
  spécifique au sein d'un même `@ControllerAdvice`, donc l'ordre de déclaration importe peu, mais
  l'absence d'un handler spécifique fait retomber silencieusement une exception attendue (ex. accès
  refusé) sur la réponse générique — vérifier ce cas à chaque nouvelle exception transverse.

---

# Organisation des packages (DDD)

* Un package racine par domaine métier.
* Sous-packages techniques internes uniquement (`controller`, `service`, `repository`, etc.).
* Jamais plusieurs domaines dans un package technique partagé.
* L'infrastructure transverse (authentification, sécurité, configuration technique...) reste dans
  ses propres packages, séparée des domaines métier.

---

# Encapsulation des domaines

* Un Repository appartient exclusivement à son domaine.
* Communication inter-domaines via le Service uniquement.
* Ne jamais injecter un Repository d'un autre domaine.
* Chaque Service constitue la façade publique de son domaine — seule son interface publique
  (`IXxxService`) est injectable depuis un autre domaine.
* Pour obtenir une référence JPA gérée d'une entité d'un autre domaine (ex. poser une relation
  `@ManyToOne`), valider l'existence via la façade du domaine propriétaire
  (`autreService.existsById(id)`), puis résoudre une référence paresseuse localement
  (`entityManager.getReference(Entity.class, id)`) — jamais via le Repository de l'autre domaine.

Exemple :

```text
ModuleAService
      ↓ (interface IModuleBService uniquement)
ModuleBService
      ↓
ModuleBRepository
```

---

# Pattern : registre de handlers pour éviter les branchements centraux

Lorsqu'une opération transverse (validation, synchronisation, annulation, export...) doit être
implémentée différemment par plusieurs modules, mais déclenchée par un seul point d'entrée
générique, préférer un **registre de handlers** à un `switch`/`if-chain` central.

### Problème que ce pattern résout

Un service générique qui fait `switch (source) { case A -> ...; case B -> ...; }` doit être modifié
à chaque ajout d'une nouvelle source — il connaît la logique de tous les modules qu'il ne devrait
pas connaître, et grossit indéfiniment.

### Structure

```java
public interface XxxHandler {
    ModuleSource source();      // identifie le module géré par cette implémentation
    Result handle(Long id, Request request);
}
```

* Chaque module implémentant l'opération fournit un `@Component implements XxxHandler` dans son
  propre package — jamais dans le module générique.
* Le service générique collecte automatiquement toutes les implémentations (injection Spring d'une
  `List<XxxHandler>` ou d'une `Map<ModuleSource, XxxHandler>` construite au démarrage) et route vers
  la bonne, sans connaître leur logique interne.
* Ajouter une nouvelle source ne modifie jamais le service générique — seulement une nouvelle
  implémentation du handler dans le module concerné.

### Ce que le module générique ne doit jamais contenir

* Un repository ou une entité d'un autre module.
* De la logique métier propre à un module particulier.
* Un `switch`/`if-chain` sur l'identifiant de source pour dispatcher — c'est le rôle du registre.

---

# Pattern : synchronisation entre deux enregistrements liés

Lorsqu'un enregistrement générique (ex. une écriture, une transaction, un événement) référence une
entité source d'un module métier, toute modification de l'un des deux doit être propagée à l'autre
pour éviter toute divergence. Utiliser le même registre de handlers que ci-dessus (un handler de
synchronisation par module source) plutôt qu'un branchement central.

* Seuls les champs réellement partagés entre les deux structures sont synchronisés — les champs
  propres à l'enregistrement générique (ex. une ventilation comptable) n'ont pas d'équivalent à
  synchroniser.
* Un handler de synchronisation absent pour une source donnée n'est pas une erreur : cela signifie
  que cette source n'a pas d'entité à tenir synchronisée.
* Une entité source dans un état terminal (verrouillée, déjà validée définitivement) doit rejeter ou
  ignorer la synchronisation selon la règle métier du module — à définir explicitement, jamais
  supposer un comportement.

---

# Règle générale : un enregistrement dans un état terminal n'est jamais supprimable directement

Si une entité passe par un cycle de vie avec un état terminal (ex. validé, clôturé, payé) une fois
que cet état a produit des effets ailleurs dans le système (écriture comptable, notification,
export déjà transmis...), la suppression directe de cette entité doit être bloquée dès qu'elle a
atteint cet état — la supprimer casserait la cohérence avec ce qui en dépend déjà.

* Le Service métier vérifie l'état avant tout appel `repository.delete(...)` et lève une exception
  métier explicite sinon.
* Le endpoint `DELETE` reste par ailleurs soumis aux règles d'autorisation habituelles
  (`conventions/security.md`) — les deux contrôles sont indépendants et cumulatifs.
* Côté frontend, désactiver l'action de suppression dans cet état en plus de la conditionner aux
  permissions — ne jamais se reposer uniquement sur le rejet backend pour l'UX.
* L'absence de cette garde dans du code existant n'est pas la preuve d'une exception voulue — c'est
  probablement un oubli. Par défaut, l'appliquer ; si un module doit vraiment y déroger, confirmer
  explicitement la règle métier avant de la documenter comme une exception assumée.

---

# Injection des dépendances

* Constructor Injection uniquement.
* Toutes les dépendances sont `private final`.
* Ne jamais utiliser `@Autowired` sur les champs.

---

# Principes de conception

## DRY
## SOLID
## ACID
## KISS
## YAGNI
## Fail Fast
## Idempotence
## Single Source of Truth
## Zéro Dead Code

* Supprimer immédiatement le code inutilisé (`git rm`).
* Ne jamais conserver du code "au cas où".
* Si une suppression est temporairement impossible, documenter le cas dans `TODO.md`.
* Toute valeur configurable doit respecter les conventions de `configuration.md`.
