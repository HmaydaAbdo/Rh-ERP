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
| Contrôles du rendu et des données | `backend/src/test/java/staport/rh/paie/report/` | Tests du modèle, de la pagination et des graphiques SVG. La PR #47 vérifie les pixels du graphique dans le PDF rasterisé aux niveaux Global et Chantier ; ses quatre checks CI ont réussi. La revue du PDF généré avec l’image déployée reste à confirmer par l’utilisateur. |
| Anciennes décisions | [`rapport-v2.md`](rapport-v2.md) | Journal des rubriques retirées ou restructurées et des raisons associées. |
| Idées liées à la qualité des données | [`TODO.md`](../TODO.md), [`docs/function/README.md`](../docs/function/README.md) | Nettoyage des doublons de Fonction avant d’envisager sa répartition dans le rapport. |

## Changements déjà demandés pour le rapport

- La masse moyenne par employé doit disparaître à tous les niveaux.
- Les STC doivent distinguer le montant en DH et le nombre de personnes dans les vues concernées.
- La sélection des marchés de l’étape d’export PDF doit accepter plusieurs choix.
- Les graphiques doivent être réellement visibles dans le PDF, pas seulement dans le HTML intermédiaire.

Les trois premiers points sont présents sur `main` d’après la PR #45. La PR #46 corrige le traitement SVG ; son CI de merge sur `main` (#282) est vert et a publié les images Docker. La validation visuelle du PDF généré avec cette image reste attendue.

## Éléments à décider pour la prochaine version

Le journal et la documentation courante décrivent des fonctionnalités retirées pour des raisons précises : historique mensuel jugé trop court, doublons de libellés Fonction, sommaire peu utile et tableau redondant avec un graphique. Ce sont des pistes à réexaminer à partir du besoin de lecture et des données réelles, pas des ajouts automatiques.

Avant de dessiner une nouvelle rubrique, préciser son objectif métier, son niveau, sa définition de calcul et son unité. Le PDF final doit ensuite être examiné visuellement et confirmé par l’utilisateur avant toute suppression d’archives d’évolution.

## Liens à nettoyer après validation de la prochaine version

La recherche globale `rg -n 'evolution-rapport|rapport-v2'` a retrouvé les liens ci-dessous. Ils pointent vers l’historique centralisé ; ils ne sont pas des copies de cet historique. Après confirmation explicite du PDF final, supprimer les fichiers d’évolution puis remplacer ces liens par les règles stables de [`docs/report/README.md`](../docs/report/README.md), ou les retirer s’ils ne sont plus utiles. Les références fonctionnelles du code doivent rester documentées près de leurs classes.

| Emplacement | Référence à l’historique |
|---|---|
| [`TODO.md`](../TODO.md) | Lien vers le dossier d’évolution. |
| [`docs/README.md`](../docs/README.md) | Lien vers le journal v2. |
| [`docs/report/README.md`](../docs/report/README.md) | Liens des décisions antérieures sur Fonction, l’évolution mensuelle, la pagination et les champs retirés. |
| [`docs/function/README.md`](../docs/function/README.md) | Lien expliquant le retrait de la répartition Fonction. |
| `backend/src/main/java/staport/rh/paie/report/EquipeBiVue.java` | Commentaire sur le chevauchement intentionnel des agrégats. |
| `backend/src/main/java/staport/rh/paie/report/ChantierBiVue.java` | Commentaires sur les décisions de détail du chantier et des équipes. |
| `backend/src/main/java/staport/rh/paie/report/SyntheseGlobaleVue.java` | Commentaire sur les champs conservés dans la synthèse. |
| `backend/src/main/java/staport/rh/paie/report/RepartitionBean.java` | Commentaire sur la mesure conservée mais retirée des graphiques. |
| `backend/src/main/java/staport/rh/paie/report/RapportBiVue.java` | Commentaire sur la décision de hiérarchie des vues. |
| `backend/src/main/java/staport/rh/paie/report/PaieBiReportBuilder.java` | Commentaires sur les agrégats historiques conservés côté calcul. |

