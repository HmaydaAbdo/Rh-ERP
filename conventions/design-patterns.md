# Design Patterns

> Les Design Patterns sont utilisés uniquement lorsqu'ils simplifient réellement le code. Ils ne sont jamais introduits par anticipation.

---

# Principes

* Ne jamais introduire un Design Pattern sans besoin réel.
* Préférer la solution la plus simple qui respecte les conventions du projet.
* Lorsqu'un pattern devient pertinent, l'utiliser de manière complète et cohérente.
* Ne jamais mélanger plusieurs patterns pour résoudre un même problème.
* Toujours privilégier la lisibilité.

---

# Strategy

Utiliser une stratégie lorsque plusieurs implémentations encapsulent des variantes d'une même
opération et que ce besoin d'extension est réel. Chaque stratégie reste dans le module propriétaire
de son comportement.

### Registre de handlers

Lorsqu'une opération transverse est déclenchée par un point d'entrée générique mais varie selon le
module concerné, utiliser une stratégie par module et les réunir dans un registre plutôt qu'un
`switch` central.

```java
public interface XxxHandler {
    ModuleSource source();
    Result handle(Long id, Request request);
}
```

* Chaque module concerné fournit son handler dans son propre package.
* Le service générique collecte les handlers au démarrage et route vers celui associé à la source.
* Le service générique ne connaît ni les entités ni les repositories des autres modules.
* L'ajout d'une source se fait par un nouveau handler, sans modifier le répartiteur générique.

N'utiliser ce registre que si plusieurs implémentations réelles existent ou sont prévues par le
besoin validé. Pour un seul cas, une classe simple reste préférable.

Quand un enregistrement générique référence une source appartenant à un module et que le besoin
impose de synchroniser les deux, ce registre peut router vers un handler de synchronisation.
Ne synchroniser que les champs réellement partagés. L'absence de handler signifie que la source
n'exige pas cette synchronisation. Le comportement face à un enregistrement dans un état terminal
est défini explicitement par le domaine concerné.

---

# Factory

À utiliser lorsqu'un objet ou un service doit être créé selon un type métier.

La Factory centralise le choix de l'implémentation.

---

# Template Method

À utiliser lorsque plusieurs traitements suivent les mêmes étapes avec seulement quelques variations.

Les étapes communes restent dans la classe abstraite.

---

# Observer / Event

À utiliser lorsqu'un traitement doit déclencher plusieurs actions indépendantes.

Privilégier les événements Spring plutôt que les appels directs lorsque les traitements sont indépendants.

Exemple retenu : les **événements de sécurité** (connexion, refus, jeton réutilisé…) sont publiés par le service qui
les connaît et écrits par un écouteur unique dans le journal d'audit (`conventions/audit.md`) — le service
d'authentification ne dépend jamais du journal.

---

# Decorator

À utiliser pour ajouter un comportement sans modifier l'implémentation existante.
---

# Adapter

À utiliser pour intégrer un système externe sans propager son API dans le domaine métier.

---

# Specification

Toutes les recherches filtrables utilisent le pattern Specification.

---

# Builder

À utiliser pour les objets complexes comportant de nombreux paramètres optionnels.

Éviter les constructeurs de grande taille.

---

# Patterns interdits

Ne jamais introduire un Design Pattern :

* par anticipation ;
* pour un simple CRUD ;
* lorsqu'une classe suffit ;
* pour "faire du SOLID".

Le pattern doit toujours simplifier le code.

---

# Principes

* KISS avant tout.
* YAGNI avant tout.
* Le meilleur Design Pattern est celui qui supprime la complexité, pas celui qui en ajoute.
