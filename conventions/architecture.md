# Architecture

> Conventions d'architecture backend applicables à tous les modules.

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
* `GlobalExceptionHandler` gère uniquement les erreurs imprévues.

---

# Organisation des packages (DDD)

* Un package racine par domaine métier.
* Sous-packages techniques internes uniquement (`controller`, `service`, `repository`, etc.).
* Jamais plusieurs domaines dans un package technique partagé.
* L'infrastructure (`auth`, `jwt`, `security`...) reste séparée des domaines métier.

---

# Encapsulation des domaines

* Un Repository appartient exclusivement à son domaine.
* Communication inter-domaines via le Service uniquement.
* Ne jamais injecter un Repository d'un autre domaine.
* Chaque Service constitue la façade publique de son domaine.

Exemple :

```text
LeasingService
      ↓
BanqueService
      ↓
BanqueRepository
```

---

# Modules générant des transactions — Règles de validation et synchronisation

## Règle 1 — La logique de validation appartient au module source ; un seul point d'entrée générique la déclenche

Lorsqu'un module métier génère des transactions bancaires (rapprochement), **la logique de
validation doit vivre dans ce module**, pas dans le service générique `BatchValidationService`.
Mais le déclenchement de cette logique — que ce soit pour une opération seule ou pour un lot — passe
par **un seul point d'entrée HTTP générique**, jamais par un endpoint dédié à la source.

**Historique (révisé le 19/09/2026) :** jusqu'au 19/09/2026, chaque source avait son propre couple
de méthodes de service (parfois deux, une par sens) et son propre endpoint REST unitaire
(`/process/{source}`), en plus de l'endpoint de lot générique — soit ~25 endpoints distincts pour
un seul et même geste métier ("valider ceci"). Cette duplication a été éliminée : valider une seule
opération n'est qu'un cas particulier de valider un lot de taille 1. Le patron ci-dessous est
désormais la seule façon correcte d'ajouter une source — il ne s'agit pas d'une préférence, c'est
la règle.

### Structure obligatoire

Pour tout module `Xxx` qui produit des transactions :

```text
xxx/
└── validation/
    ├── services/
    │   ├── interfaces/
    │   │   └── IXxxValidationService.java     ← interface du domaine
    │   ├── XxxValidationService.java          ← implémentation
    │   └── XxxBatchValidationHandler.java     ← @Component implements BatchValidationHandler
    ├── dto/
    │   ├── XxxTransactionRequestDto.java      ← record ou classe, un seul (pas un par sens)
    │   └── XxxTransactionResponseDto.java
    └── mapper/
        └── XxxTransactionMapper.java          ← MapStruct abstract class
```

### Responsabilités de `XxxValidationService`

* Récupérer les entités du **même domaine** (ses propres repositories).
* Exposer **une seule méthode de validation** (`processXxxTransaction`), quel que soit le nombre de
  sens que la source distingue. Si la source a un sens (décaissement/encaissement), il est lu
  directement sur l'entité (par le mapper) — jamais transmis par l'appelant sous forme de deux
  méthodes ou deux endpoints. Deux méthodes identiques à l'exception de leur nom sont un signe que
  la logique de sens n'existe pas vraiment et que la duplication doit être supprimée.
* Construire la transaction via son `XxxTransactionMapper`.
* Attacher la transaction au rapprochement cible et la sauvegarder.
* Mettre à jour l'entité source (statut, dates) après persistance.

### Responsabilités de `XxxBatchValidationHandler`

* Implémente `BatchValidationHandler` (`source()` + `processOne(Long id, BatchValidationRequestDto)`).
* `@Component` — découvert et enregistré automatiquement par Spring dans le registre de
  `BatchValidationService`, aucune modification d'une classe centrale n'est nécessaire pour ajouter
  une source.
* Construit le DTO unitaire de la source à partir des champs communs de `BatchValidationRequestDto`
  et appelle l'unique méthode de `IXxxValidationService`.
* C'est le **seul** point qui sait comment construire le DTO unitaire de sa source — ni
  `ValidationController`, ni le frontend, n'ont besoin de connaître sa forme exacte au-delà des
  champs communs.

### Rôle de `ValidationController`

