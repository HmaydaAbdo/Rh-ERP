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

À utiliser lorsque plusieurs algorithmes réalisent la même opération.

lorsqu'une Strategy rend le code plus extensible.

Exemple retenu : le **périmètre d'audit** d'une opération de masse (`PerimetreAudit`, `conventions/audit.md`) — une
classe par opération (import, suppression en groupe, export), dans son module, pour que ni le service métier ni
l'aspect d'audit ne contiennent de logique de description.

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