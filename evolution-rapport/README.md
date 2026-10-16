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

### Mise à jour du périmètre (2026-10-16)

Après validation de la maquette globale, la portée a été précisée : trois rubriques aux niveaux global
et chantier — évolution masse/effectif, évolution STC personnes/DH, puis répartition. Les deux
évolutions utilisent chacune un graphique à deux axes Y indépendants, avec unités, échelles, valeurs
et couleurs explicites. Au chantier, la répartition est par équipe si au moins une équipe est
sélectionnée, sinon par fonction ; la vue globale reste répartie par chantier. Les KPI et leurs
variations suivent les niveaux global, chantier et équipe. La ligne « Tous les marchés » et la
couverture textuelle de l'historique disparaissent de la vue d'ensemble ; la limite de 12 mois reste
interne et n'est mentionnée nulle part dans le rapport affiché.

## Décisions et pistes antérieures

- [`rapport-v2.md`](rapport-v2.md) décrit les retraits antérieurs, leurs raisons et les conditions éventuelles de réintroduction.
- La répartition globale par fonction reste une piste après nettoyage du référentiel Fonction, suivi dans [`TODO.md`](../TODO.md) ; elle apparaît déjà au niveau chantier quand aucune équipe n'est sélectionnée.
- L’évolution mensuelle masse/effectif avait été retirée faute d’historique suffisant. Sa réintroduction demande de vérifier que les périodes réellement disponibles rendent la tendance lisible.
- Le sommaire imprimé et le tableau redondant de répartition par équipe avaient été retirés pour limiter les pages ou éviter une répétition d’information.

Ces pistes ne sont pas des exigences validées de la prochaine version. Elles doivent être comparées au besoin de lecture actuel et aux données disponibles avant d’être ajoutées.

## Niveau 1 — Vue d’ensemble

### Existant vérifié

- Six KPI : masse salariale du mois, masse du mois précédent, effectif, nombre de marchés, STC en personnes et STC en DH.
- Un graphique horizontal par marché avec quatre séries (masse, effectif, STC personnes, STC DH), trié par masse décroissante ; les valeurs réelles sont affichées dans des colonnes dédiées.
- Les marchés choisis filtrent déjà les calculs ; le code de la courbe applique également ce filtre aux mois historiques.
- En vue d’ensemble, les barres représentent la part de chaque marché dans le total de sa série (échelle 0 à 100 %) ; les colonnes de valeurs conservent les valeurs réelles. Les graphiques des niveaux chantier/équipe gardent leur normalisation par maximum.
- La masse du mois précédent reste affichée dans sa propre carte ; la vue d’ensemble ajoute l’écart en DH et en pourcentage sous la masse courante.

### Décisions validées et évolution de la portée

1. L’indication de périmètre « Tous les marchés » avait été validée puis retirée après clarification : elle ne figure pas dans la vue d’ensemble.
2. Les quatre séries de répartition par chantier conservent les valeurs réelles et leurs parts avec une échelle de 0 à 100 %.
3. La carte « Masse salariale » conserve la masse du mois précédent et affiche l’écart en DH et en pourcentage aux niveaux global et chantier.
4. Le KPI « Effectif » affiche l’écart en personnes aux niveaux global et chantier.
5. Les niveaux global et chantier présentent les évolutions masse/effectif puis STC personnes/DH avant la répartition. Le calcul utilise au plus les 12 dernières périodes disponibles ; cette limite reste invisible dans le rapport. Au chantier, la répartition est par équipe si une équipe est sélectionnée, sinon par fonction.

**État :** cette évolution est implémentée dans la PR en cours. Les tests backend ciblés passent ; les contrôles CI et la revue visuelle du PDF restent à confirmer.

## Préparer la nouvelle version

Pour chaque ajout proposé, consigner ici ou dans une décision liée :

1. la question métier à laquelle le rapport doit répondre ;
2. le niveau concerné (global, marché, équipe ou employé) ;
3. la mesure, son unité et sa règle de calcul ;
4. les données disponibles pour la période choisie ;
5. la représentation attendue (KPI, tableau, graphique ou texte) ;
6. le résultat visuel à confirmer sur un PDF généré.

Le rendu PDF de la nouvelle version doit être présenté pour validation visuelle. Les fichiers d’historique ou d’évolution ne seront supprimés qu’après confirmation explicite de ce rendu.
