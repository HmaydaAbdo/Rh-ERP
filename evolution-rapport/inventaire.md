# Inventaire du rapport PDF Paie

Cet inventaire permet de retrouver le rapport existant dans le dépôt. Les fichiers de code restent dans leurs modules ; ce dossier racine rassemble les liens et l’historique pour préparer la prochaine version.

| Sujet | Emplacement | Rôle |
|---|---|---|
| Comportement et structure actuels | [`docs/report/README.md`](../docs/report/README.md) | Documentation de référence du rapport BI et de l’export Excel. |
| Construction des indicateurs | `backend/src/main/java/staport/rh/paie/report/PaieBiReportBuilder.java` | Agrège les bulletins et construit les vues globale, marché et équipe. |
| Modèle et pagination | `backend/src/main/java/staport/rh/paie/report/RapportPageModelBuilder.java`, `PageModel.java` | Découpe le contenu en pages et garde la pagination déterministe. |
| HTML, SVG et PDF | `backend/src/main/java/staport/rh/paie/report/PaieReportHtmlBuilder.java`, `RapportChartSvgBuilder.java`, `PaieReportHtmlPdfService.java` | Produit le document HTML, les graphiques et le PDF final. |
| Endpoint | `backend/src/main/java/staport/rh/paie/report/PaieReportController.java` | Expose `POST /paie/report/pdf`. |
| Apparence et polices | `backend/src/main/resources/report/paie/html/rapport.css`, `backend/src/main/resources/report/paie/fonts/`, `backend/src/main/resources/report/paie/logo-staport.png` | Styles imprimés, polices embarquées et logo. |
| Assistant d’export | `frontend/src/app/portail/paie/export/` | Étapes, état, sélection des marchés et équipes, génération du PDF/Excel. |
| Client et modèles Paie | `frontend/src/app/portail/paie/services/paie.service.ts`, `frontend/src/app/portail/paie/models/` | Appel de l’API et contrat de requête du rapport. |
| Permission d’export | [`docs/rbac/paie.md`](../docs/rbac/paie.md) | Documente `PAIE_EXPORT` pour l’export Excel et le PDF. |
| Audit d’accès | `backend/src/main/java/staport/rh/paie/audit/PerimetreRapportPdfPaie.java`, [`docs/audit/README.md`](../docs/audit/README.md) | Décrit la trace d’accès et son périmètre, sans enregistrer le contenu du rapport. |
| Contrôles du rendu et des données | `backend/src/test/java/staport/rh/paie/report/` | Tests du modèle, de la pagination, des graphiques SVG et du PDF rendu. Le CI est la preuve attendue pour cette tâche. |
| Anciennes décisions | [`rapport-v2.md`](rapport-v2.md) | Journal des rubriques retirées ou restructurées et des raisons associées. |
| Idées liées à la qualité des données | [`TODO.md`](../TODO.md), [`docs/function/README.md`](../docs/function/README.md) | Nettoyage des doublons de Fonction avant d’envisager sa répartition dans le rapport. |

## Changements déjà demandés pour le rapport

- La masse moyenne par employé doit disparaître à tous les niveaux.
- Les STC doivent distinguer le montant en DH et le nombre de personnes dans les vues concernées.
- La sélection des marchés de l’étape d’export PDF doit accepter plusieurs choix.
- Les graphiques doivent être réellement visibles dans le PDF, pas seulement dans le HTML intermédiaire.

Les trois premiers points sont présents sur `main` d’après le code fusionné par la PR #45. La PR #46 corrige le traitement SVG et ajoute une vérification graphique sur le PDF rendu ; attendre son CI vert avant de la considérer validée.

## Éléments à décider pour la prochaine version

Le journal et la documentation courante décrivent des fonctionnalités retirées pour des raisons précises : historique mensuel jugé trop court, doublons de libellés Fonction, sommaire peu utile et tableau redondant avec un graphique. Ce sont des pistes à réexaminer à partir du besoin de lecture et des données réelles, pas des ajouts automatiques.

Avant de dessiner une nouvelle rubrique, préciser son objectif métier, son niveau, sa définition de calcul et son unité. Le PDF final doit ensuite être examiné visuellement et confirmé par l’utilisateur avant toute suppression d’archives d’évolution.
