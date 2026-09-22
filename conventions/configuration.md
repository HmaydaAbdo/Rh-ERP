# Configuration

> Toute valeur utilisée par l'application doit être placée dans la source de configuration appropriée.

## Principes

* Aucune règle métier configurable ne doit être codée en dur dans le code ou dans les fichiers de configuration.
* Lorsqu'une valeur hardcodée est rencontrée dans le projet, elle doit être remplacée par une configuration adaptée dans le cadre du changement en cours lorsque cela est raisonnablement possible.
* Le code contient la logique métier, jamais les paramètres métier.
* Une modification de règle métier ne doit jamais nécessiter un redéploiement de l'application.
* Toute configuration métier doit pouvoir être administrée via l'interface utilisateur.

---

## Configuration technique

Les paramètres techniques sensibles ou dépendants de l'environnement proviennent des variables d'environnement.

Exemples :

* URL ;
* ports ;
* secrets ;
* mots de passe ;
* clés API ;
* endpoints externes ;
* configuration SMTP ;
* configuration OAuth.

Toujours utiliser :

```yaml
property: ${VARIABLE}
```

Ne jamais définir de valeur par défaut.

Interdit :

```yaml
property: ${VARIABLE:defaultValue}
```

Les paramètres techniques immuables peuvent être définis dans `application.yml` lorsqu'ils ne dépendent pas de l'environnement d'exécution.

Exemples :

* `spring.jpa.hibernate.ddl-auto` ;
* configuration Jackson ;
* configuration Tomcat ;
* configuration Spring MVC ;
* niveaux de logs ;
* compression HTTP.

---

## Configuration métier

Toute valeur métier susceptible d'évoluer doit être configurable par un administrateur via l'interface utilisateur.

Exemples :

* commissions ;
* plafonds ;
* délais ;
* pourcentages ;
* montants ;
* seuils ;
* nombre maximal de tentatives ;
* durée de verrouillage ;
* activation d'une fonctionnalité.

Ces valeurs ne doivent jamais être codées en dur dans :

* le code Java ;
* `application.yml` ;
* `application.properties`.

---

## Constantes autorisées

Peuvent rester dans le code uniquement les constantes immuables.

Exemples :

* enums ;
* codes HTTP ;
* `MediaType` ;
* expressions régulières ;
* routes REST ;
* noms de tables ;
* noms de colonnes.

---

## Interdictions

Ne jamais écrire :

```java
private static final BigDecimal COMMISSION = new BigDecimal("150");
```

```java
if (days > 30)
```

```java
loginAttempts >= 5
```

```yaml
commission.virement=150
```

---

## Lors des évolutions

Lorsqu'un développement touche une partie du code contenant des valeurs métier codées en dur, celles-ci doivent être remplacées par une configuration adaptée lorsque cela est raisonnablement possible.

Ne pas introduire de nouvelles valeurs hardcodées et ne pas perpétuer les anciennes.

---

## Exemple de mise en œuvre — paramètre métier administrable

Ce pattern s'applique à tout paramètre métier récurrent (taux, plafond, barème, condition
d'application...) qui doit rester modifiable sans redéploiement :

| Rôle | Source |
|---|---|
| Valeur du paramètre | Table de configuration dédiée en base de données |
| Condition d'application, si plusieurs cas possibles | Modélisée en base (jamais un `if`/`switch` figé dans le code) |
| Résolution de la valeur applicable | Un service dédié (`IXxxConfigService.resolve(...)`), jamais un accès direct au repository depuis le code appelant |
| Administration des valeurs | Interface utilisateur réservée aux rôles/permissions appropriés |

Sources interdites pour ce type de valeur : `application.yml`, `@Value("${xxx.*}")`,
`@ConfigurationProperties`, constantes Java (`static final`).

Voir `architecture.md` pour les conventions d'organisation du code correspondantes (le module
propriétaire décide *si* un paramètre s'applique, un service dédié résout *sa valeur*).

---

## Résumé

* Le code contient la logique.
* Les variables d'environnement contiennent la configuration technique dépendante de l'environnement.
* `application.yml` contient uniquement la configuration technique immuable.
* Les paramètres métier sont configurables et administrables.
* Une règle métier ne doit jamais être codée en dur.
