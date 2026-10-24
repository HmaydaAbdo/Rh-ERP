# Recherche augmentée par génération (RAG)

Le RAG peut aider à retrouver des sources pertinentes pour une réponse. Il ne devient pas une source
de vérité métier : les documents originaux, les services de domaine et les définitions officielles
des indicateurs restent autoritaires.

Le cadrage ERP-RH est dans [`docs/ia.md`](../docs/ia.md). Un corpus réglementaire (barèmes,
taux, textes) porte la date d'effet de chaque version ; une réponse cite la version applicable à
la période demandée.
Le premier corpus, ses propriétaires et ses droits sont à valider avant ingestion. La présence de
pgvector dans une image PostgreSQL ne prouve ni l'existence d'un pipeline RAG ni sa qualité.

## Gouvernance des corpus

Pour chaque corpus, documenter son propriétaire, sa finalité, les sources admises, les droits
d'accès, la provenance, la fraîcheur attendue, la stratégie d'indexation et le cycle de rétention,
mise à jour et suppression. Les embeddings et index sont des projections dérivées ; leur cycle de
vie suit celui des sources. Voir également les règles de données vectorielles dans
[`database.md`](database.md).

N'indexer que les données autorisées à cette finalité. Séparer les espaces de recherche selon la
classification et les périmètres d'accès ; les corpus RH, financiers ou autrement sensibles ne sont
pas rendus communs par la seule présence d'un index partagé.

## Recherche : référence simple, puis enrichissement mesuré

Le choix du stockage suit l'évaluation, par étapes :

1. **Référence lexicale** sur un corpus documentaire approuvé et un jeu de questions représentatif :
   recherche plein texte, métadonnées et filtres d'accès déterministes. Mesurer ses réussites et ses
   lacunes avant d'ajouter un modèle ou un stockage.
2. **Recherche vectorielle et hybride** si les formulations ou langues attendues justifient une
   recherche sémantique. pgvector est une option dans un stockage documentaire contrôlé (voir
   [`database.md`](database.md)), sans donner au runtime IA accès aux tables transactionnelles.
   Comparer lexical seul, vecteur seul et combinaison hybride avec la même politique d'accès.
   Un reclassement est ajouté seulement si son gain mesuré justifie son coût et sa latence ; le
   fournisseur utilisé doit être autorisé pour la classification du contenu envoyé.
3. **GraphRAG** (vecteurs et graphe d'entités et de relations, par exemple dans Neo4j) seulement si
   l'évaluation montre que les questions attendues exigent de relier des informations dispersées
   (questions à plusieurs sauts, vue d'ensemble d'un corpus) et que les solutions plus simples
   n'atteignent pas les critères validés. L'introduction d'une base graphe suit un ADR ; elle ne
   fait pas partie du MVP ERP-RH.

Les données transactionnelles d'un domaine (employés, chantiers, paie…) ne sont jamais recopiées dans un
index ou un graphe pour être interrogées par un modèle : elles restent lues par les outils de leur
domaine, au moment de la question, avec les permissions de l'utilisateur. Le RAG porte sur des corpus
documentaires (textes réglementaires, procédures, documentation, connaissances validées).

Ne pas utiliser une mémoire sémantique comme copie des salariés, bulletins ou montants de paie.
Pour une question mêlant règle documentaire et donnée actuelle, séparer les passages RAG des
résultats MCP et identifier leur provenance respective. Un chiffre métier est calculé ou lu par
son service autorisé, avec sa période et sa définition ; il n'est pas reconstruit par similarité.

## Ingestion et contrat d'une source

Une source porte au minimum un identifiant stable, son propriétaire, sa provenance, sa version ou
empreinte, sa classification, son périmètre d'accès, sa langue, son état de publication et ses dates
utiles. Un passage garde l'identifiant et la version de source, ses repères de citation (page,
section ou position) et les versions du découpage et de l'embedding. Les règles de validité ou de
date d'effet sont définies par le propriétaire du corpus ; ne pas inventer une règle de préséance
entre textes contradictoires.