`ValidationController` n'expose **qu'un seul endpoint de validation** pour toutes les sources,
`POST /rapprochement/process`, qui accepte un `BatchValidationRequestDto` (`ids` porte un ou
plusieurs identifiants — valider une opération seule, c'est envoyer `ids` avec un seul élément) et
délègue au registre de `BatchValidationHandler` :

```java
// Correct — un seul endpoint pour toutes les sources, une ou plusieurs opérations
@PostMapping("/process")
public ResponseEntity<BatchValidationResponseDto> processTransaction(
        @Valid @RequestBody BatchValidationRequestDto requestDto) {
    return new ResponseEntity<>(batchValidationService.processBatch(requestDto), CREATED);
}

// Interdit — un endpoint dédié à une source
@PostMapping("/process/echeance-leasing")
public ResponseEntity<LeasingTransactionResponseDTO> processLeasingTransaction(...) { ... }

// Interdit — deux endpoints pour distinguer le sens
@PostMapping("/process/decaissement/virement")
@PostMapping("/process/encaissement/virement")

// Interdit
validationService.processXxx(...); // logique métier du module Xxx dans ValidationService
```

Ajouter une nouvelle source ne demande donc **jamais** de toucher `ValidationController` :
seulement une implémentation de `BatchValidationHandler` dans le module de cette source (voir
`BatchValidationService`, dont le Javadoc de classe documente les familles de patron existantes —
sens explicite, sens porté par `TransactionSource`, sens porté par l'entité).

### Champs propres à une opération, transmis uniquement quand `ids` a un seul élément

`libellé`, `observation`, `date d'émission` et le montant de TVA en saisie libre (`montantTva`)
n'ont de sens que pour **une** opération — les appliquer à un lot de N opérations écraserait des
valeurs propres à chacune. `BatchValidationRequestDto` les porte en champs optionnels, mais
`BatchValidationService` rejette la requête si l'un d'eux est renseigné alors que `ids` contient
plusieurs éléments. Pour un vrai lot (`ids.size() > 1`), ces champs restent `null` et chaque
`BatchValidationHandler` retombe sur l'entité source (via son mapper), exactement comme avant.

### Ce que `BatchValidationService` ne doit jamais contenir

* Aucun repository d'un autre module.
* Aucune entité d'un autre module.
* Aucune logique métier propre à un module (ex : vérification du statut d'une échéance leasing).
* Aucun `case`/`switch` sur `TransactionSource` pour dispatcher vers un service — c'est le rôle du
  registre de `BatchValidationHandler`.

### Frontend — même principe, un seul point d'appel

Le frontend n'a besoin que d'**un seul** appel HTTP de validation (`ValidationService.valider`, avec
`ids` à un seul élément pour une opération unitaire) — jamais d'une méthode dédiée par source. Le
dialogue générique de validation unitaire (`recapitulatif.component.ts`, `unitValidationConfigs`) ne
construit que les champs propres à l'affichage et au routage vers la bonne source (via
`toCommonDetail`/`toRoutingFields`) ; c'est une fonction partagée, pas une par source, qui construit
la requête `BatchValidationRequestDto` et appelle `valider`.

### Le même patron s'applique à l'annulation (`ReverseTransactionService`)

L'annulation d'une transaction (`DELETE /rapprochement/annuler/{id}`) est le geste symétrique de la
validation — remettre l'entité source à son état initial plutôt que de la faire passer à PAYE — et
suit donc le même principe : la logique d'annulation appartient au module source, un registre
générique la déclenche, jamais un `switch` central.

```text
xxx/
└── validation/
    └── services/
        └── XxxReversalHandler.java   ← @Component implements TransactionReversalHandler
```

`TransactionReversalHandler` (`source()` + `reset(Long referentId)`) est le miroir exact de
`BatchValidationHandler` côté annulation : une implémentation par source, découverte
automatiquement par Spring, enregistrée dans `ReverseTransactionService` par `source()`.
`ReverseTransactionService.resetEntiteSource` ne fait que consulter ce registre — aucun `case`/
`switch` sur `TransactionSource`, aucun repository d'un autre module injecté directement. Ajouter
une nouvelle source à l'annulation ne demande jamais de modifier `ReverseTransactionService`,
seulement d'ajouter une implémentation de `TransactionReversalHandler` dans le module de cette
source (migration du 19/09/2026 : remplace un `switch` de 20 cas et une vingtaine de repositories
injectés directement dans le service).

---

## Règle 2 — Synchronisation Transaction ↔ Entité source

Lorsqu'une transaction est liée à une entité source (via `Transaction.referent` + `Transaction.transactionSource`), **toute modification de la transaction doit être propagée à l'entité source** — le système ne doit jamais laisser Transaction et entité source diverger sur les champs qu'elles partagent.

### Mécanisme

* `Transaction.referent` contient l'ID de l'entité source.
* `Transaction.transactionSource` identifie le module (`LEASING`, `CMT`, etc.).
* `TransactionService.updateTransactionById()` dispatche la synchronisation via un registre de
  `TransactionSyncHandler` (migration du 20/09/2026 : remplace un if-chain de 20 branches sur
  `TransactionSource`, même principe que {@code BatchValidationHandler} et
  `TransactionReversalHandler` — voir Règle 1) — aucun `case`/`switch` central, aucune
  modification de `TransactionServiceImpl` pour ajouter une source.

```java
TransactionSyncHandler handler = syncHandlerRegistry.get(saved.getTransactionSource());
if (handler != null) {
    handler.sync(saved.getReferent(), saved.getDateValeur(), saved.getDateOperations(),
            saved.getLibelle(), saved.getObservation());
}
```

Un handler manquant (LCN legacy jamais écrit, CAUTION, Importation — sources sans entité à
synchroniser) ne déclenche aucune erreur : la transaction elle-même est toujours mise à jour, seule
la propagation est ignorée.

### Interface obligatoire

Tout `IXxxValidationService` doit exposer une méthode de synchronisation :

```java
void syncXxxFromTransaction(Long sourceId, LocalDate dateValeur, LocalDate dateOperation, String libelle, String observation);
```

Chaque `XxxSyncHandler` (`@Component implements TransactionSyncHandler`, un par source, dans le
même module que le `XxxBatchValidationHandler` correspondant) ne fait que router vers cette
méthode — la logique métier (retrouver l'entité, poser les champs, sauvegarder) reste dans le
service, jamais dans le handler.

### Champs synchronisés — et ceux qui ne le sont volontairement pas

`dateValeur`, `dateOperation`, `libelle` et `observation` existent à la fois sur `Transaction` et
sur l'entité source : modifier l'un doit toujours reposer l'autre à la même valeur. La TVA
(`tvaDeductible`/`tvaCollectee`) n'existe en revanche que sur `Transaction` — aucune propagation
n'est nécessaire pour elle, mais sa valeur doit toujours être **recalculée par `TvaResolver`** à
partir du même montant TTC fixe (l'entité source), jamais acceptée telle quelle depuis le client :
c'est ce qui garantit qu'un montant de TVA ne peut jamais dépasser ou diverger du montant réel de
l'opération. `dateEmission`, le montant lui-même (`debit`/`credit`) et la banque de prélèvement ne
sont **jamais éditables** après validation — modifier le montant ou la banque d'une opération déjà
comptabilisée n'est pas une correction de saisie, c'est une opération différente (annuler puis
revalider, voir `ReverseTransactionService`).

### Règle de blocage

Une entité source dont le statut est terminal (`PAYE`, `VALIDE`, etc.) **ne peut pas être modifiée** via cette synchronisation. La méthode `syncXxxFromTransaction` doit vérifier le statut et lever une exception si nécessaire, ou simplement ignorer la synchronisation si le statut est irréversible par design.

### Cohérence garantie

| Action | Effet |
|---|---|
| Validation d'une entité source | Transaction créée + entité mise à jour (statut + dates) |
| Modification directe de l'entité source (si PREVU) | Modification de l'entité uniquement |
| Modification d'une transaction déjà validée (`PATCH /transactions/{id}`) | Transaction mise à jour (dates, libellé, observation, TVA recalculée) + propagation automatique des champs partagés vers l'entité source |

---

## Règle 3 — La logique de commission appartient au module source

Lorsqu'un module métier génère des commissions (leasing, cautions, virements, etc.), **la logique de calcul et de génération des commissions doit vivre dans ce module**, pas dans le module `commission`.

### Structure obligatoire

Pour tout module `Xxx` qui produit des commissions :

```text
xxx/
└── sousModule/
    └── services/
        ├── interfaces/
        │   └── IXxxCommissionService.java   ← optionnel si utilisé en dehors du module
        └── XxxCommissionService.java        ← logique de génération propre au domaine
```

### Responsabilités de `XxxCommissionService`

* Décider si une commission doit être générée (règles métier propres au domaine).
* Résoudre le montant via `ICommissionConfigService` (interface du module `commission`).
* Déléguer la création de l'entrée `Commission` à `ICommissionService` (interface publique du module `commission`).

### Ce que le module `commission` ne doit jamais contenir

* Aucune logique propre à un autre domaine (ex : règle spécifique au leasing, à une caution).
* Aucune référence directe aux entités d'un autre module.
* Le module `commission` est un module de persistance et d'accès — pas un module de décision métier.

### Communication inter-modules

```text
XxxCommissionService (module Xxx)
      ↓ ICommissionConfigService   ← résoudre le montant
      ↓ ICommissionService         ← persister la commission
commission/ (module commission)
```

Seules les **interfaces** du module `commission` peuvent être injectées dans d'autres modules.

---

## Règle 4 — Les montants de commission sont configurés en base de données

Tout montant, taux ou seuil de commission **doit être stocké dans la table `commission_config`**, administrable via l'interface utilisateur.

### Interdit

```yaml
commission.leasing.cih: 11
commission.virement.bmci: 33
```

```java
private static final BigDecimal COMMISSION_CIH = new BigDecimal("11");
```

```java
@Value("${commission.leasing.cih}")
private BigDecimal commissionCih;
```

### Obligatoire

* Utiliser `ICommissionConfigService.resolveCommission(banqueNom, organismeNom, type)` pour obtenir le montant.
* La résolution suit l'algorithme à trois niveaux : `SI_MATCH` → `SI_NON_MATCH` → `DEFAULT`.
* Si aucune règle n'existe pour une banque (`hasCommission()` retourne `false`), ne pas générer de commission — ne pas lever d'exception.

### Accès à l'administration

* L'UI de gestion est accessible à `/portail/admin/commission-config`.
* Réservée aux `SYSTEM_ADMIN` (guard frontend + `@PreAuthorize` backend).

---

## Règle 5 — Une opération déjà PAYE n'est jamais supprimable

Toute entité portant un statut `PREVU`/`PAYE` (ou équivalent — `REGLE`, `À payer`/`Payé`, etc.)
**doit bloquer la suppression** dès lors que son statut n'est plus `PREVU`. Cette règle est
transversale à tout le projet, indépendante du module.

**Why:** une opération déjà réglée (PAYE) a déjà généré une transaction bancaire et impacté un
rapprochement — la supprimer casserait la cohérence comptable et l'historique d'audit sans laisser
de trace de la correction. Règle confirmée explicitement par HMAYDA (14/07/2026) : "toute chose payé
ne peut pas être supprimé car c'est déjà réglé, c'est obvious".

### Obligatoire

* Le service métier (`deleteXxx`) doit vérifier `entity.getStatus() != Status.PREVU` (ou
  l'équivalent du module) **avant** l'appel `repository.delete(...)`/`deleteById(...)`, et lever une
  exception de règle métier (`ValidationException`, ou l'exception métier dédiée du module si elle
  existe déjà — ex. `AgiosBusinessException`) sinon.
* Le endpoint `DELETE` correspondant reste réservé `SYSTEM_ADMIN` (`conventions/security.md`) — les
  deux contraintes (rôle + statut) sont indépendantes et cumulatives.
* Côté frontend, le bouton "Supprimer" doit être désactivé (`[disabled]="x.status === Status.PAYE"`)
  en plus d'être conditionné par `isAdmin()` — ne pas se reposer uniquement sur le rejet backend.
* La documentation (`docs/modules/<module>.md`, section Règles métier, et `docs/rbac/<module>.md`,
  colonne Justification de la ligne `DELETE`) doit mentionner explicitement cette restriction.

### Absence de garde constatée dans du code existant

L'absence de cette garde dans un module donné n'est **pas** la preuve d'une exception métier
volontaire — c'est très probablement un oubli (voir l'incident Restitution/Commission du
14/07/2026, où l'absence de garde avait d'abord été interprétée à tort comme un choix assumé). Par
défaut, appliquer la garde ; si un module doit vraiment y déroger, confirmer explicitement avec
HMAYDA avant de le documenter comme une exception.

### Modules déjà audités contre cette règle (14/07/2026)

Impayées, Restitution, Impôts et Taxes, Prélèvements, Chèques, LCN, Virements, Virement
International, Mise à Disposition, Commission, Décompte, Préfinancement, Factoring, Droits
Constatés, Agios (ponctuel), Frais bancaires (guard corrigée en avance de son sweep complet).
Caution suit une règle analogue mais avec un cycle de vie différent (`actif`/archivage, pas
`PREVU`/`PAYE` — suppression bloquée si la caution est archivée). Restent à auditer lors de leur
sweep : Opérations erronées (en cours), États des encours, Rapprochement, Transactions.

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