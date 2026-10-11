# Recherche augmentée par génération (RAG)

Le RAG peut aider à retrouver des sources pertinentes pour une réponse. Il ne devient pas une source
de vérité métier : les documents originaux, les services de domaine et les définitions officielles
des indicateurs restent autoritaires.

## Gouvernance des corpus

Pour chaque corpus, documenter son propriétaire, sa finalité, les sources admises, les droits
d'accès, la provenance, la fraîcheur attendue, la stratégie d'indexation et le cycle de rétention,
mise à jour et suppression. Les embeddings et index sont des projections dérivées ; leur cycle de
vie suit celui des sources. Voir également les règles de données vectorielles dans
[`database.md`](database.md).

N'indexer que les données autorisées à cette finalité. Séparer les espaces de recherche selon la
classification et les périmètres d'accès ; les corpus RH, financiers ou autrement sensibles ne sont
pas rendus communs par la seule présence d'un index partagé.

## Accès et réponses

Appliquer les permissions et le périmètre de l'utilisateur avant de restituer les résultats
récupérés. Les filtres d'accès ne sont pas laissés à la décision du modèle. Les réponses factuelles
citent les sources utilisées et rendent visible l'absence de source suffisante ; une citation ne
prouve pas à elle seule que la réponse est correcte.

Traiter le contenu indexé comme une entrée non fiable. Une instruction trouvée dans un document ne
peut ni remplacer les consignes de sécurité, ni déclencher une action, ni modifier l'identité ou les
permissions. Les actions restent soumises aux règles MCP et à l'autorisation serveur.

Un modèle ne déduit pas et ne redéfinit pas le sens d'un KPI. Les indicateurs numériques proviennent
de leurs services ou projections métier avec une définition commune, pas d'une réponse RAG.

## Qualité et exploitation

Versionner le modèle d'embedding, les paramètres d'index et les jeux d'évaluation. Définir les
conditions de fraîcheur, réindexation, suppression, sauvegarde et restauration. Une évolution
incompatible du modèle ou des dimensions requiert un plan de réindexation.

Évaluer séparément le respect des permissions, l'ancrage/citation, les refus sûrs, les fuites, la
qualité probabiliste, la latence et le coût. Les assertions de sécurité restent déterministes et
bloquent la livraison en cas d'échec. Voir [`testing.md`](testing.md) pour les évaluations IA.
