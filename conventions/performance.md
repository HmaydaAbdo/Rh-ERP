# Performance

La performance se conçoit à partir des usages et des volumes attendus, puis se vérifie par des
mesures reproductibles. Chaque application documente ses objectifs de latence, de débit, de capacité
et les profils de charge pertinents.

## Principes

* Définir des objectifs de service proportionnés à l'usage : latence, débit, disponibilité et
  ressources. Distinguer les parcours interactifs des traitements asynchrones ou batch.
* Éviter les traitements et transferts non bornés. Limiter les pages, recherches, exports, fichiers,
  résultats d'outils et opérations de masse selon le besoin.
* Charger et transmettre uniquement les données nécessaires. Préférer les filtres, tris et
  agrégations exécutés près du stockage aux traitements en mémoire de grands ensembles.
* Éviter les accès répétés dans une boucle ; regrouper ou précharger les opérations lorsque cela
  réduit réellement les allers-retours sans créer un résultat démesuré.
* Une optimisation est guidée par un goulot d'étranglement mesuré ou un risque crédible de dépassement
  des objectifs. Garder le code lisible et vérifier que l'optimisation améliore le cas visé.

## Stockage et accès aux données

* Examiner le plan d'accès et le volume lu/écrit pour les requêtes coûteuses. Ajouter un index selon
  les filtres, jointures, tris, contraintes et mesures observés ; vérifier son coût en écriture et en
  stockage.
* Éviter les requêtes répétées, les chargements implicites et les accès N+1. Charger les relations
  adaptées à l'opération plutôt que d'élargir globalement tous les chargements.
* Paginer les collections dont le volume peut croître. Fixer des bornes, éviter les offsets profonds
  si le stockage offre une pagination par curseur mieux adaptée, et exposer un contrat de page stable.
* Définir explicitement les tris permis et les filtres disponibles. Ne jamais interpoler librement
  un nom de colonne ou une expression fournie par un appelant.
* Éviter le tri, le filtrage et l'agrégation de grandes collections en mémoire quand le stockage peut
  effectuer ces opérations plus efficacement.

Les règles propres à un ORM, à un moteur de stockage ou à la pagination sont dans la convention
technologique correspondante, notamment `conventions/jpa.md` et `conventions/database.md`.

## Services et intégrations

* Définir des délais d'attente pour les appels externes, avec des limites compatibles avec le
  parcours utilisateur et le budget global de la requête.
* Ne pas lancer des requêtes réseau ou stockage en série dans une boucle si un appel groupé ou un
  traitement asynchrone est adapté.
* Utiliser retries, concurrence, parallélisme et cache seulement avec des limites, une politique
  d'invalidation et un comportement de dégradation définis. Les retries ne doivent pas amplifier une
  panne ; les commandes rejouées doivent être sûres ou idempotentes.
* Les caches ne remplacent pas la source de vérité. Définir la fraîcheur, l'invalidation et les
  frontières d'autorisation pour toute donnée mise en cache.

## Interfaces et API

* Les réponses ne contiennent que les champs nécessaires. Définir des limites sur les corps, les
  collections, les fichiers et les temps de calcul.
* Éviter les appels redondants et les double-soumissions. Les opérations longues peuvent être
  asynchrones si leur statut, leurs limites et leur reprise sont documentés.
* Charger les vues ou modules à la demande lorsque cela réduit réellement le coût initial sans nuire
  aux parcours principaux.

## Mesure et vérification

Combiner les outils adaptés : métriques pour les séries temporelles, traces pour la latence de bout
en bout, logs pour le contexte d'événement, profils et plans d'exécution pour localiser le coût. Les
métriques suivent `conventions/metrics.md` ; les traces et logs ne doivent pas exposer de données
confidentielles.

Avant une optimisation ou une mise en production significative :

* mesurer un scénario représentatif avec un jeu synthétique et des volumes réalistes ;
* contrôler latence de bout en bout et percentiles pertinents, débit, erreurs et consommation de
  ressources ;
* vérifier les cas de charge élevée, les limites et le comportement lorsque les dépendances
  ralentissent ou échouent ;
* comparer au point de référence et conserver le résultat utile à la décision.

Les tests de charge, profils et objectifs chiffrés sont définis par l'application en fonction de son
usage et de son risque.
