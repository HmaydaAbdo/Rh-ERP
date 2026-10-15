# Dossier d’évolution du rapport BI Paie

Ce dossier rassemble les décisions passées et les éléments à examiner pour préparer la prochaine version du rapport PDF. Il sert de point d’entrée pour reprendre le travail et décider ce qui doit apparaître dans la nouvelle version.

## État actuel à prendre comme référence

La documentation fonctionnelle et technique du rapport en production reste dans [`docs/report/README.md`](../docs/report/README.md). Ce dossier conserve les décisions d’évolution et les demandes à instruire ; il ne remplace pas cette documentation.

L’[inventaire des emplacements](inventaire.md) indique où se trouvent la génération PDF, l’assistant d’export, les styles, les règles d’accès et les contrôles.

Le rapport actuel est généré par un pipeline HTML/CSS puis converti en PDF. Il présente une synthèse globale, les marchés sélectionnés, les équipes demandées et le détail des employés. Les changements fonctionnels récemment demandés sont :

- retirer l’indicateur « masse moyenne par employé » à tous les niveaux ;
- afficher le STC séparément en DH et en nombre de personnes dans les KPI, tableaux et graphiques concernés ;
- permettre de sélectionner plusieurs marchés dans l’assistant d’export PDF ;
- rendre effectivement visibles les graphiques dans le PDF produit.

Les trois premiers points sont déjà présents dans le code fusionné sur `main` (PR #45). La correction de rendu SVG des graphiques est en cours de validation CI dans la PR #46 ; l’état final doit être vérifié avant de considérer ce point livré.

## Décisions et pistes antérieures

- [`rapport-v2.md`](rapport-v2.md) décrit les retraits antérieurs, leurs raisons et les conditions éventuelles de réintroduction.
- La répartition par fonction reste une piste après nettoyage du référentiel Fonction, suivi dans [`TODO.md`](../TODO.md).
- L’évolution mensuelle masse/effectif avait été retirée faute d’historique suffisant. Sa réintroduction demande de vérifier que les périodes réellement disponibles rendent la tendance lisible.
- Le sommaire imprimé et le tableau redondant de répartition par équipe avaient été retirés pour limiter les pages ou éviter une répétition d’information.

Ces pistes ne sont pas des exigences validées de la prochaine version. Elles doivent être comparées au besoin de lecture actuel et aux données disponibles avant d’être ajoutées.

## Préparer la nouvelle version

Pour chaque ajout proposé, consigner ici ou dans une décision liée :

1. la question métier à laquelle le rapport doit répondre ;
2. le niveau concerné (global, marché, équipe ou employé) ;
3. la mesure, son unité et sa règle de calcul ;
4. les données disponibles pour la période choisie ;
5. la représentation attendue (KPI, tableau, graphique ou texte) ;
6. le résultat visuel à confirmer sur un PDF généré.

Le rendu PDF de la nouvelle version doit être présenté pour validation visuelle. Les fichiers d’historique ou d’évolution ne seront supprimés qu’après confirmation explicite de ce rendu.
