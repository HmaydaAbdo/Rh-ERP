# Metrics

> Conventions Micrometer applicables à tous les modules.

# Principes

* Les métriques mesurent le comportement de l'application, pas la logique métier.
* Toute nouvelle métrique doit apporter une information exploitable.
* Ne jamais créer plusieurs métriques pour mesurer la même chose.

---

# Organisation

Les métriques d'un domaine sont regroupées dans :

```text
module/
├── metrics/
│   └── XxxMetrics.java
├── service/
└── ...
```

* `XxxMetrics` est un `@Component`.
* `MeterRegistry` est injecté dans cette classe.
* Les Services utilisent `XxxMetrics` pour enregistrer les métriques.

---

# Convention de nommage

Toutes les métriques suivent la convention :

```text
gbanque.<module>.<objet>.<mesure>
```

Exemples :

```text
gbanque.caution.active.count
gbanque.leasing.echeances.j7.count
gbanque.batch.funpaiement.operations.success
gbanque.batch.funpaiement.operations.failure
gbanque.batch.funpaiement.duration
```

Conventions :

* minuscules uniquement ;
* séparateur `.` ;
* noms stables ;
* noms explicites.

---

# Gauge

Utiliser un `Gauge` pour mesurer une valeur instantanée.

Exemples :

* nombre de cautions actives ;
* nombre de rapprochements en cours ;
* nombre d'échéances à venir.

Règles :

* enregistré une seule fois ;
* alimenté par un `Supplier<Number>` ;
* ne jamais incrémenter ou décrémenter un Gauge manuellement.

---

# Counter

Utiliser un `Counter` pour compter des événements.

Exemples :

* création d'une entité ;
* suppression ;
* synchronisation réussie ;
* synchronisation échouée.

Règles :

* un Counter ne diminue jamais ;
* incrémenter uniquement après l'opération concernée.

---

# Timer

Utiliser un `Timer` pour mesurer la durée d'une opération.

Exemples :

* batch ;
* traitement métier long ;
* appel externe.

Utiliser :

* `Timer.record(...)`
* ou `Timer.start()` / `stop()`.

---

# Où enregistrer les métriques

## Gauge

Créer les Gauges au démarrage du bean.

Le `Supplier` est interrogé automatiquement par Prometheus.

---

## Counter

Incrémenter le Counter dans le Service après une opération réussie ou échouée.

---

## Timer

Mesurer la durée directement autour de l'opération métier.

---

# Modules concernés

Ajouter des métriques métier pour les modules ayant un état métier significatif.

Exemples :

## Rapprochement

* rapprochements par statut ;
* rapprochements par banque.

## Caution

* cautions actives ;
* cautions expirées.

## Leasing

* échéances J-7 ;
* échéances J-30.

## CMT

* échéances J-7 ;
* échéances J-30.

## Batch FunPaiement

* synchronisations réussies ;
* synchronisations échouées ;
* durée d'exécution.

## Moyens de paiement

* créations par type ;
* passages à l'état échu.

---

# Modules exclus

Les modules CRUD sans état métier particulier n'ajoutent pas de métriques métier.

Exemples :

* Auth
* User
* Department

Les métriques HTTP automatiques de Micrometer sont suffisantes.

---

# Tags

Utiliser uniquement des tags ayant une cardinalité faible.

Exemples :

* banque ;
* statut ;
* type ;
* environnement.

Ne jamais utiliser comme tag :

* id ;
* username ;
* email ;
* numéro de compte ;
* UUID ;
* timestamp.

---

# Bonnes pratiques

* Une métrique mesure une seule chose.
* Réutiliser une métrique existante lorsqu'elle répond déjà au besoin.
* Les noms de métriques sont stables dans le temps.
* Supprimer les métriques devenues inutiles.
* Éviter les métriques jamais consultées.
* Éviter les tags inutiles.

---

# Principes

* Toute métrique doit avoir un objectif de supervision.
* Les métriques doivent rester simples et cohérentes.
* Les métriques métier complètent les métriques HTTP automatiques de Micrometer.
* Les tableaux de bord et les alertes doivent pouvoir s'appuyer directement sur les métriques exposées.