La recherche n’a retrouvé aucune autre référence à ces deux chemins dans les fichiers du projet hors de ce tableau et des deux fichiers d’index de ce dossier. Les autres références au rapport (API, rendu, assistant d’export, permissions, tests et documentation métier) sont des références actives et doivent rester à leur emplacement.

## Carte des références actives du projet

Recherche de contenu effectuée sur le dépôt (hors `.git`, dépendances et sorties de build). Les chemins suivants décrivent le rapport ou le touchent directement ; ils restent dans leur module, car ils documentent ou implémentent un comportement actif.

- **Documentation produit et conventions** : [`README.md`](../README.md), [`TODO.md`](../TODO.md), [`docs/README.md`](../docs/README.md), [`docs/report/README.md`](../docs/report/README.md), [`docs/report/skills/SKILL.md`](../docs/report/skills/SKILL.md), [`docs/paie/README.md`](../docs/paie/README.md), [`docs/function/README.md`](../docs/function/README.md), [`docs/chantier/README.md`](../docs/chantier/README.md), [`docs/architecture.md`](../docs/architecture.md), [`docs/testing.md`](../docs/testing.md), [`docs/deployment.md`](../docs/deployment.md), [`docs/proposals/2026-10-10-staport-platform-standard-bi-ai.md`](../docs/proposals/2026-10-10-staport-platform-standard-bi-ai.md), [`docs/rbac/README.md`](../docs/rbac/README.md), [`docs/rbac/paie.md`](../docs/rbac/paie.md), [`docs/audit/README.md`](../docs/audit/README.md).
- **Génération backend** : `backend/src/main/java/staport/rh/paie/report/` (contrôleur, DTO de requête, agrégats et vues, pagination, construction HTML, SVG, ressources et service PDF) ; `backend/src/main/resources/report/paie/` (CSS, polices et logo) ; `backend/pom.xml` (dépendances PDF/SVG).
- **Données, périmètre et export backend** : `backend/src/main/java/staport/rh/paie/reporting/` (`PerimetrePaie`, `PaiePerimetreService`, `ObservationStc`, `MaterielChantierCatalogue`, `FeuillesEquipeMode`), `paie/repositories/` (`PaieRepository`, `EvolutionChantierEquipeProjection`), `paie/export/` (contrat et export Excel), `paie/audit/PerimetreRapportPdfPaie.java`, `paie/controller/PaieController.java`, `paie/imports/PaieImportController.java`, `paie/dtos/response/PaieAnalytiqueDto.java` et `chantier/entities/Chantier.java`. Le schéma du nom de chantier est décrit par `backend/src/main/resources/db/migration/V5__add_chantier_nom.sql`.
- **Contrôles backend** : `backend/src/test/java/staport/rh/paie/report/` (DTO, modèle, pagination, SVG et PDF de bout en bout), `backend/src/test/java/staport/rh/paie/performance/PerformanceProfileTest.java`, `backend/src/test/java/staport/rh/audit/AuditAccesTest.java`.
- **Assistant frontend** : `frontend/src/app/portail/paie/export/` (store, wizard, étapes et tests), `frontend/src/app/portail/paie/services/paie.service.ts` et son test, `frontend/src/app/portail/paie/models/paie.model.ts`, `frontend/src/app/portail/chantier/models/chantier.model.ts`, `frontend/src/app/portail/chantier/form/chantier-form.component.html` et `frontend/src/app/portail/audit/audit-format.ts`.
- **Exécution et limites HTTP** : `.github/workflows/ci.yml` construit et publie les images après validation ; `frontend/nginx.conf` définit la limite de débit des exports et rapports.

La recherche inclut aussi des occurrences lexicales génériques de « rapport » (par exemple les artefacts de couverture), qui ne désignent pas le PDF Paie et ne sont donc pas dans cette carte.
