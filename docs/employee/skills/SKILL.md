---
name: erp-rh-employee
description: Use when changing employee records, import, assignment references, permissions, or UI in ERP-RH.
---

# Skill — domaine Employé

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/employee.md)
- [README Fonction](../../function/README.md) et [README Chantier](../../chantier/README.md) si les références changent
- [Règles d'import](../../imports.md), si l'import est concerné

## Périmètre

Fiche d'identité et situation actuelle de l'employé. Ce domaine consomme Fonction, Chantier et
Équipe via leurs façades de service; il ne dépend pas de leurs repositories. Les bulletins et le
parcours restent détenus par Paie. Cartes et Analytique utilisent les composants partagés configurés
par `employee-module.ts`, sans dupliquer leurs règles.

## Couches et points de contrôle

Le détail de chaque couche est dans le [README Employé](../README.md#les-couches-du-domaine). Avant de modifier le domaine,
repérer la couche touchée et vérifier ses points de contrôle.

| Couche | Ce qu'elle contient | À vérifier quand on la modifie |
|---|---|---|
| **Application** | `EmployeeController`, import d'ajout, `EmployeeService` / `IEmployeeService`, `ProjectionPaieEmployee` (salaire masqué sans `PAIE_READ`, partagée REST et MCP), audit `EMPLOYE_*`, migrations `V22`, `V27`, `V29` à `V33` ; côté Angular `portail/employee/` | CIN normalisé et unique (service **et** base) ; une fiche sortie n'a ni chantier ni équipe ; références résolues par les façades ; version optimiste ; salaire conservé à l'écriture sans droit ; entrée d'audit pour chaque écriture |
| **Analytique** | `POST /employees/analytique` et `/employees/regroupements` (fiches courantes, sans salaire), croisés avec `POST /paie/analytique` (bulletins) | Ne pas confondre état courant des fiches et historique des bulletins ; mêmes définitions âge, ancienneté, tranches ; groupes `0` = sans rattachement ; douze plus grands groupes dans les graphiques seulement |
| **IA** | `employes_rechercher`, `employe_fiche`, `employes_compter`, `employes_regrouper`, `employes_sorties` (`EMPLOYEE_READ`), `employe_parcours` (`PAIE_READ`) | Lecture seule ; salaire omis sans `PAIE_READ` ; vocabulaire `EN_POSTE` / `SORTI` ; descriptions d'outils à jour ; chaque nombre vérifié contre les outils ; pas de périmètre par fiche de poste avant J2 |

## Garde-fous

- CIN, champs obligatoires, statut, import d'ajout et restrictions de suppression suivent le README.
- Ne pas supprimer un employé lié à un bulletin ou à un compte utilisateur; le passage à « Sorti »
  conserve l'historique, sans affectation courante de chantier ou d'équipe.
- Naissance strictement passée dans API, formulaire et import; date d'embauche future permise mais
  exclue des embauches des douze derniers mois. Ne pas ajouter de règle d'âge ou d'ancienneté.
- Salaire et type sont conjoints, masqués sans `PAIE_READ`; préserver le salaire existant lors
  d'une écriture sans ce droit. La modification renvoie la version lue.
- Les critères nom/CIN/dimensions se conservent entre les vues et s'appliquent à la Paie et aux
  mouvements; le statut courant ne filtre pas l'historique. Ne jamais mélanger effectif courant et
  salariés payés comme une même mesure.
- Le backend reste l'autorité des permissions ; le frontend masque les actions interdites sans
  remplacer les contrôles serveur.
- Toute modification de permission, schéma ou règle métier met à jour RBAC, modèle de données ou
  README dans le même changement.

## Vérification

Tester unicité CIN, validations, références, import atomique, numéros réels des lignes Excel,
blocage de suppression, audit et refus RBAC. Vérifier les critères invalides et groupes sans
chantier/équipe, les bornes des embauches, la réponse tardive d'une ancienne recherche, le chargement,
l'erreur et le réessai de la fiche/formulaire/liste. Vérifier les deux thèmes, le téléphone et le
clavier dans l'application; les tests automatisés ne remplacent pas la revue visuelle.
Utiliser des données synthétiques; ne jamais copier des données personnelles en fixtures.
