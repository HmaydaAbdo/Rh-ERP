# Métriques

Cette convention définit les principes de mesure opérationnelle. Chaque application documente sa
bibliothèque de télémétrie, son exposition, son stockage, ses tableaux de bord et ses alertes.

## Choix des mesures

Une métrique doit répondre à une question d'exploitation ou de fiabilité : disponibilité,
fréquence, durée, saturation, erreurs ou volume d'un traitement. Avant d'en ajouter une, vérifier
qu'une mesure existante ne répond pas déjà au besoin. Éviter les métriques redondantes ou jamais
consultées.

Les métriques métier opérationnelles peuvent indiquer le volume d'un traitement ou la répartition
d'états utiles au suivi. Elles ne remplacent pas la définition de référence d'un indicateur BI ni
les événements d'audit.

## Types de mesures

* Un **compteur** mesure le nombre cumulé d'événements et ne décroît pas pendant la durée de vie de
  la série. Mesurer les succès et les échecs avec des dimensions explicites si cela aide à agir.
* Une **jauge** mesure une valeur instantanée, telle qu'une profondeur de file ou un nombre courant
  d'éléments. Sa valeur peut monter ou descendre ; ne pas l'utiliser comme un compteur cumulatif.
* Une **distribution** (histogramme ou mécanisme équivalent) mesure la durée, la taille ou une autre
  valeur observée, pour en analyser les quantiles et les seuils. Préciser l'unité et choisir les
  bornes selon les usages de supervision.

Enregistrer la mesure au point où son résultat est connu et éviter les doubles incréments ou les
durées qui incluent un travail sans rapport avec l'opération mesurée.

## Nommage et dimensions

Les noms sont stables, explicites, cohérents avec la plateforme choisie et indiquent l'unité lorsque
la convention de cette plateforme le prévoit. Documenter pour chaque mesure sa signification, son
type, son unité, ses dimensions et le signal attendu.

Les dimensions (labels/tags) ont un ensemble de valeurs borné. Ne jamais utiliser comme dimension
un identifiant d'enregistrement, un identifiant utilisateur, une adresse e-mail, un jeton, une
requête brute, un horodatage ou une valeur libre : leur forte cardinalité augmente les coûts et peut
exposer des données sensibles.

Choisir des dimensions utiles à une décision opérationnelle, par exemple le service, le résultat,
une catégorie stable ou l'environnement. Ne pas dupliquer dans les dimensions une information déjà
portée par les ressources de télémétrie.

## Collecte et alertes

* Exposer ou transmettre les métriques par un mécanisme contrôlé et documenté. Protéger les points
  de collecte contre l'accès public lorsqu'ils révèlent des informations opérationnelles.
* Définir les tableaux de bord et alertes à partir d'un symptôme exploitable, avec un seuil,
  une durée, un responsable et une action attendue. Éviter les alertes sans procédure de réponse.
* Limiter le coût et le volume des mesures. Vérifier régulièrement leur cardinalité, leur fraîcheur,
  leurs erreurs de collecte et leur utilité.
* Ne pas y placer de données personnelles, de contenu de requête ou de secrets. Pour un événement
  ponctuel nécessitant du contexte, utiliser les logs ; pour prouver une action métier, utiliser
  l'audit.

## Vérification

Lors de l'ajout d'une mesure, vérifier son unité, son type, ses dimensions, son comportement en cas
d'échec et sa visibilité dans l'environnement cible. S'assurer qu'une charge ou une forte diversité
de valeurs ne fait pas croître sans borne le nombre de séries.
