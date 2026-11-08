---
sidebar_position: 7
---

# Migration du domaine employee

Le portage FastAPI du domaine `employee` commence dans KAN-225 sur l'application unique. Le premier lot couvre le modèle
SQLAlchemy, validation des dates et affectations, CRUD REST, recherche paginée, verrou optimiste, RBAC et audit.

Le salaire et le type de salaire sont projetés uniquement avec `PAIE_READ`; les autres lecteurs ne peuvent ni les voir ni
les modifier. Les outils MCP de lecture `employes_rechercher` et `employe_fiche` suivent la même règle de périmètre.

L'import Excel, l'analytique, les sorties mensuelles et le rejeu de parité Spring restent à livrer avant la clôture de
KAN-225.

## Contrat de réponse et module Sorties (KAN-226)

La réponse d'un employé imbrique `fonction` (`id`, `libelle`), `chantier` (`id`, `code`, `designation`) et `equipe` (`id`, `code`,
`libelle`), comme `EmployeeResponseDto` de Spring ; Angular lit `employee.fonction.id` pour éditer une fiche. Les résumés sont
chargés en lot (une requête par table), jamais ligne par ligne. Preuve : `api/tests/test_employee.py`.

`POST /employees/sorties-mois` (permission `EMPLOYEE_READ`, lecture non auditée) prend `{ "periode": "AAAA-MM" }` et renvoie le
nombre de sorties du mois, leur répartition par motif (`NON_PRECISE` quand aucun motif n'est saisi) et la liste (`employeId`,
`nomPrenom`, `cin`, `motif`). Elle prolonge l'outil MCP Java `employes_sorties`. Décision du propriétaire (2026-11-07) : cette
donnée est la source du futur calcul automatique des STC et du suivi des abandons de poste ; elle est affichée dans un module
**Sorties** de la barre latérale (`/sorties`, permission `EMPLOYEE_READ`), distinct des vues des employés parce que le domaine
va s'enrichir. L'écran assemble le sélecteur de mois et le tableau du socle partagé.

## Import Excel : statuts (parité Spring, KAN-226)

`POST /employees/import` répond `400` avec le rapport (`totalLignes`, `crees: 0`, `ignores`, `lignesIgnorees`) dès qu'une ligne
est rejetée (import atomique), et `200` quand tout est créé. Un fichier illisible, vide ou de moins de six colonnes répond `400`
avec le message Spring (`Fichier Excel illisible : …`, `Fichier vide.`, `Format de fichier invalide : 6 colonnes attendues (…), N
trouvée(s).`) au lieu d'un `500`. Preuve : `api/tests/test_employee.py`.
