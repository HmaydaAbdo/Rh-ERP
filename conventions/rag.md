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

## Stockage : vecteurs d'abord, graphe si nécessaire

Le choix du stockage suit l'évaluation, par étapes :

1. **Recherche vectorielle** dans la base existante (pgvector, voir [`database.md`](database.md)),
   éventuellement combinée à la recherche plein texte (recherche hybride) et à un reclassement. C'est
   le point de départ de tout corpus.
2. **GraphRAG** (vecteurs et graphe d'entités et de relations, par exemple dans Neo4j) seulement si
   l'évaluation montre que les questions attendues exigent de relier des informations dispersées
   (questions à plusieurs sauts, vue d'ensemble d'un corpus) et que la recherche vectorielle n'atteint
   pas les seuils. L'introduction d'une base graphe suit un ADR.

Les données transactionnelles d'un domaine (employés, chantiers, paie…) ne sont jamais recopiées dans un
index ou un graphe pour être interrogées par un modèle : elles restent lues par les outils de leur
domaine, au moment de la question, avec les permissions de l'utilisateur. Le RAG porte sur des corpus
documentaires (textes réglementaires, procédures, documentation, connaissances validées).

## GraphRAG

Un graphe de connaissances combine des passages vectorisés et les entités qu'ils mentionnent. Schéma de
référence (Neo4j, noms à adapter au corpus) :

```
(:Source {id, titre, proprietaire, classification, version, indexeLe})
  -[:CONTIENT]-> (:Document {id, titre, langue})
  -[:A_POUR_PASSAGE]-> (:Passage {id, texte, position, embedding, modeleEmbedding})
(:Passage)-[:SUIVANT]->(:Passage)                     ordre de lecture
(:Passage)-[:MENTIONNE]->(:Entite {id, type, nom, nomNormalise})
(:Entite)-[:RELATION {type, sourcePassageId, confiance}]->(:Entite)
(:Entite)-[:MEME_QUE]->(:Entite)                      fusion d'entités, réversible
(:Communaute {id, niveau, resume})<-[:APPARTIENT_A]-(:Entite)   résumés de groupes, facultatif
```

* **Index.** Un index vectoriel sur `Passage.embedding` (dimension et distance de l'ADR), un index plein
  texte sur `Passage.texte` et des contraintes d'unicité sur les identifiants.
* **Recherche.** Trouver les passages par similarité (et plein texte), puis étendre par le graphe : leurs
  entités, les relations utiles à un ou deux sauts et les passages voisins. Le nombre de sauts, de nœuds
  et la taille du contexte restitué sont bornés.
* **Extraction.** Les entités et relations sont extraites par un modèle selon un schéma fermé de types
  (liste versionnée), jamais libre. Chaque relation garde le passage qui la justifie ; une relation sans
  passage source est rejetée.
* **Droits.** La classification et le périmètre d'accès sont portés par la source et appliqués dans la
  requête de recherche, avant de restituer quoi que ce soit au modèle. Un saut dans le graphe ne doit
  jamais atteindre un passage que l'utilisateur ne pourrait pas lire directement.
* **Cycle de vie.** Le graphe est une projection dérivée et reconstructible depuis les sources : la
  suppression ou la mise à jour d'une source supprime ou remplace ses passages, ses relations et les
  entités devenues orphelines.

La mémoire longue des agents (voir [`agents-ia.md`](agents-ia.md)) peut utiliser le même graphe pour des
connaissances validées et partagées, sous les mêmes règles de provenance et de droits ; les préférences
d'un utilisateur restent isolées par utilisateur.

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
