# Convention de tests

## Objectif et portée

Les tests font partie du comportement livré. Ils sont obligatoires pour toute l'application, chaque domaine,
chaque changement transverse et chaque correction de bug. Une modification n'est complète que lorsque ses tests
sont écrits ou mis à jour, passent localement et sont exécutés par les contrôles requis de la CI.

Cette convention définit la stratégie commune, quel que soit le langage ou le framework. Les commandes, outils,
fixtures et écarts constatés propres à ERP-RH sont décrits dans [`docs/testing.md`](../docs/testing.md). Les exigences
spécifiques aux outils MCP et au RAG sont précisées dans [`mcp.md`](mcp.md) et [`rag.md`](rag.md) ; les contrôles
d'accès, d'audit et de confidentialité sont définis dans [`security.md`](security.md) et [`audit.md`](audit.md).
Les interfaces AG-UI/A2UI et les événements de mascotte suivent aussi les contrats de
[`agent-ui.md`](agent-ui.md).

## Stratégie par couches

Utiliser la couche la plus rapide qui prouve réellement le comportement, puis vérifier les frontières où les
défauts sont probables. La suite contient beaucoup de tests unitaires, des tests d'intégration ciblés et des
parcours complets limités aux flux représentatifs. Aucun niveau ne remplace les autres.

| Niveau | Vérifie | Obligatoire lorsque… |
|---|---|---|
| Statique et architecture | Compilation, types, lint, règles de dépendance, conventions de modules | Tout changement concerné ; contrôles communs à chaque PR |
| Unitaire backend | Règles métier, calculs, validations, transitions d'état, erreurs, décisions d'autorisation | Toute logique backend ajoutée ou modifiée |
| Intégration backend | Service, repository, transaction, base, migrations, audit et sécurité réellement branchés | Toute frontière ou persistance touchée ; migrations sur base vierge et mise à niveau |
| Contrat API et événementiel | Requêtes/réponses OpenAPI, schémas MCP/BI, flux et événements d'agent (ex. AG-UI), codes d'erreur, pagination et compatibilité consommateur-producteur | Toute modification d'API, d'événement ou de contrat interservice |
| Unitaire frontend | Fonctions, stores, services, guards, interceptors, validateurs et transformations | Toute logique frontend ajoutée ou modifiée |
| Composant frontend | Rendu, actions, formulaires, clavier, focus, chargement, vide, erreur, refus et responsive | Tout composant, écran ou interaction touché |
| E2E navigateur | Parcours utilisateur pilotés par rôles et libellés accessibles, permissions visibles, navigation et états accessibles | Chaque flux critique et chaque fonctionnalité visible qui traverse plusieurs écrans |
| Full stack | Navigateur ou client réel → frontend → API réelle → base réelle et audit attendu | Chaque domaine métier et chaque flux transverse représentatif avant fusion |
| Non fonctionnel | Accessibilité, sécurité, charge, résilience, limites et observabilité | Selon risque ; sécurité et accessibilité sur les parcours qui les exposent |

Un test d'intégration peut utiliser des doubles pour les services externes hors périmètre, mais ne remplace pas
l'intégration réelle de la frontière examinée. Les tests de base utilisent le moteur et les extensions compatibles
avec la production ; lorsque pgvector est activé, ils utilisent une image/version compatible avec celle déployée.
Les tests full stack n'utilisent pas de faux backend ni de base simulée.

## Socle obligatoire pour chaque domaine

Chaque domaine applicatif maintient des tests exécutables couvrant les éléments qui lui sont applicables :

- règles métier, cas nominaux, limites, données invalides et erreurs métier ;
- opérations exposées et invariants de création, consultation, modification et suppression ou archivage ;
- validations à l'entrée, contraintes de persistance et comportement transactionnel ;
- permissions par action, refus explicite, accès anonyme et autorisé, et filtrage par périmètre métier ;
- contrat HTTP/API, pagination, tri, filtres et sérialisation lorsqu'ils existent ;
- composants et interactions de chaque écran livré, y compris états de chargement, liste vide, erreur et refus ;
- effets transverses attendus : audit, journalisation sans données sensibles, événements, exports/imports et appels
  aux façades d'autres domaines ;
- au moins un parcours full stack représentatif de bout en bout, avec les vrais composants du domaine et ses
  dépendances réelles de persistance.

Les tests restent dans le domaine propriétaire. Un test d'intégration inter-domaines vérifie les façades et
contrats publics ; il ne contourne pas les frontières en accédant directement aux repositories d'un autre domaine.
Les domaines techniques sans interface utilisateur testent leurs contrats d'entrée/sortie et leurs effets observables.

Un changement qui touche plusieurs domaines ajoute ou met à jour les tests de chacun et un test couvrant leur
interaction. Un changement transversal (authentification, permissions, audit, configuration, observabilité,
composants communs, schéma ou données) vérifie aussi les domaines consommateurs pertinents, et pas seulement le
module modifié.

## Traçabilité des règles et résultat compréhensible

Pour tout changement soumis à validation métier, établir une matrice d'acceptation qui relie chaque règle approuvée à :

