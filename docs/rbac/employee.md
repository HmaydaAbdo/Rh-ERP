# RBAC — Employee

> Trace exhaustive des accès du module Employee. Toute évolution des autorisations de ce module
> met à jour ce fichier dans le même changement (conventions/security.md).

## Endpoints backend

| Endpoint | Permission (`@PreAuthorize`) |
|---|---|
| `POST /employees` | `EMPLOYEE_WRITE` |
| `PUT /employees/{id}` | `EMPLOYEE_WRITE` |
| `GET /employees/{id}` | `EMPLOYEE_READ` |
| `POST /employees/search` | `EMPLOYEE_READ` |
| `DELETE /employees/{id}` | `EMPLOYEE_DELETE` |
| `POST /employees/import` | `EMPLOYEE_IMPORT` |
| `GET /employees/import/modele` | `EMPLOYEE_IMPORT` |

## Frontend

| Élément | Condition |
|---|---|
| Lien sidebar « Employés » | `EMPLOYEE_READ` (`NAV_ITEMS`) |
| Routes `/employees` et `/employees/:id` | `authGuard` + `permissionGuard` (`EMPLOYEE_READ`) |
| Routes `/employees/new` et `/employees/:id/edit` | `authGuard` + `permissionGuard` (`EMPLOYEE_WRITE`) |
| Boutons « Nouvel employé » et « Modifier » (liste, détail) | `EMPLOYEE_WRITE` — `canWrite()` |
| Boutons « Importer » / « Modèle Excel » | `EMPLOYEE_IMPORT` — `canImport()` |
| Bouton « Supprimer » (liste) | `EMPLOYEE_DELETE` — `canDelete()` |

## Salaire : donnée de paie

Le salaire et son type (`salaire`, `typeSalaire`) ne sont visibles et modifiables qu'avec **`PAIE_READ`**, en plus de la
permission de l'endpoint. Sans elle, `EmployeeController` renvoie ces champs à `null` (consultation, recherche, réponse
d'une écriture), ignore ceux qui sont saisis (la fiche garde les siens) et retire un tri par salaire, qui dévoilerait leur
ordre. Le frontend suit la même règle : colonne Salaire de la liste, champs du formulaire et ligne de la consultation
n'apparaissent qu'avec `PAIE_READ` — tout comme le **parcours** de la fiche (`GET /paie/employes/{id}/parcours`, `PAIE_READ`). Les changements de salaire restent visibles dans l'historique d'audit (`AUDIT_READ`),
comme ceux d'un bulletin.

## Note — sélecteurs du formulaire

Le formulaire d'un employé interroge `/functions/search` et `/chantiers/search` : saisir un employé demande
donc aussi `FUNCTION_READ` et `CHANTIER_READ`, et `/equipes/search` pour l'équipe (`EQUIPE_READ`) (voir [README.md](README.md), « Dépendances entre permissions »).
L'import Excel résout fonctions et chantiers côté serveur (appels de service) : seul `EMPLOYEE_IMPORT` est requis.

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
