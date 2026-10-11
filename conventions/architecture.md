# Architecture

> Principes d'architecture applicables aux applications, indépendamment de leur domaine métier.
> Les choix propres à une application ne sont documentés ici que s'ils sont réutilisables et
> compatibles avec ce socle.

## Monolithe modulaire

Commencer par un monolithe modulaire. Chaque domaine possède ses règles métier, ses commandes, ses
repositories et ses modèles de lecture. Une extraction en service indépendant demande un besoin
mesuré (déploiement indépendant, isolation, charge, équipe ou frontière de sécurité), un ADR et une
stratégie de données et d'API. Ne pas transformer une frontière de package en microservice par
anticipation.

```text
application/
  domains/<domaine>/          métier et tests du domaine
  platform/                   identité, autorisation, audit, observabilité
  integrations/               adaptateurs vers des systèmes externes
```

L'arborescence exacte suit le framework choisi si les frontières de domaine restent vérifiables.

## Propriété des données et intégrations

* Chaque domaine est propriétaire de son modèle et de son stockage logique. Aucun domaine ne lit
  directement le repository d'un autre ; il passe par une façade publique, un contrat ou un
  événement explicite.
* Chaque application et chaque environnement gardent leurs propres données et migrations. Une
  technologie de stockage partagée n'implique ni schéma partagé ni transaction distribuée.
* Tout appel à un système externe passe par un port ou un adaptateur. Ses délais d'attente, limites,
  erreurs et règles de reprise sont explicités.

## IA, agents et analytique

Les exigences opérationnelles sont précisées dans [`agents-ia.md`](agents-ia.md),
[`mcp.md`](mcp.md), [`rag.md`](rag.md) et [`testing.md`](testing.md).

* Les règles métier et les indicateurs restent la source de vérité dans leurs domaines propriétaires.
  Un modèle, un index de recherche ou un tableau de bord ne les redéfinit pas.
* Un agent ou un orchestrateur accède aux données et aux actions par des API ou des outils explicites
  et autorisés. Il n'accède jamais directement aux bases transactionnelles.
* Une skill décrit une procédure ou un contexte de travail ; elle n'accorde aucun droit d'accès.
  Chaque outil vérifie l'identité et l'autorisation au moment de l'appel.
* Les embeddings et index RAG sont des projections dérivées des sources. Ils gardent leur provenance,
  leurs règles d'accès et leur cycle de fraîcheur/suppression alignés sur les sources ; ils ne
  remplacent pas ces dernières.
* Chaque indicateur BI a une définition détenue par le domaine : formule, unité, période, filtres,
  provenance et autorisation. Les rapports et agents réutilisent la même définition.
* Commencer par des projections analytiques bornées. Introduire une plateforme ou un entrepôt
  analytique séparé seulement si les besoins de volume, d'historisation, de fraîcheur ou de
  croisement de domaines le justifient.
* Ne pas utiliser le RAG comme source de vérité d'un indicateur numérique.

### Orchestration en graphe

Un moteur de workflow en graphe (par exemple LangGraph) est pertinent si le processus requiert un
état explicite, des branches, des reprises, des étapes parallèles ou une validation humaine. Un
enchaînement linéaire reste un service ou un workflow simple. Le graphe orchestre les appels ; il
n'accorde aucun droit. Chaque action reste autorisée et bornée au moment de son exécution.

### Graphe de connaissances

Un graphe de connaissances ou une base orientée graphe n'est introduit que si les relations et les
requêtes multi-sauts apportent un besoin mesuré. Les données métier demeurent détenues par leurs
domaines ; le graphe est une projection dérivée avec provenance, fraîcheur, contrôle d'accès et
cycle de mise à jour/suppression définis. Il ne devient pas une seconde source de vérité.

## Décisions d'architecture

Documenter une décision structurante dans `docs/adr/NNNN-titre.md` avec le contexte, la décision,
les options, les conséquences et le statut. Un changement de stockage, d'identité ou de protocole
transverse requiert un plan de migration et de retour arrière avant son déploiement.

## Architecture d'un module

Les règles de couches ci-dessous définissent le profil backend Java/Spring. Elles précisent le
socle modulaire sans imposer ces choix à une application qui utilise un autre framework ; les
principes de frontières et de propriété des données restent communs.

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

# Suppression et états du cycle de vie

Un état terminal (par exemple validé, clôturé ou payé) n'interdit pas automatiquement la
suppression. Le domaine définit cette règle à partir des invariants métier et des effets produits
par l'enregistrement.

* Si supprimer l'enregistrement compromet l'historique, une référence ou un effet déjà produit,
  le service métier bloque la suppression directe et applique uniquement le parcours de correction
  ou d'annulation défini par le domaine.
* Si aucun invariant ne l'interdit, la suppression suit la politique métier et l'autorisation
  habituelles ; l'état terminal seul ne constitue pas une interdiction.
* Le backend fait respecter la règle. Le frontend reflète le même état pour guider l'utilisateur,
  sans remplacer le contrôle serveur.
* Le domaine documente le cycle de vie, les transitions permises et les tests qui vérifient la règle.

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
