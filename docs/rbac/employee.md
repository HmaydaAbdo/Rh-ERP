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

## Note — sélecteurs du formulaire

Le formulaire d'un employé interroge `/functions/search` et `/chantiers/search` : saisir un employé demande
donc aussi `FUNCTION_READ` et `CHANTIER_READ` (voir [README.md](README.md), « Dépendances entre permissions »).
L'import Excel résout fonctions et chantiers côté serveur (appels de service) : seul `EMPLOYEE_IMPORT` est requis.

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