- sa source et la personne métier qui peut la confirmer;
- le cas attendu, un exemple concret et le résultat visible pour l'utilisateur;
- les tests ou vérifications qui en apportent la preuve;
- le résultat observé, le lien vers le rapport et l'état de validation.

Une règle du périmètre validé ne peut pas être déclarée respectée parce qu'un autre test voisin passe. Chaque règle doit disposer d'une preuve adaptée à son risque; les liens, permissions et échanges entre domaines ont des contrôles propres. Si la preuve manque, le statut reste « à vérifier » et le bloc ne reçoit pas d'accord final.

Les échecs doivent aider à agir. Le résultat destiné au métier décrit l'action ou le cas vérifié, ce qui était attendu, ce qui s'est produit et l'étape à suivre. Les détails techniques peuvent figurer dans le rapport destiné à l'équipe de réalisation, mais ne remplacent pas l'explication métier. Pour un refus de saisie, vérifier également que le message indique le champ ou la règle à corriger, sans dévoiler de données auxquelles l'utilisateur n'a pas droit.

Une exception ne se traduit jamais par l'affaiblissement silencieux d'un test. Elle possède un enregistrement distinct indiquant la règle concernée, le motif, le périmètre, le risque, la mesure compensatoire, le responsable, l'approbateur autorisé et une date d'expiration ou de réexamen. La règle initiale reste testée dans les cas non dérogés; un test séparé décrit l'exception autorisée et ses limites. Tant que l'approbation explicite manque, l'exception est refusée et la règle originale demeure applicable. Les exigences critiques de sécurité, confidentialité et intégrité des données ne sont pas dérogeables.

Pour un PV, dossier de validation ou document destiné à des intervenants, les règles de cette matrice sont lisibles dans le document : les faits établis, les décisions du propriétaire, les accords métier attendus, les réserves, rejets, exceptions et preuves ont des statuts séparés. Le document ne déclare jamais un consensus tant que les avis requis ne sont pas recueillis.

## Attentes par type de changement

| Changement | Tests à ajouter ou mettre à jour |
|---|---|
| Règle métier ou bug | Tests unitaires nominaux, limites et erreur ; test de non-régression reproduisant le bug |
| Repository, requête ou transaction | Test d'intégration sur la vraie base, y compris contraintes, ordre, pagination ou rollback concernés |
| Migration de schéma ou données | Migration de base vierge, montée depuis la version supportée, données représentatives et compatibilité des entités |
| Endpoint ou permission | Contrat HTTP, authentification, absence de permission, permission requise et portée métier ; tests frontend correspondants |
| Écran ou formulaire | Specs du composant et de ses actions ; validation, erreurs serveur, accessibilité clavier et permission ; E2E si le flux traverse des étapes |
| Import/export ou synchronisation | Import : fichier valide, invalide, partiel, doublon, limites, atomicité, audit et résultat observable; vérifier la parité des champs et contraintes formulaire/import. Export : vérifier la parité avec les données présentées dans chaque composant, le respect des filtres, du périmètre et des permissions, ainsi que l'absence de champs non consultables |
| Audit ou journal | Présence et cohérence, intégrité transactionnelle/rollback, privilèges minimaux du compte applicatif, absence de secrets et contrôle d'accès à la consultation |
| Appel externe/adaptateur | Contrat, délais, erreurs, reprise/idempotence et données reçues/sorties ; aucun réseau réel dans la suite rapide |
| IA, RAG, MCP ou BI | Jeu de régression versionné ; permissions, provenance/citations, filtres, bornes, refus sûr, absence de fuite, exactitude, tokens de contexte, latence et coût. Si un juge LLM est utilisé : grille versionnée, calibration humaine et mesure des désaccords |
| Dépendance ou configuration | Démarrage et parcours qui utilisent le composant, compatibilité de version et configuration absente/invalide |

## Portes de qualité et CI

Les portes suivantes sont obligatoires :

1. **Chaque PR** exécute les contrôles statiques, compilation, tests unitaires backend et frontend, intégrations
   concernées, tests de contrat concernés, build de production et E2E concernés. Les contrôles de sécurité et de
   dépendances définis par le dépôt restent requis.
2. **Avant fusion**, les tests full stack couvrent au moins un parcours représentatif par domaine modifié et les
   interactions transverses modifiées. Les parcours critiques de l'application sont exécutés sur une cadence CI
   obligatoire avant toute fusion qui peut les affecter.
3. **Avant livraison**, exécuter la suite complète de régression, les parcours critiques de tous les domaines et
   les contrôles non fonctionnels associés au risque de la version. Les migrations et procédures de restauration
   sont vérifiées pour toute évolution de persistance.
4. Une porte rouge bloque la fusion ou la livraison. Les publications d'artefacts destinés à la livraison
   dépendent de toutes les portes obligatoires ; aucune image ne doit être publiée avant leur réussite. Une
   relance peut aider au diagnostic, mais ne transforme pas un échec intermittent en succès acceptable.

Les seuils de couverture sont mesurés par domaine et par type de code. Ils ne doivent pas baisser sur le code
modifié ; le rapport de couverture doit rester visible en CI. La couverture de lignes ne prouve pas la qualité :
les tests doivent exercer les branches métier, erreurs, permissions et invariants significatifs. Ne pas viser
100 % en testant du code généré, des accesseurs triviaux ou le fonctionnement interne d'un framework.