L'ingestion valide le format et les limites des fichiers, isole l'extraction, puis découpe et
indexe selon une configuration versionnée. OCR et traitement des tableaux sont des options à
évaluer sur les documents réellement admis ; les sorties d'extraction sont contrôlées avant
publication. Une réingestion est idempotente sur l'identifiant et la version de source. Les
échecs ou documents illisibles restent visibles à l'opérateur autorisé ; ils ne deviennent pas des
sources réputées complètes.

Séparer ingestion et recherche. Une source n'entre dans les résultats qu'après validation de sa
publication et de ses droits. Une nouvelle version remplace ou invalide l'ancienne de façon
explicite ; un lot partiellement indexé ne doit pas être présenté comme une version complète.
Le nom et l'URL de la source sont eux-mêmes soumis aux permissions : une citation ne révèle pas
l'existence d'un document interdit.

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

Appliquer les permissions et le périmètre actuels de l'utilisateur dans la récupération, avant
le reclassement éventuel et avant tout envoi au modèle. Réappliquer les contrôles lors de l'ouverture
d'une citation ; une URL ou un identifiant opaque ne constitue pas un droit. Les filtres d'accès ne
sont pas laissés à la décision du modèle et s'appliquent aux passages voisins, résumés et expansions.

Les réponses factuelles citent les sources utilisées et rendent visible l'absence de source
suffisante ; une citation ne prouve pas à elle seule que la réponse est correcte. Le serveur valide
que chaque citation désigne une source effectivement récupérée et autorisée, avec le repère et la
version attendus. L'évaluation vérifie aussi que le passage soutient réellement l'affirmation,
signale les contradictions et préfère l'abstention à une référence inventée.

Traiter le contenu indexé comme une entrée non fiable. Une instruction trouvée dans un document ne
peut ni remplacer les consignes de sécurité, ni déclencher une action, ni modifier l'identité ou les
permissions. Les actions restent soumises aux règles MCP et à l'autorisation serveur.

Un modèle ne déduit pas et ne redéfinit pas le sens d'un KPI. Les indicateurs numériques proviennent
de leurs services ou projections métier avec une définition commune, pas d'une réponse RAG.

## Qualité et exploitation

Versionner le modèle d'embedding, les paramètres d'index et les jeux d'évaluation. Définir les
conditions de fraîcheur, réindexation, suppression, sauvegarde et restauration. Une évolution
incompatible du modèle ou des dimensions requiert un plan de réindexation.

La suppression, le retrait de publication et la révocation de droits doivent rendre une source
inaccessible aux nouvelles recherches sans attendre une purge lente de tous les vecteurs. Maintenir
un contrôle de validité faisant autorité et propager le retrait aux passages, résumés, index, caches,
mémoire et checkpoints réutilisables. Une reprise de conversation ne peut pas réinjecter un contenu
devenu interdit. Le délai d'invalidation, les règles de purge et les contrôles avant restitution
sont définis et testés ; une conservation légale isolée ne permet pas de réutiliser le contenu dans
une réponse. Les sauvegardes et restaurations réappliquent les retraits et restrictions en vigueur.

Évaluer séparément le respect des permissions, l'ancrage/citation, les refus sûrs, les fuites, la
qualité probabiliste, la latence et le coût. Les assertions de sécurité restent déterministes et
bloquent la livraison en cas d'échec. Voir [`testing.md`](testing.md) pour les évaluations IA.

Le jeu de régression couvre les sources absentes, anciennes, contradictoires, révoquées ou retirées,
les citations fabriquées ou non probantes et les injections. Tester un retrait après récupération
et avant génération, une révocation pendant une interruption et une reprise depuis un ancien
checkpoint. Comparer les variantes de recherche sur les mêmes questions et droits, avec rappel,
pertinence des passages et qualité des citations, puis mesurer latence et coût de bout en bout.
Les cibles et le corpus de référence sont validés avant de devenir des portes de livraison.
