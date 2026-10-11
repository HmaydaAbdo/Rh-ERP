# Convention de tests

## Objectif et portée

Les tests font partie du comportement livré. Ils sont obligatoires pour toute l'application, chaque domaine,
chaque changement transverse et chaque correction de bug. Une modification n'est complète que lorsque ses tests
sont écrits ou mis à jour, passent localement et sont exécutés par les contrôles requis de la CI.

Cette convention définit la stratégie commune, quel que soit le langage ou le framework. Les commandes, outils,
fixtures et écarts constatés propres à ERP-RH sont décrits dans [`docs/testing.md`](../docs/testing.md).
Le standard Staport épinglé dans `conventions/staport/` fixe les exigences complémentaires de sécurité, audit,
IA, BI et confidentialité.

## Stratégie par couches

Utiliser la couche la plus rapide qui prouve réellement le comportement, puis vérifier les frontières où les
défauts sont probables. La suite contient beaucoup de tests unitaires, des tests d'intégration ciblés et des
parcours complets limités aux flux représentatifs. Aucun niveau ne remplace les autres.

| Niveau | Vérifie | Obligatoire lorsque… |
|---|---|---|
| Statique et architecture | Compilation, types, lint, règles de dépendance, conventions de modules | Tout changement concerné ; contrôles communs à chaque PR |
| Unitaire backend | Règles métier, calculs, validations, transitions d'état, erreurs, décisions d'autorisation | Toute logique backend ajoutée ou modifiée |
| Intégration backend | Service, repository, transaction, base, migrations, audit et sécurité réellement branchés | Toute frontière ou persistance touchée ; migrations sur base vierge et mise à niveau |
| Contrat API | Requêtes/réponses, codes d'erreur, pagination, schémas et compatibilité consommateur-producteur | Toute modification d'API ou de contrat interservice |
| Unitaire frontend | Fonctions, stores, services, guards, interceptors, validateurs et transformations | Toute logique frontend ajoutée ou modifiée |
| Composant frontend | Rendu, actions, formulaires, clavier, focus, chargement, vide, erreur, refus et responsive | Tout composant, écran ou interaction touché |
| E2E navigateur | Parcours utilisateur, permissions visibles, navigation et états accessibles | Chaque flux critique et chaque fonctionnalité visible qui traverse plusieurs écrans |
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

## Attentes par type de changement

| Changement | Tests à ajouter ou mettre à jour |
|---|---|
| Règle métier ou bug | Tests unitaires nominaux, limites et erreur ; test de non-régression reproduisant le bug |
| Repository, requête ou transaction | Test d'intégration sur la vraie base, y compris contraintes, ordre, pagination ou rollback concernés |
| Migration de schéma ou données | Migration de base vierge, montée depuis la version supportée, données représentatives et compatibilité des entités |
| Endpoint ou permission | Contrat HTTP, authentification, absence de permission, permission requise et portée métier ; tests frontend correspondants |
| Écran ou formulaire | Specs du composant et de ses actions ; validation, erreurs serveur, accessibilité clavier et permission ; E2E si le flux traverse des étapes |
| Import/export ou synchronisation | Fichier valide, invalide, partiel, doublon, limites, atomicité, audit et résultat observable |
| Audit ou journal | Présence et cohérence, transaction/rollback, absence de secrets et contrôle d'accès à la consultation |
| Appel externe/adaptateur | Contrat, délais, erreurs, reprise/idempotence et données reçues/sorties ; aucun réseau réel dans la suite rapide |
| IA, RAG, MCP ou BI | Jeu de régression versionné ; permissions, provenance/citations, filtres, bornes, refus sûr, absence de fuite, exactitude, latence et coût |
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
4. Une porte rouge bloque la fusion ou la livraison. Une relance peut aider au diagnostic, mais ne transforme pas
   un échec intermittent en succès acceptable.

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
les sources, les refus sûrs, les fuites, la latence et le coût ; toute modification de prompt, modèle,
outil ou index met à jour le jeu et relance les évaluations pertinentes.

Pour la BI, valider chaque indicateur de référence contre des données synthétiques attendues : formule,
unité, période, fuseau horaire, arrondis, filtres, permissions et absence de doublon. Les métriques
opérationnelles ne remplacent pas ces tests de définition métier.

## Fin de tâche

Avant de déclarer une tâche terminée : lancer la suite liée au changement, vérifier les portes obligatoires de la
CI, examiner les échecs et la couverture des cas annoncés, puis mettre à jour la documentation du domaine et
`docs/testing.md` si les commandes, outils, périmètres ou limites de tests ont changé. Une fonctionnalité sans
tests requis ou un domaine sans parcours complet documenté reste un travail incomplet.