Un test sauté, désactivé ou exclu doit avoir une raison précise, un responsable, une date d'expiration et une
référence de suivi. La dérogation est temporaire et ne peut couvrir une exigence de sécurité, d'intégrité des
données ou une règle métier critique. Ne jamais masquer un échec par une assertion affaiblie, une reprise
automatique illimitée ou un mock qui retire la frontière testée.

## Fiabilité et données de test

- Chaque test est déterministe, isolé et répétable ; il ne dépend ni de l'ordre d'exécution, ni d'une base partagée
  préexistante, ni de données de production.
- Utiliser des fixtures synthétiques minimales et explicites. Les données personnelles ou financières réelles sont
  interdites, y compris dans les snapshots, jeux d'évaluation et artefacts CI.
- Nettoyer ou isoler les données par transaction, schéma ou identifiant unique ; ne jamais compter sur un état
  résiduel pour qu'un test réussisse.
- Tester les effets observables plutôt que l'implémentation. Doubler uniquement les frontières externes et les
  dépendances non déterministes ; ne pas mocker la règle métier que le test prétend vérifier.
- Éviter temporisations arbitraires, tests dépendants du réseau et sélecteurs fragiles. Préférer conditions
  observables, noms accessibles et contrats stables.
- Conserver les rapports de résultats et de couverture en CI avec une durée adaptée ; ne jamais y publier de
  secrets ou de données réelles.

## MCP, IA et BI

Pour une intégration MCP, les tests de contrat et d'intégration vérifient le schéma valide et invalide,
l'identité appelante, les permissions effectives, les limites et la pagination des résultats,
l'idempotence, les délais et reprises, ainsi que les tentatives d'injection. Un échec de validation,
d'identité ou d'autorisation reste un refus ; il ne retombe jamais sur un accès permissif. La suite
rapide peut simuler les outils externes, mais exerce le vrai contrat et les règles de sécurité.

Pour un agent ou un modèle, séparer les assertions déterministes (permissions, format, provenance,
refus, absence de fuite) de l'évaluation probabiliste de la qualité. Versionner les prompts, modèles,
outils et jeux de régression anonymisés. Suivre la réussite des tâches, l'ancrage des réponses dans
les sources, les refus sûrs, les fuites, le volume de contexte par source, la latence et le coût ;
toute modification de prompt, modèle, outil ou index met à jour le jeu et relance les évaluations
pertinentes. Une réduction du volume de contexte n'est acceptée que si elle ne dégrade pas la qualité,
la provenance, la sécurité ou la réussite des tâches.

Une évaluation « LLM as a judge » est réservée aux critères sémantiques qui ne se réduisent pas à une
assertion déterministe. Définir une grille avec des critères observables, fournir au juge uniquement
les éléments nécessaires, et versionner son modèle, son prompt, la grille et le jeu de cas. Calibrer
les résultats sur un échantillon évalué par des personnes, suivre les désaccords et contrôler la
stabilité du juge. Une note du juge seule ne peut ni valider les permissions, la sécurité ou la
conformité, ni prouver l'exactitude d'une valeur métier ; ces attentes gardent des contrôles
déterministes. Les cas du jeu d'évaluation utilisent des données synthétiques ou anonymisées.

Pour un agent avec découverte d'outils à la demande, mesurer si l'outil attendu est retrouvé et bien
choisi, et si les outils non pertinents sont évités. Garder des tests distincts qui prouvent que
l'autorisation serveur bloque les appels interdits, quel que soit le résultat de recherche ou le
choix du modèle.

Pour un système multi-agents, tester de façon déterministe : le choix de l'agent délégué sur des cas
représentatifs, les plafonds (profondeur, appels, budget) et l'état rendu quand ils sont atteints,
l'absence d'élévation de droits lors d'une délégation, et la remontée des confirmations à l'utilisateur.
Pour la mémoire : isolation entre utilisateurs, conservation des consignes, permissions, confirmations
et provenances après compactage, et suppression effective. Pour la passerelle de modèles : bascule vers
le repli quand un fournisseur échoue, routage des données selon leur classe, et absence de réponse servie
depuis le cache à un autre utilisateur. Pour un GraphRAG : un saut dans le graphe n'atteint jamais un
passage non autorisé, et chaque relation restituée garde sa source.

Pour la BI, valider chaque indicateur de référence contre des données synthétiques attendues : formule,
unité, période, fuseau horaire, arrondis, filtres, permissions et absence de doublon. Les métriques
opérationnelles ne remplacent pas ces tests de définition métier.

## Fin de tâche

Avant de déclarer une tâche terminée : lancer la suite liée au changement, vérifier les portes obligatoires de la
CI, examiner les échecs et la couverture des cas annoncés, puis mettre à jour la documentation du domaine et
`docs/testing.md` si les commandes, outils, périmètres ou limites de tests ont changé. Une fonctionnalité sans
tests requis ou un domaine sans parcours complet documenté reste un travail incomplet.
