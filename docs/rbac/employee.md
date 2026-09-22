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
| Lien sidebar "Employés" | Aucune (visible dès qu'authentifié) |
| Route `/employees/**` | `authGuard` (authentification seule) |
| Bouton "Supprimer" (liste) | `authService.hasPermission('EMPLOYEE_DELETE')` — voir `EmployeeListComponent.canDelete()` |
| Boutons "Importer" / "Modèle Excel" | Aucune vérification frontend dédiée — repose sur le 403 backend si `EMPLOYEE_IMPORT` manque |

## Rôles disposant de ces permissions (seed initial)

`SYSTEM_ADMIN` et `PAIE_MANAGER` ont les quatre permissions (voir
`V4__seed_permissions_et_roles.sql`) — administrable ensuite via `/admin/roles`.
