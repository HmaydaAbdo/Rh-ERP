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
Le choix des protocoles et transports suit [`integrations.md`](integrations.md) : proposer des
solutions nouvelles utiles, comparer leurs compromis et les adopter sur un besoin vérifié.

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

## Montants

Tout montant d'argent est **un entier de dirham, arrondi automatiquement** (0,5 inclus on descend, au-delà on monte : 12,5 → 12, 12,51 → 13), partout
dans le projet et jamais à la main : saisie d'un formulaire, API, import Excel, MCP. L'arrondi est posé une seule
fois, au bord du système, par le type partagé du schéma (`Montant`, `common/montant.py` côté API) avant les
contraintes (positif ou nul, borne maximale, nombre de chiffres). Un montant n'est donc jamais refusé pour avoir des
décimales ; il l'est s'il est négatif ou hors capacité. Aucun montant n'a de centimes, dans aucun domaine : salaire,
primes, bulletin de paie, heures supplémentaires, forfaits, coûts moyens, totaux et affichages (`1.0-0` côté Angular, colonnes
`NUMERIC(p,0)` côté base). Les calculs dérivés (S/H, montant d'heures supplémentaires, coûts moyens) s'arrondissent eux aussi à l'entier par la même
règle (`HALF_DOWN`) : il n'y a qu'une seule règle d'arrondi des montants. Toute exception est une règle métier écrite par
le propriétaire, jamais un oubli. Les quantités (jours, heures) ne sont pas
des montants : elles ne sont pas arrondies.

## Décisions d'architecture

Documenter une décision structurante dans `site/docs/decisions/NNNN-titre.md` avec le contexte, la décision,
les options, les conséquences et le statut. Un changement de stockage, d'identité ou de protocole
transverse requiert un plan de migration et de retour arrière avant son déploiement.

## Architecture d'un module

Les règles de couches ci-dessous s'appliquent au backend Python (FastAPI, SQLAlchemy 2.x, Pydantic) ; leur mise en œuvre
détaillée est dans [`site/docs/conventions/backend-python/architecture.md`](../site/docs/conventions/backend-python/architecture.md).
Elles précisent le socle modulaire sans imposer ces choix à une application qui utilise un autre framework ; les principes de
frontières et de propriété des données restent communs.

Chaque domaine métier suit la même structure :

```text
domains/<domaine>/
├── models.py          modèles de persistance
├── repository.py      requêtes
├── schemas.py         requêtes et réponses (Pydantic)
├── service.py         logique métier et façade publique
├── router.py          routes HTTP
├── exceptions.py      erreurs métier et leurs gestionnaires
├── criteria.py        critères des listes filtrables (si le domaine en a)
├── audit.py           déclaration de l'historique (si le domaine est audité)
└── metriques.py       mesures Prometheus (si le domaine en a)
```

## Couches

### Modèle de persistance

* Persistance uniquement.
* Jamais exposé par l'API.
* Aucune logique métier.

### Repository

* Requêtes `select()` explicites ; critères de liste dans `criteria.py`.
* Relations sérialisées chargées explicitement (`selectinload`), jamais paresseusement hors d'un `await`.
* Jamais de logique métier.

### Service

* Toute la logique métier.
* Frontière transactionnelle explicite sur les écritures (`session.begin()`) ; les lectures n'ouvrent pas de transaction d'écriture.
* Les recherches d'entités sont centralisées dans des fonctions privées.

### Routeur

* Routes fines.
* Schémas Pydantic uniquement.
* Délègue toute la logique au service.
* Jamais de repository.

### Schémas

* Modèles Pydantic `BaseModel`.
* Requête et réponse séparées.
* Contraintes de validation complètes, déclarées dans le modèle.

### Conversion

* Fonctions explicites ou `model_validate(..., from_attributes=True)`.
* Conversion uniquement.
* Jamais de logique métier ni de repository.

### Critères

* Toute liste filtrable passe par un objet de critères et une fonction qui renvoie les conditions `where` :

```python
conditions_recherche(criteres: XCriteres) -> list[ColumnElement[bool]]
```

### Exceptions

* Une hiérarchie d'erreurs par domaine, avec ses gestionnaires déclarés sur l'application.
* Le gestionnaire générique (`Exception`) gère uniquement les erreurs imprévues : l'absence d'un gestionnaire
  spécifique ferait retomber silencieusement une exception attendue (ex. accès refusé) sur la réponse générique —
  vérifier ce cas à chaque nouvelle exception transverse.

---

# Organisation des modules (DDD)

* Un module racine par domaine métier.
* Fichiers techniques internes uniquement (`router.py`, `service.py`, `repository.py`, etc.).
* Jamais plusieurs domaines dans un module technique partagé.
* L'infrastructure transverse (authentification, sécurité, configuration technique...) reste dans
  `platform/`, séparée des domaines métier.

---

# Encapsulation des domaines

* Un repository appartient exclusivement à son domaine.
* Communication inter-domaines via la façade publique du domaine (son `service.py` ou son `api.py`) uniquement.
* Ne jamais importer le repository d'un autre domaine.
* Pour obtenir une référence d'une entité d'un autre domaine (ex. poser une relation), valider
  l'existence via la façade du domaine propriétaire, puis utiliser l'identifiant localement
  — jamais via le repository de l'autre domaine.

Exemple :

```text
service du module A
      ↓ (façade publique du module B uniquement)
service du module B
      ↓
repository du module B
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

* Les dépendances arrivent par paramètres (`Depends` de FastAPI pour les routes, arguments du constructeur ou de la fonction pour les services).
* Pas d'état global modifiable ni de singleton importé à la volée : une dépendance se remplace dans les tests par `app.dependency_overrides`.

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
* Si une suppression est temporairement impossible, créer la tâche Jira (projet `KAN`) qui la porte.
* Toute valeur configurable doit respecter les conventions de `configuration.md`.
