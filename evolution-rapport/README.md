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

Les trois premiers points sont présents dans le code fusionné sur `main` (PR #45). La correction du rendu SVG a été fusionnée dans `main` par la PR #46. La CI de la branche principale (run #282, commit `08c80b9`) avait validé le graphique global et publié les images Docker. La PR #47 a ajouté le même contrôle de pixels pour le graphique de répartition par équipe sur la page chantier ; ses quatre checks CI ont réussi et elle est fusionnée dans `main` (commit `0992efa`). La revue visuelle du PDF généré avec l’image déployée reste à confirmer par l’utilisateur.

## Décisions et pistes antérieures

- [`rapport-v2.md`](rapport-v2.md) décrit les retraits antérieurs, leurs raisons et les conditions éventuelles de réintroduction.
- La répartition par fonction reste une piste après nettoyage du référentiel Fonction, suivi dans [`TODO.md`](../TODO.md).
- L’évolution mensuelle masse/effectif avait été retirée faute d’historique suffisant. Sa réintroduction demande de vérifier que les périodes réellement disponibles rendent la tendance lisible.
- Le sommaire imprimé et le tableau redondant de répartition par équipe avaient été retirés pour limiter les pages ou éviter une répétition d’information.

Ces pistes ne sont pas des exigences validées de la prochaine version. Elles doivent être comparées au besoin de lecture actuel et aux données disponibles avant d’être ajoutées.

## Niveau 1 — Vue d’ensemble : proposition à valider

### Existant vérifié

- Six KPI : masse salariale du mois, masse du mois précédent, effectif, nombre de marchés, STC en personnes et STC en DH.
- Un graphique horizontal par marché avec quatre séries (masse, effectif, STC personnes, STC DH), trié par masse décroissante ; les valeurs réelles sont affichées dans des colonnes dédiées.
- Les marchés choisis filtrent déjà les calculs. `PaieBiReportBuilder` construit aussi `RapportBiVue.filtresActifs`, mais cette information n’est pas actuellement consommée par le rendu HTML/PDF.
- La longueur des barres est actuellement calculée par rapport au maximum de chaque série (`valeur / maxParSerie`), pas à la part du total. Le graphique n’exprime donc pas une contribution en pourcentage.
- La masse du mois précédent est affichée sans écart absolu ni pourcentage ; cette variation avait été retirée dans une décision antérieure.

### Proposition

1. Garder les six KPI existants et ajouter une indication de périmètre sur la page globale : « Tous les marchés » ou « N marchés sélectionnés ». Les chapitres suivants donnent déjà le détail des marchés inclus.
2. Garder les quatre séries et les valeurs réelles, mais faire représenter aux barres la part de chaque marché dans le total de sa série, avec une échelle graduée de 0 à 100 %. Cela donnerait au lecteur une mesure explicite de contribution.
3. Traiter séparément la variation de masse entre le mois courant et le précédent : elle est calculable avec les valeurs existantes, mais nécessite une décision explicite avant réintroduction.

**État :** proposition présentée à l’utilisateur ; aucun choix n’est encore validé et aucun changement de contenu global n’est implémenté. À confirmer avant de modifier le modèle de page ou le graphique.

## Préparer la nouvelle version

Pour chaque ajout proposé, consigner ici ou dans une décision liée :

1. la question métier à laquelle le rapport doit répondre ;
2. le niveau concerné (global, marché, équipe ou employé) ;
3. la mesure, son unité et sa règle de calcul ;
4. les données disponibles pour la période choisie ;
5. la représentation attendue (KPI, tableau, graphique ou texte) ;
6. le résultat visuel à confirmer sur un PDF généré.

Le rendu PDF de la nouvelle version doit être présenté pour validation visuelle. Les fichiers d’historique ou d’évolution ne seront supprimés qu’après confirmation explicite de ce rendu.
